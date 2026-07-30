import packageJson from '../package.json'

export interface AppInfo {
  name: string
  version: string
  organization: {
    name: string
    url: string
  }
  repository: {
    name: string
    url: string
  }
  environment: string
  commitSha?: string
  buildDate?: string
}

export function getAppInfo(): AppInfo {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || packageJson.version || '0.1.0'
  
  const rawEnv = (process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'development').toLowerCase()
  const environment = rawEnv === 'production' 
    ? 'Production' 
    : rawEnv === 'staging' 
    ? 'Staging' 
    : rawEnv === 'preview'
    ? 'Preview'
    : 'Development'

  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA
    ? process.env.NEXT_PUBLIC_COMMIT_SHA.slice(0, 7)
    : undefined

  const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE

  return {
    name: 'Ananya',
    version,
    organization: {
      name: '48 Studios',
      url: 'https://48studios.in',
    },
    repository: {
      name: 'GitHub',
      url: 'https://github.com/jrsarath/Ananya',
    },
    environment,
    commitSha,
    buildDate,
  }
}
