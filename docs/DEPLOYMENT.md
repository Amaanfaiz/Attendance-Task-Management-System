# Deploying to Azure

This deploys the app to Azure Container Apps with Azure Database for
PostgreSQL, per the SRS's recommended stack (§11). The Bicep template in
[`infra/main.bicep`](../infra/main.bicep) provisions everything except the
Azure subscription itself.

**Why this needs you, not me:** creating a subscription and resource group
touches your billing account. I can prepare and validate everything up to
that point, but the actual `az login` / resource creation should run under
your own Azure identity.

## One-time setup (you run this)

1. **Prerequisites:** an Azure subscription, and the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed locally.

2. **Log in and create a resource group:**
   ```bash
   az login
   az group create --name atms-rg --location eastus
   ```

3. **Deploy the infrastructure** (prompts for the DB password and JWT secrets — generate strong random values, don't reuse the dev ones from `.env.example`):
   ```bash
   az deployment group create \
     --resource-group atms-rg \
     --template-file infra/main.bicep \
     --parameters webOrigin=https://atms-web.<your-region>.azurecontainerapps.io \
     --parameters dbAdminPassword=<generate-a-strong-password> \
     --parameters jwtAccessSecret=<generate-a-random-64-char-string> \
     --parameters jwtRefreshSecret=<a-different-random-64-char-string>
   ```
   This creates: an Azure Container Registry, an Azure Database for
   PostgreSQL Flexible Server (with the backup policy from
   [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) already configured), a
   Container Apps environment, and placeholder API/web Container Apps
   (they'll fail to start until real images are pushed in the next step —
   that's expected).

4. **Run the database migration once**, from your machine, pointed at the new DB:
   ```bash
   DATABASE_URL="postgresql://atmsadmin:<password>@<dbHost-from-step-3-output>:5432/atms?sslmode=require" \
     npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
   DATABASE_URL="postgresql://atmsadmin:<password>@<dbHost>:5432/atms?sslmode=require" \
     npx prisma db seed --schema apps/api/prisma/schema.prisma
   ```
   **Change the seeded admin/employee passwords immediately after — see the
   README's seed table for the defaults, which must never reach production
   unchanged.**

5. **Let GitHub Actions build and deploy the real images.** Add these repository secrets (Settings → Secrets and variables → Actions):
   - `AZURE_CREDENTIALS` — output of `az ad sp create-for-rbac --name atms-deploy --role contributor --scopes /subscriptions/<sub-id>/resourceGroups/atms-rg --sdk-auth`
   - `ACR_NAME` — the registry name from the step-3 output (`acrLoginServer`, minus the `.azurecr.io` suffix)
   - `AZURE_RESOURCE_GROUP` — `atms-rg`

   Once those secrets exist, run the `deploy` workflow manually from the
   Actions tab (Actions → Deploy → Run workflow) — it builds both Docker
   images, pushes them to your registry, and updates both Container Apps to
   the new image. It does not run automatically on every push, so a bad
   build never touches production without you triggering it.

6. **Verify:** open the `webUrl` from the step-3 output, register/login,
   and run through the demo path in the README.

## What I've already validated locally

- Both Dockerfiles build and run correctly as a full stack (`docker compose up --build`).
- The API's `/api/v1/ready` endpoint (used by the Bicep readiness probe) checks real DB connectivity, not just process liveness.
- Migrations apply cleanly to a fresh database (tested against an isolated `atms_test` DB in CI).

## Current state

The Bicep template has been deployed against a real Azure subscription and is live —
see the README's "Live demo" section for the URL. Postgres currently runs on
`Standard_B2s` (Burstable tier, bumped once from the original `B1ms` after a real load
test found it undersized — see the tracker's RISK-007) and the Container Registry is on
the Basic tier. Both are cost-minimised for this delivery, not sized for real production
load at a larger organisation — review SKU choices before onboarding real users at scale.

## Database roles

The running API does **not** connect as `atmsadmin` (the Postgres server admin).
It connects as a separate, scoped role, `atms_app`, created with:

```sql
CREATE ROLE atms_app WITH LOGIN PASSWORD '<password>';
GRANT CONNECT ON DATABASE atms TO atms_app;
GRANT USAGE ON SCHEMA public TO atms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO atms_app;
```

`atms_app` has no `CREATE`/DDL rights, can't manage roles or databases, and can't
touch anything outside this one schema — if the API were ever compromised, the
blast radius is limited to its own application data, not the database server.
The Container App's `database-url` secret points at this role.

`atmsadmin` is still needed for `prisma migrate deploy` (step 4 above, and any
future migration) since DDL requires more than `atms_app` has — after applying
migrations, `atms_app`'s default privileges (the `ALTER DEFAULT PRIVILEGES`
statements above) automatically extend to any new tables/sequences a migration
creates, so this grant script doesn't need re-running after every migration,
only if the role itself is ever recreated.

## Staging environment

A second, fully separate deployment exists for pre-production verification —
see the README's "Live demo" section for the URL. It is provisioned by
[`infra/staging.bicep`](../infra/staging.bicep) and deployed by the
`deploy-staging.yml` GitHub Actions workflow (manual `workflow_dispatch`
only, entirely separate trigger from production's `deploy.yml` — promoting a
build to staging can never be confused with, or accidentally cause, a
production deploy).

Staging has its own Container Registry, its own PostgreSQL Flexible Server
(`Standard_B2s`, same tier as production, 7-day backup retention), its own
`atms_app` least-privilege database role (provisioned the same way as
production's — see "Database roles" above), its own JWT secrets, and its own
seeded accounts with unique, generated credentials (not the shared
`admin@atms.local` dev defaults). Both Container Apps run at the same specs
as production (`minReplicas: 1`, same CPU/memory) rather than scaling to
zero, so staging behaves like production under load rather than masking
cold-start effects.

**One architectural compromise:** this Azure subscription allows exactly one
Container Apps managed environment in total (confirmed live — a same-region
and a different-region deployment attempt were both rejected, with
`MaxNumberOfRegionalEnvironmentsInSubExceeded` and then
`MaxNumberOfGlobalEnvironmentsInSubExceeded`). A genuinely separate managed
environment would need a subscription-level quota increase. Staging's two
Container Apps therefore deploy into the *existing* production managed
environment (`infra/staging.bicep`'s `sharedEnv` resource references it via
Bicep's `existing` declaration, cross-resource-group), sharing only that
environment's networking boundary and Log Analytics destination. Every
application-level resource — registry, database, secrets, container images,
the apps themselves — is fully independent of production's; a bad staging
deploy cannot touch production's database, secrets, or running containers.

Live-verified end-to-end after the first real deploy: login with the staging
seed admin account, a real clock-in/clock-out via the browser session
succeeded (`200`/`200`), and the resulting row appeared correctly on the
staging Reports page.

To deploy to staging: run the `Deploy Staging` workflow manually from the
Actions tab. It requires the `STAGING_ACR_NAME` and
`STAGING_AZURE_RESOURCE_GROUP` repository secrets (alongside the existing
`AZURE_CREDENTIALS`) — set up once when staging was first provisioned.

## What's still open

- Custom domain + managed TLS certificate isn't set up — Container Apps' default `*.azurecontainerapps.io` domain ships with HTTPS already, which satisfies NFR-003 for the demo, but a real go-live would want your own domain.
