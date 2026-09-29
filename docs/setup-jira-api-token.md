# Jira API-token sign-in

Use API-token sign-in when your organization does not allow Atlassian OAuth apps.

1. Create an Atlassian API token at <https://id.atlassian.com/manage-profile/security/api-tokens>.
2. On `/login`, choose **Use a Jira API token instead**.
3. Enter the Jira Cloud site URL (`https://your-site.atlassian.net`) or its REST API base URL (`https://your-site.atlassian.net/rest/api/3`), your Atlassian account email, and the API token.
4. Jira validates the credentials through its `/rest/api/3/myself` endpoint before the application creates a workspace or session.

The app stores the token encrypted at rest and never shows it again. Workspace settings show the authentication method, email, and token save date. Replace a token from settings; rejected replacements do not overwrite the current token. Disconnect removes the app's stored connection and clears the session. It does not revoke the token at Atlassian. To use a different auth method for the same site, disconnect first and reconnect.

## Supported Jira site URLs

The default allow-list accepts HTTPS hosts at `atlassian.net` or below it, for example
`https://acme.atlassian.net`. The exact Jira REST API base path `/rest/api/3` (with an optional
trailing slash) is also accepted and normalized to the site origin. Other paths, user information,
explicit ports, query strings, fragments, plain HTTP, IP addresses, and deceptive suffixes are
rejected before an outbound request.

Deployments may append comma-separated DNS suffixes using `NUXT_JIRA_SITE_URL_SUFFIXES`, for
example `corp.example.org`. Each configured suffix authorizes the application to send submitted
Basic credentials to HTTPS sites beneath that DNS suffix; configure only domains your organization
controls. Do not include schemes, ports, or paths.

## Reverse proxies and rate limiting

API-token sign-in is limited to 10 attempts per client IP in a rolling 60-second window, counted in
Postgres across app instances. The direct socket peer address is used unless it is listed in
`NUXT_TRUSTED_PROXY_IPS` as a comma-separated list of proxy IP addresses. Only then is
`X-Forwarded-For` considered, walking from the trusted edge toward the first untrusted address.
Leave the setting empty when requests do not arrive through a trusted proxy; forwarded headers are
otherwise ignored.
