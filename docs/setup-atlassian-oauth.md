# Set up Atlassian OAuth 2.0 (3LO)

US-02 sign-in uses an Atlassian developer app and OAuth 2.0 authorization-code flow.

## Create the Atlassian app

1. Open the [Atlassian developer console](https://developer.atlassian.com/console/myapps/) and create an OAuth 2.0 integration.
2. Enable OAuth 2.0 (3LO) and add the exact callback URL used by this deployment. For local development it is `http://localhost:3000/auth/jira/callback`.
3. Add these scopes:
   - `read:jira-work`
   - `write:jira-work`
   - `read:jira-user`
   - `read:me` (required for the Atlassian User Identity API profile request to `/me`)
   - `offline_access` (required to receive a refresh token)
4. Copy the app's client ID and client secret into the local `.env` or deployment secret store. Never commit or paste real credentials into source, fixtures, logs, or chat.

Enable the Jira API permission for Jira scopes and the **User Identity API** permission for
`read:me` in the developer console. The account ID is the stable identity; profile name, email, and
avatar may be absent depending on account privacy settings.

## Configure the application

Set the following in `.env` (created from `.env.example`) or your deployment environment:

```dotenv
NUXT_ATLASSIAN_CLIENT_ID=<client-id>
NUXT_ATLASSIAN_CLIENT_SECRET=<client-secret>
NUXT_ATLASSIAN_REDIRECT_URI=http://localhost:3000/auth/jira/callback
NUXT_SESSION_PASSWORD=<at-least-32-random-characters>
NUXT_ENCRYPTION_KEY=<32-random-bytes-as-base64>
```

Generate session and encryption values independently with `openssl rand -base64 32`. Keep
`NUXT_SESSION_PASSWORD` stable across app instances that share sessions and keep
`NUXT_ENCRYPTION_KEY` stable for as long as encrypted connection data exists. The server can start
without Atlassian OAuth settings, but sign-in is unavailable until all OAuth values are configured.

The callback URL must match exactly across the developer console, `NUXT_ATLASSIAN_REDIRECT_URI`,
and the URL used by the browser. Use HTTPS in deployed environments.

## Local mock mode

Automated tests use `NUXT_INTEGRATION_TARGET=mock` and do not require real Atlassian credentials.
Run `pnpm mock` to start deterministic OAuth/Jira endpoints on port 4010, or let the integration/e2e
test runner start it. Mock identities, sites, and tokens are fake and must never be replaced with
production responses.
