# Backup and Restore Policy

Status: **policy defined, automation pending a provisioned production database**
(tracker: US-012-005 / AC-012-005-01..04). This document is the target
operational policy; the automated schedule itself is wired up as part of the
Azure deployment (see [DEPLOYMENT.md](DEPLOYMENT.md)), once a managed
Postgres instance exists to schedule backups against.

## RPO / RTO targets (AC-012-005-04)

| Metric | Target | Rationale |
|---|---|---|
| **RPO** (Recovery Point Objective) | 15 minutes | Azure Database for PostgreSQL Flexible Server supports continuous WAL archiving with point-in-time restore; 15 minutes is achievable without custom tooling. |
| **RTO** (Recovery Time Objective) | 4 hours | A single-organisation attendance system is business-important but not life-safety-critical; a same-business-day restore is an acceptable and realistic target for a small operational team. |

These targets should be reviewed and formally signed off by Amaan before
production launch — they're an engineering proposal, not a business decision.

## Backup mechanism (AC-012-005-01, AC-012-005-02)

Azure Database for PostgreSQL Flexible Server provides this natively once
provisioned:

- **Automated daily backups** with configurable retention (7–35 days;
  recommend 14 days for this project's scale).
- **Point-in-time restore** from continuous transaction log backups within
  the retention window (delivers the 15-minute RPO above).
- **Geo-redundant backup storage** (recommended for production — protects
  against a regional Azure outage, at modest extra cost).
- Backups are encrypted at rest by default (Azure-managed keys) and access
  is scoped to the resource group's RBAC — no separate configuration needed
  to satisfy "encrypted and access controlled."

No custom backup scripts or cron jobs are required — enabling this is a
configuration step at database provisioning time (see DEPLOYMENT.md).

## Restore procedure (AC-012-005-03)

1. In the Azure Portal (or `az postgres flexible-server restore`), select
   the source server and either a specific restore point in time or a
   daily backup.
2. Restore creates a **new** server instance — it does not overwrite the
   live database. This is deliberate: it lets you verify the restored data
   before cutting traffic over, and keeps the original server available as
   a fallback.
3. Point a scratch copy of the API (`DATABASE_URL` env var only, no code
   changes) at the restored instance and run:
   - `npx prisma migrate status` — confirm the schema matches what's expected.
   - Spot-check a handful of known records (e.g. the seeded admin/employee
     accounts, a recent attendance session) against what's expected.
4. Once verified, either:
   - **Point-in-time recovery drill (non-production):** discard the restored
     instance — the drill itself is the deliverable.
   - **Real incident:** update the API's `DATABASE_URL` (App Configuration /
     Container Apps secret) to the restored server, redeploy, and decommission
     the old instance once the new one is confirmed healthy.

## Testing cadence

Recommend a restore drill **once per quarter** at minimum, and always after
any major schema migration — restoring a backup taken before a destructive
migration is exactly the scenario this policy exists for. Log each drill
(date, what was verified, time taken) in this file or the audit trail so
"periodically tested" (AC-012-005-03) has evidence behind it, not just a
policy statement.

| Date | Type | Verified by | Notes |
|---|---|---|---|
| _(none yet — first drill scheduled once the production database exists)_ | | | |
