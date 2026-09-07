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

## What's still open

- The Bicep template hasn't been deployed against a real subscription (I have no Azure access) — it's written to the documented API shape but should be reviewed before a real deploy, particularly the SKU choices (`Standard_B1ms` / Basic ACR are cost-minimised for a demo, not sized for real production load).
- Custom domain + managed TLS certificate isn't set up — Container Apps' default `*.azurecontainerapps.io` domain ships with HTTPS already, which satisfies NFR-003 for the demo, but a real go-live would want your own domain.
