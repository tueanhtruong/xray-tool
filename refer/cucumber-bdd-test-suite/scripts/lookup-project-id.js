#!/usr/bin/env node
/**
 * lookup-project-id.js
 * ---------------------------------------------------------------
 * One-off helper: resolves the numeric Jira/Xray projectId for a
 * given project key, using the already-configured Xray API client
 * (no separate Jira REST credentials needed).
 *
 * Usage:
 *   node scripts/lookup-project-id.js ONEDS
 * ---------------------------------------------------------------
 */

const { graphqlRequest, loadQuery } = require("./xray-client");

// See api/map_id/get-project-id.graphql
const GET_TESTS_QUERY = loadQuery("map_id/get-project-id");

async function main() {
  const projectKey = process.argv[2];
  if (!projectKey) {
    console.error("Usage: node scripts/lookup-project-id.js <PROJECT_KEY>");
    process.exit(1);
  }

  const data = await graphqlRequest(GET_TESTS_QUERY, {
    jql: `project = "${projectKey}"`,
  });

  const result = data.getTests.results[0];
  if (!result) {
    console.error(
      `✗ No Test issues found for project "${projectKey}". Cannot infer projectId this way — ` +
        `create at least one Test manually first, or fetch it via Jira REST API (GET /rest/api/2/project/${projectKey}).`,
    );
    process.exit(1);
  }

  console.log(`projectKey: ${projectKey}`);
  console.log(`projectId:  ${result.projectId}`);
}

main().catch((err) => {
  console.error("✗ Unexpected error:", err.message);
  process.exit(1);
});
