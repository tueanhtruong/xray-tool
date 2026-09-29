/**
 * xray-client.js
 * ---------------------------------------------------------------
 * Shared Xray Cloud and Jira Cloud API clients.
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");
const CONFIG_PATH = path.join(__dirname, "..", "api", "config.json");
const API_DIR = path.join(__dirname, "..", "api");
const TOKEN_CACHE_PATH = path.join(__dirname, ".xray-token.json");

function loadEnv() {
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function loadQuery(relativePath) {
  return fs.readFileSync(path.join(API_DIR, `${relativePath}.graphql`), "utf8");
}

function decodeJwtExpiryMs(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString("utf8"),
    );
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function readCachedToken() {
  if (!fs.existsSync(TOKEN_CACHE_PATH)) return null;
  try {
    const { token, expiresAt } = JSON.parse(
      fs.readFileSync(TOKEN_CACHE_PATH, "utf8"),
    );
    if (token && expiresAt && Date.now() < expiresAt - 60_000) return token;
  } catch {
    // Re-authenticate when the cache is unreadable.
  }
  return null;
}

function writeCachedToken(token) {
  const expiresAt = decodeJwtExpiryMs(token) || Date.now() + 23 * 60 * 60 * 1000;
  fs.writeFileSync(
    TOKEN_CACHE_PATH,
    JSON.stringify({ token, expiresAt }, null, 2),
    "utf8",
  );
}

async function authenticate() {
  const cached = readCachedToken();
  if (cached) return cached;

  const env = loadEnv();
  const clientId = env.XRAY_CLIENT_ID;
  const clientSecret = env.XRAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing XRAY_CLIENT_ID / XRAY_CLIENT_SECRET in .env (Project Settings > Xray API Keys).",
    );
  }

  const { xrayBaseUrl } = loadConfig();
  const res = await fetch(`${xrayBaseUrl}/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });

  if (!res.ok) {
    throw new Error(`Xray authenticate failed: ${res.status} ${await res.text()}`);
  }

  const token = await res.json();
  writeCachedToken(token);
  return token;
}

async function graphqlRequest(query, variables = {}) {
  const { xrayBaseUrl } = loadConfig();
  const token = await authenticate();

  const res = await fetch(`${xrayBaseUrl}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Xray GraphQL error: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

async function jiraRestRequest(endpoint, options = {}) {
  const env = loadEnv();
  const email = env.JIRA_EMAIL;
  const apiToken = env.JIRA_API_TOKEN;
  if (!email || !apiToken) {
    throw new Error(
      "Missing JIRA_EMAIL / JIRA_API_TOKEN in .env; required for Jira REST operations.",
    );
  }

  const { jiraBaseUrl = "https://oneline.atlassian.net" } = loadConfig();
  const res = await fetch(
    `${jiraBaseUrl.replace(/\/$/, "")}/rest/api/3${endpoint}`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
      },
      ...options,
      body: options.body && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
    },
  );

  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`Jira REST error: ${res.status} ${responseText}`);
  }
  return responseText ? JSON.parse(responseText) : null;
}

async function jiraRequest(issueKey, body) {
  await jiraRestRequest(`/issue/${encodeURIComponent(issueKey)}`, {
    method: "PUT",
    body,
  });
}

module.exports = {
  authenticate,
  graphqlRequest,
  jiraRequest,
  jiraRestRequest,
  loadConfig,
  loadQuery,
};
