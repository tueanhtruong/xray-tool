import { fileURLToPath } from 'node:url'
import pkg from './package.json' with { type: 'json' }

const strictCompilerOptions = {
  strict: true,
  noUncheckedIndexedAccess: true,
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-29',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxt/eslint', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
    },
  },

  // Every key here is overridable at runtime by its NUXT_* env variable
  // (e.g. databaseUrl <- NUXT_DATABASE_URL). Values are validated at server
  // start by server/plugins/00.validate-config.ts, never at build time.
  runtimeConfig: {
    databaseUrl: '',
    integrationTarget: '',
    mockServicesUrl: '',
    atlassianAuthUrl: '',
    atlassianApiUrl: '',
    xrayBaseUrl: '',
    atlassianClientId: '',
    atlassianClientSecret: '',
    atlassianRedirectUri: '',
    jiraSiteUrlSuffixes: '',
    trustedProxyIps: '',
    encryptionKey: '',
    session: {
      password: '',
      maxAge: 60 * 60 * 24 * 7,
      cookie: {
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
      },
    },
    public: {
      appVersion: pkg.version,
    },
  },

  typescript: {
    strict: true,
    tsConfig: { compilerOptions: strictCompilerOptions },
    sharedTsConfig: { compilerOptions: strictCompilerOptions },
    nodeTsConfig: { compilerOptions: strictCompilerOptions },
  },

  hooks: {
    // Put our error handler first; Nuxt's own handler (HTML error page) stays behind it and
    // serves every request ours does not answer (see server/error-handler.ts).
    'nitro:config'(nitroConfig) {
      nitroConfig.errorHandler = [
        fileURLToPath(new URL('./server/error-handler.ts', import.meta.url)),
        ...[nitroConfig.errorHandler ?? []].flat(),
      ]
    },
  },

  nitro: {
    experimental: { asyncContext: true },
    typescript: {
      tsConfig: { compilerOptions: strictCompilerOptions },
    },
  },

  eslint: {
    config: {
      // Formatting is owned by Prettier (see eslint.config.mjs).
      stylistic: false,
    },
  },
})
