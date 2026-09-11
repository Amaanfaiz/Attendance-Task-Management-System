# Attendance & Task Management System

A single-organisation web application for attendance tracking, break management, and task
time tracking, built to the SRS in [`docs/SRS_v1.0.docx`](docs/SRS_v1.0.docx). Delivery
status is tracked in [`docs/Requirements_Tracker_v1.0.xlsx`](docs/Requirements_Tracker_v1.0.xlsx).

The core idea: **attendance time and task time are two independent clocks.** An employee
clocks in/out and takes breaks (attendance clock); separately, they run a timer against
whichever task they're working on (task clock). The app reconciles the two to show
`Unallocated Time = Net Working Time − Task Time`.

## Architecture

Modular monolith, per the SRS's recommended stack:

```
apps/web    Next.js 16 (App Router) + TypeScript + Tailwind — client-rendered dashboard
apps/api    NestJS 10 + TypeScript — REST API, modular by domain
packages/shared   Zod schemas, enums, and the time-reconciliation math shared by both
```

Backend modules: `auth`, `users`, `attendance`, `breaks`, `tasks`, `task-timer`,
`reconciliation`, `corrections`, `audit`, `reports`, `settings`, `dashboard`.

Data: PostgreSQL via Prisma. Concurrency-critical invariants (at most one active
attendance session per user, at most one running task timer per user) are enforced by
**partial unique indexes at the database level** (see
`apps/api/prisma/migrations/*/migration.sql`), not just application logic.

Auth: HttpOnly cookies carrying a short-lived JWT access token plus an opaque, hashed,
rotating refresh token. Passwords hashed with Argon2id.

## Running locally

Prerequisites: Node 20+, Docker Desktop.

```bash
npm install
docker compose up -d postgres
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run prisma:migrate
npm run prisma:seed
npm run dev:api    # http://localhost:3001/api/v1  (Swagger at /api/docs)
npm run dev:web    # http://localhost:3000
```

`npm run prisma:seed` creates two **local-only** placeholder accounts, useful for getting
a fresh clone running immediately:

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@atms.local` | `Admin123!Change` |
| Employee | `employee@atms.local` | `Employee123!Change` |

> These are fixed defaults baked into `prisma/seed.ts`, not real credentials for any
> hosted environment — override them via `SEED_ADMIN_PASSWORD`/`SEED_EMPLOYEE_PASSWORD`
> for anything beyond a local database. Staging and production are always seeded with
> their own generated passwords (see [Live demo](#live-demo-azure) below) and never use
> these values.

## Live demo (Azure)

**https://atms-web.calmmeadow-ac85e2f9.centralus.azurecontainerapps.io** (production)

**https://atms-staging-web.calmmeadow-ac85e2f9.centralus.azurecontainerapps.io** (staging)

Hosted per [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) on Azure Container Apps + Azure
Database for PostgreSQL Flexible Server. Staging is a fully separate deployment (own
database, own images, own credentials) used to verify changes before they reach
production — see the "Staging environment" section of `docs/DEPLOYMENT.md` for how it's
provisioned and its one architectural compromise. Both environments have their own
dedicated admin/employee accounts, separate from the local seed defaults above — since
this is a public repository, ask the project owner for those credentials rather than
looking for them here.

## Running the full stack in Docker

```bash
docker compose up -d --build
```

Brings up Postgres, the API (port 3001) and the web app (port 3000) as three containers,
matching the images used in production deployment.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the Azure Container Apps deployment
procedure (Bicep template in [`infra/main.bicep`](infra/main.bicep) and a manual-trigger
GitHub Actions workflow). See [`docs/BACKUP_AND_RESTORE.md`](docs/BACKUP_AND_RESTORE.md)
for the backup policy and restore procedure.

## Tests

```bash
npm run test -w packages/shared   # unit tests for the reconciliation math
npm run test:e2e -w apps/api      # end-to-end API tests: full clock/timer/correction workflow
```

The e2e suite spins up a real NestJS app against an isolated `atms_test` Postgres database
and walks the exact critical path from the SRS: register → approve → login → clock in →
task timer → break (auto-pause) → resume → clock-out confirmation → reconciliation →
correction request/approval → audit trail → logout.

## Demo accounts and walkthrough

See the tracker's Dashboard sheet for delivery status. The intended demo path (both
Employee and Administrator perspectives) is:

1. Register a new account → sign in as admin → approve it.
2. As the employee: clock in, start a task timer, take a break (timer auto-pauses),
   end the break, resume the task, switch to a second task, stop it, clock out
   (confirming the active-timer warning), and review the day's timeline and totals.
3. As the admin: view the live attendance table, the KPI dashboard, approve a
   correction request, run an attendance/task-time/unallocated-time report and export
   it, and review the audit log.

## Known limitations

- **Password-reset and notification emails are undeliverable in production for any user
  other than the Resend account owner.** `EMAIL_FROM` is still Resend's shared sandbox
  address (`onboarding@resend.dev`); Resend rejects delivery to any other recipient until
  a custom domain is verified. The reset-token mechanism itself works correctly — this is
  specifically an email-delivery gap (tracker: DEF-022, RISK-009).
- Firefox (Gecko) has not been separately verified; the app has been confirmed working in
  Chrome, Edge and Safari.
