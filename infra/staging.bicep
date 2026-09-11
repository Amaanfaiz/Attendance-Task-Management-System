// Provisions the Staging environment (RISK-012): its own Container Registry, its own
// Postgres Flexible Server, and two Container Apps (atms-staging-api, atms-staging-web)
// with the same per-app specs as production (minReplicas: 1, same CPU/memory) — but
// deployed into the *existing* production Container Apps managed environment, not a
// new one. This subscription has a hard platform limit of exactly one Container Apps
// managed environment total (confirmed live: both a same-region and a different-region
// deployment attempt were rejected with MaxNumberOfGlobalEnvironmentsInSubExceeded) —
// a genuinely separate managed environment isn't available without an Azure quota
// increase. Sharing the environment shell (its networking boundary and Log Analytics
// destination) is the one compromise from a true full mirror; every application-level
// resource below — registry, database, secrets, images, the apps themselves — is fully
// independent of production's.
targetScope = 'resourceGroup'

@description('Short project prefix used to name every staging resource.')
param namePrefix string = 'atms-staging'

@description('Azure region for staging resources. Should match the existing Container Apps environment\'s region.')
param location string = 'centralus'

@description('Resource group the existing production Container Apps environment lives in.')
param sharedEnvironmentResourceGroup string = 'atms-rg'

@description('Name of the existing Container Apps managed environment to deploy into.')
param sharedEnvironmentName string = 'atms-env'

@description('Administrator login for the staging PostgreSQL server.')
param dbAdminLogin string = 'atmsadmin'

@secure()
@description('Administrator password for the staging PostgreSQL server.')
param dbAdminPassword string

@secure()
@description('JWT access token signing secret (staging - must differ from production).')
param jwtAccessSecret string

@secure()
@description('JWT refresh token signing secret (staging - must differ from production).')
param jwtRefreshSecret string

@description('Public URL of the staging web frontend, used for the API CORS allow-list. Fix up with the real FQDN after first deploy (see docs/DEPLOYMENT.md).')
param webOrigin string

var acrName = replace('${namePrefix}acr${uniqueString(resourceGroup().id)}', '-', '')
var dbServerName = '${namePrefix}-db-${uniqueString(resourceGroup().id)}'
var apiAppName = '${namePrefix}-api'
var webAppName = '${namePrefix}-web'

resource sharedEnv 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: sharedEnvironmentName
  scope: resourceGroup(subscription().subscriptionId, sharedEnvironmentResourceGroup)
}

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
    name: 'Standard_B2s'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminLogin
    administratorLoginPassword: dbAdminPassword
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
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

resource apiApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: apiAppName
  location: location
  properties: {
    managedEnvironmentId: sharedEnv.id
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
          // Bootstrap placeholder - deploy-staging.yml's `az containerapp update --image ...`
          // replaces this with the real image on the first real deploy (same pattern as prod).
          image: 'mcr.microsoft.com/k8se/quickstart:latest'
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'JWT_ACCESS_SECRET', secretRef: 'jwt-access-secret' }
            { name: 'JWT_REFRESH_SECRET', secretRef: 'jwt-refresh-secret' }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3001' }
            { name: 'COOKIE_SECURE', value: 'true' }
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
    managedEnvironmentId: sharedEnv.id
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
          image: 'mcr.microsoft.com/k8se/quickstart:latest'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

output acrLoginServer string = acr.properties.loginServer
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output dbHost string = dbServer.properties.fullyQualifiedDomainName
