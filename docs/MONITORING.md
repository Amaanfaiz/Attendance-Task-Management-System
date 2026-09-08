# Monitoring & Alerting (NFR-002)

Status: **live and verified.**

NFR-002 targets 99.9% monthly availability. Before this, nothing was
watching for downtime — a crash would have been silent until someone
happened to notice.

## What's running

- **Application Insights** (`atms-appinsights`), workspace-based, linked to
  the existing `atms-logs` Log Analytics workspace (already provisioned for
  container logs).
- **Availability test** (`atms-api-ready`): pings `GET /api/v1/ready` — the
  same readiness probe Container Apps itself uses, which checks real DB
  connectivity, not just process liveness — every 5 minutes, from 5
  geographically distinct US test locations.
- **Alert rule** (`atms-api-down-alert`): fires if 2 or more of those 5
  locations report failure within a 5-minute window. Severity 1.
- **Action group** (`atms-alerts`): emails `amanfaiz0020@gmail.com` when the
  alert fires.

Verified live 2026-09-08 — real test executions landing in Log Analytics
from multiple regions (West US, Central US, South Central US, East US,
North Central US), all reporting `Success: True`.

## How this was applied

Created directly via `az resource create` (webtests and the special
`WebtestLocationAvailabilityCriteria` metric alert type aren't supported by
the higher-level `az monitor` commands), **not** via a Bicep redeploy — see
the caution comment at the top of `infra/main.bicep`. The resources are
declared in Bicep for documentation/IaC-parity, using the same names, so a
future from-scratch deployment would recreate them identically.

## Changing the alert email

Either:
- Portal: Resource Groups → `atms-rg` → `atms-alerts` action group → edit
  the email receiver, or
- CLI: `az monitor action-group update --resource-group atms-rg --name atms-alerts --add-action email <name> <email>`

## Checking it yourself

```bash
az monitor log-analytics query \
  --workspace <atms-logs customerId> \
  --analytics-query "AppAvailabilityResults | where TimeGenerated > ago(1h) | order by TimeGenerated desc"
```

Or in the Portal: `atms-appinsights` → Availability, which shows the same
data as a map/timeline.

## What this doesn't cover

This only checks the API being reachable and DB-connected — it doesn't
alert on elevated latency (see [PERFORMANCE.md](PERFORMANCE.md) for that),
disk/storage pressure, or the web frontend specifically (though the web app
depends on the API for anything beyond the static login page, so an API
outage would surface there too). Sufficient for a single-organisation
deployment at current scale; worth revisiting if usage grows meaningfully.
