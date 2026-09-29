/**
 * xray-sync.js
 * ---------------------------------------------------------------
 * Shared helper to push a scenario's current Gherkin definition and
 * Test Repository folder to an already-existing Xray Cloud Test,
 * identified by its Jira issue key (e.g. "ONEDS-13859").
 *
 * Used by:
 *   - create-xray-tests.js: overwrites the Test when a scenario is
 *     already tagged with "@xray-<KEY>" (instead of skipping it).
 *   - update-xray-tests.js: syncs every tagged scenario on demand.
 * ---------------------------------------------------------------
 */

const { graphqlRequest, jiraRequest, loadQuery } = require("./xray-client");

// GraphQL operations (see api/map_id/*.graphql and api/update/*.graphql)
const GET_ISSUE_ID_QUERY = loadQuery("map_id/get-issue-id");
const UPDATE_GHERKIN_MUTATION = loadQuery("update/update-gherkin");
const UPDATE_FOLDER_MUTATION = loadQuery("update/update-folder");

/** Resolves the numeric issueId for a Jira issue key (e.g. "ONEDS-13859"). */
async function resolveIssueId(key) {
  const data = await graphqlRequest(GET_ISSUE_ID_QUERY, { jql: `key = "${key}"` });
  const result = data.getTests.results[0];
  if (!result) throw new Error(`No Test found in Jira for key ${key}`);
  return result.issueId;
}

/** Pushes the current summary, Gherkin definition, and folder to an existing Xray Test. */
async function updateExistingTest(key, gherkin, folderPath, summary) {
  const issueId = await resolveIssueId(key);
  if (summary) {
    await jiraRequest(key, { fields: { summary } });
  }
  await graphqlRequest(UPDATE_GHERKIN_MUTATION, { issueId, gherkin });
  await graphqlRequest(UPDATE_FOLDER_MUTATION, { issueId, folderPath });
  return issueId;
}

module.exports = { resolveIssueId, updateExistingTest };
