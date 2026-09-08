// Provisions the production environment: Azure Container Registry, Azure Database
// for PostgreSQL Flexible Server, a Container Apps environment, and two Container
// Apps (api, web). Deploy with `az deployment group create` — see docs/DEPLOYMENT.md.
//
// CAUTION — do not blindly re-run this against an already-live environment: both
// container apps' `image:` property below is hardcoded to the bootstrap placeholder
// (see the comments on those resources). A full redeploy would reset a live site's
// real images back to that placeholder. Monitoring resources (Application Insights,
// the availability webtest, action group, alert rule — see bottom of file) were
// applied directly via `az resource create` for exactly this reason, not through a
// redeploy; they're declared here for documentation/IaC parity, not as something to
// blindly `az deployment group create` again without first reviewing what it would
// actually change.
targetScope = 'resourceGroup'

@description('Short project prefix used to name every resource, e.g. "atms".')
param namePrefix string = 'atms'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Administrator login for the PostgreSQL server.')
param dbAdminLogin string = 'atmsadmin'

@secure()
@description('Administrator password for the PostgreSQL server. Pass via --parameters at deploy time, never commit a value.')
param dbAdminPassword string

@secure()
@description('JWT access token signing secret.')
param jwtAccessSecret string

@secure()
@description('JWT refresh token signing secret.')
param jwtRefreshSecret string

@description('Public URL of the web frontend, used for the API CORS allow-list.')
param webOrigin string

@description('Email address that receives downtime alerts (NFR-002).')
param alertEmail string = 'amanfaiz0020@gmail.com'

var acrName = replace('${namePrefix}acr${uniqueString(resourceGroup().id)}', '-', '')
var dbServerName = '${namePrefix}-db-${uniqueString(resourceGroup().id)}'
var envName = '${namePrefix}-env'
var apiAppName = '${namePrefix}-api'
var webAppName = '${namePrefix}-web'
var logAnalyticsName = '${namePrefix}-logs'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

resource dbServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: dbServerName
  location: location
  sku: {
    // Bumped from B1ms after a load test (docs/PERFORMANCE.md, RISK-007) showed
    // write-path endpoints exceeding the NFR-001 p95<500ms target under just 12
    // concurrent writers — consistent with B1ms's single vCore running out of
    // burst credit. B2s doubles vCores/credit pool at roughly 2x cost; escalate
    // to a General Purpose SKU only once a real multi-employee org is onboarded.
    name: 'Standard_B2s'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminLogin
    administratorLoginPassword: dbAdminPassword
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 14
      geoRedundantBackup: 'Disabled' // set 'Enabled' for production-grade DR, see docs/BACKUP_AND_RESTORE.md
    }
    highAvailability: { mode: 'Disabled' }
  }
}

