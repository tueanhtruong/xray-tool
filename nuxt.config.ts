import pkg from './package.json' with { type: 'json' }

const strictCompilerOptions = {
  strict: true,
  noUncheckedIndexedAccess: true,
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-29',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxt/eslint'],

  css: ['~/assets/css/main.css'],

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
    encryptionKey: '',
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

  nitro: {
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
