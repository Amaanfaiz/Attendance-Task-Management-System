// Provisions the production environment: Azure Container Registry, Azure Database
// for PostgreSQL Flexible Server, a Container Apps environment, and two Container
// Apps (api, web). Deploy with `az deployment group create` — see docs/DEPLOYMENT.md.
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
    name: 'Standard_B1ms'
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
          // Placeholder tag — the deploy workflow updates this to the built image digest.
          image: '${acr.properties.loginServer}/atms-api:latest'
          resources: { cpu: json('0.5'), memory: '1Gi' }
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
          image: '${acr.properties.loginServer}/atms-web:latest'
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

output acrLoginServer string = acr.properties.loginServer
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output dbHost string = dbServer.properties.fullyQualifiedDomainName