resource dbFirewallAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: dbServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource dbDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: dbServer
  name: 'atms'
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource apiApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: apiAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3001
        allowInsecure: false
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        { name: 'database-url', value: 'postgresql://${dbAdminLogin}:${dbAdminPassword}@${dbServer.properties.fullyQualifiedDomainName}:5432/atms?sslmode=require' }
        { name: 'jwt-access-secret', value: jwtAccessSecret }
        { name: 'jwt-refresh-secret', value: jwtRefreshSecret }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          // Container Apps requires a pullable image at creation time — atms-api:latest
          // doesn't exist in a freshly-created, empty registry, and the deployment fails
          // outright if it's referenced here (confirmed: "MANIFEST_UNKNOWN"). Bootstrap
          // with Microsoft's own public quickstart image; the deploy workflow's
          // `az containerapp update --image ...` step replaces it with the real one on
          // the first real deploy.
          image: 'mcr.microsoft.com/k8se/quickstart:latest'
          // Doubled from 0.5/1Gi after the same load test (docs/PERFORMANCE.md,
          // RISK-007) found write-path p95 latency exceeding target — Argon2id
          // hashing and Prisma writes are the CPU-bound work on this container.
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'JWT_ACCESS_SECRET', secretRef: 'jwt-access-secret' }
            { name: 'JWT_REFRESH_SECRET', secretRef: 'jwt-refresh-secret' }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3001' }
            { name: 'COOKIE_SECURE', value: 'true' }
            // api and web get separate *.azurecontainerapps.io subdomains, so the
            // auth cookies are cross-site from the browser's point of view — see
            // cookie.util.ts. 'none' forces Secure regardless of COOKIE_SECURE above.
            { name: 'COOKIE_SAME_SITE', value: 'none' }
            { name: 'WEB_ORIGIN', value: webOrigin }
          ]
          probes: [
            {
              type: 'Readiness'
              httpGet: { path: '/api/v1/ready', port: 3001 }
              periodSeconds: 15
            }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

resource webApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: webAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        allowInsecure: false
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          // See the matching comment on the api container above — same bootstrap issue.
          image: 'mcr.microsoft.com/k8se/quickstart:latest'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NEXT_PUBLIC_API_URL', value: 'https://${apiApp.properties.configuration.ingress.fqdn}' }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// --- Monitoring (NFR-002): Application Insights availability test on the API's
// /api/v1/ready endpoint, checked from 5 global locations every 5 minutes, alerting
// by email if 2+ locations report failure for 5+ minutes straight. Applied directly
// via `az resource create` on 2026-09-08 (see the CAUTION note at the top of this
// file) — declared here so the live config has a source-controlled record.

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-appinsights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource alertActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${namePrefix}-alerts'
  location: 'global'
  properties: {
    groupShortName: 'atmsalert'
    enabled: true
    emailReceivers: [
      { name: 'owner', emailAddress: alertEmail, useCommonAlertSchema: false }
    ]
  }
}

resource apiAvailabilityTest 'Microsoft.Insights/webtests@2022-06-15' = {
  name: '${namePrefix}-api-ready'
  location: location
  kind: 'ping'
  tags: {
    'hidden-link:${appInsights.id}': 'Resource'
  }
  properties: {
    SyntheticMonitorId: '${namePrefix}-api-ready'
    Name: '${namePrefix}-api-ready'
    Description: 'Pings the API\'s /api/v1/ready endpoint, which checks real DB connectivity.'
    Enabled: true
    Frequency: 300
    Timeout: 30
    Kind: 'ping'
    RetryEnabled: true
    Locations: [
      { Id: 'us-tx-sn1-azr' }
      { Id: 'us-il-ch1-azr' }
      { Id: 'us-ca-sjc-azr' }
      { Id: 'us-va-ash-azr' }
      { Id: 'us-fl-mia-edge' }
    ]
    Configuration: {
      WebTest: '<WebTest Name="${namePrefix}-api-ready" Enabled="True" Timeout="30" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010"><Items><Request Method="GET" Guid="4347da77-4702-4979-b848-45e0067f6eb0" Version="1.1" Url="https://${apiApp.properties.configuration.ingress.fqdn}/api/v1/ready" ThinkTime="0" Timeout="30" ParseDependentRequests="False" FollowRedirects="True" RecordResult="True" Cache="False" ResponseTimeGoal="0" Encoding="utf-8" ExpectedHttpStatusCode="200" ExpectedResponseUrl="" ReportingName="" IgnoreHttpStatusCode="False" /></Items></WebTest>'
    }
  }
}

resource apiDownAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${namePrefix}-api-down-alert'
  location: 'global'
  properties: {
    severity: 1
    enabled: true
    scopes: [apiAvailabilityTest.id, appInsights.id]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    description: 'Fires when the API\'s /api/v1/ready check fails from more than 2 of 5 test locations.'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.WebtestLocationAvailabilityCriteria'
      webTestId: apiAvailabilityTest.id
      componentId: appInsights.id
      failedLocationCount: 2
    }
    actions: [
      { actionGroupId: alertActionGroup.id }
    ]
  }
}

output acrLoginServer string = acr.properties.loginServer
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output dbHost string = dbServer.properties.fullyQualifiedDomainName
