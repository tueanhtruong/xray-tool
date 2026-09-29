#!/usr/bin/env node

const p = require("@clack/prompts");
const {
  graphqlRequest,
  jiraRestRequest,
  loadConfig,
  loadQuery,
} = require("./xray-client");
const {
  collectXrayKeys,
  parseScenariosFromFile,
} = require("./gherkin-parser");
const { resolveFeatureFiles } = require("./common");

const GET_ISSUE_ID_QUERY = loadQuery("map_id/get-issue-id");
const CREATE_TEST_SET_MUTATION = loadQuery("create/create-test-set");
const CREATE_TEST_EXECUTION_MUTATION = loadQuery("create/create-test-execution");
const ADD_TESTS_TO_SET_MUTATION = loadQuery("create/add-tests-to-test-set");
const ADD_TESTS_TO_EXECUTION_MUTATION = loadQuery("create/add-tests-to-test-execution");

const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/;

function splitInput(value) {
  return (value || "")
    .split(/[,\n]/)
    .map((item) => item.trim().replace(/^(['"])(.*)\1$/, "$2"))
    .filter(Boolean);
}

function normalizeIssueKeys(value) {
  const keys = splitInput(value).map((key) => key.toUpperCase());
  const invalid = keys.filter((key) => !ISSUE_KEY_RE.test(key));
  if (invalid.length) {
    throw new Error(`Invalid Jira issue key(s): ${invalid.join(", ")}`);
  }
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicates.length) {
    throw new Error(`Duplicate Test Case key(s): ${[...new Set(duplicates)].join(", ")}`);
  }
  if (!keys.length) throw new Error("At least one Test Case key is required.");
  return keys;
}

function collectFeatureTestKeys(files) {
  const scenarios = files.flatMap((file) => parseScenariosFromFile(file));
  const result = collectXrayKeys(scenarios);
  if (result.untagged.length) {
    throw new Error(
      `Feature contains scenario(s) without @xray-KEY: ${result.untagged.join(", ")}`,
    );
  }
  if (!result.keys.length) throw new Error("No @xray-KEY tags found in the feature file(s).");
  return result.keys;
}

function resolveLinkDirection(linkTypes, label) {
  const matches = [];
  for (const type of linkTypes) {
    if (type.outward === label) matches.push({ typeName: type.name, rootSide: "outward" });
    if (type.inward === label) matches.push({ typeName: type.name, rootSide: "inward" });
  }
  if (matches.length !== 1) {
    throw new Error(
      `Link direction "${label}" must match exactly one Jira inward/outward description; found ${matches.length}.`,
    );
  }
  return matches[0];
}

function issueLinkBody(rootKey, targetKey, direction) {
  const rootIssue = { key: rootKey };
  const targetIssue = { key: targetKey };
  return {
    type: { name: direction.typeName },
    inwardIssue: direction.rootSide === "inward" ? rootIssue : targetIssue,
    outwardIssue: direction.rootSide === "outward" ? rootIssue : targetIssue,
  };
}

async function getIssue(issueKey) {
  return jiraRestRequest(`/issue/${encodeURIComponent(issueKey)}?fields=summary,project,issuelinks`);
}

async function getLinkTypes() {
  const response = await jiraRestRequest("/issueLinkType");
  return response.issueLinkTypes || [];
}

async function resolveTestIssueId(key) {
  const data = await graphqlRequest(GET_ISSUE_ID_QUERY, {
    jql: `key = "${key}"`,
  });
  const result = data.getTests?.results?.[0];
  if (!result || result.jira?.key !== key) {
    throw new Error(`Could not resolve Xray Test issue ID for ${key}.`);
  }
  return result.issueId;
}

async function createXrayIssue(mutation, fieldName, projectKey, summary) {
  const variables = { jira: { fields: { project: { key: projectKey }, summary } } };
  const data = await graphqlRequest(mutation, variables);
  const created = data[fieldName]?.testSet || data[fieldName]?.testExecution;
  if (!created?.issueId || !created.jira?.key) {
    throw new Error(`Xray did not return a key for ${fieldName}.`);
  }
  return created;
}

async function addTests(mutation, variableName, issueId, testIssueIds) {
  await graphqlRequest(mutation, {
    [variableName]: issueId,
    testIssueIds,
  });
}

async function run() {
  p.intro("Xray · Create Test Set and Test Executions");
  const config = loadConfig();

  const rootKeyInput = await p.text({
    message: "Jira ticket ID",
    placeholder: "ONEDS-13700",
    validate: (value) => {
      if (!ISSUE_KEY_RE.test((value || "").trim().toUpperCase())) return "Enter a valid Jira issue key.";
    },
  });
  if (p.isCancel(rootKeyInput)) return p.cancel("Cancelled.");
  const rootKey = rootKeyInput.trim().toUpperCase();

  const rootIssue = await getIssue(rootKey);
  const summary = rootIssue.fields?.summary;
  const projectKey = rootIssue.fields?.project?.key;
  if (!summary || !projectKey) throw new Error(`Jira ticket ${rootKey} has no summary/project.`);

  const inputMode = await p.select({
    message: "How should Test Cases be selected?",
    options: [
      { value: "keys", label: "Enter Test Case IDs" },
      { value: "features", label: "Scan feature file links" },
    ],
  });
  if (p.isCancel(inputMode)) return p.cancel("Cancelled.");

  const testsInput = await p.text({
    message: inputMode === "keys" ? "Test Case IDs (comma/newline separated)" : "Feature file path(s) or directory",
    placeholder: inputMode === "keys" ? "ONEDS-12345, ONEDS-12346" : config.featureRoot || "src/feature",
  });
  if (p.isCancel(testsInput)) return p.cancel("Cancelled.");

  let testKeys;
  if (inputMode === "keys") {
    testKeys = normalizeIssueKeys(testsInput);
  } else {
    const files = resolveFeatureFiles(testsInput, config.featureRoot || "src/feature");
    if (!files.length) throw new Error("No .feature files found at the given path(s).");
    testKeys = collectFeatureTestKeys(files);
  }

  const linkTypes = await getLinkTypes();
  const directions = {
    testSet: resolveLinkDirection(linkTypes, config.issueLinkDirections?.testSet || "is tested by"),
    testExecution: resolveLinkDirection(linkTypes, config.issueLinkDirections?.testExecution || "is tested by"),
  };
  const targets = [
    { kind: "testSet", direction: directions.testSet },
    { kind: "testExecution", direction: directions.testExecution },
    { kind: "testExecution", direction: directions.testExecution },
  ];
  for (const target of targets) {
    if ((rootIssue.fields?.issuelinks || []).some((link) => link.type?.name === target.direction.typeName)) {
      throw new Error(`Jira ticket ${rootKey} already has a ${target.kind} link of type ${target.direction.typeName}.`);
    }
  }

  const testIssueIds = [];
  for (const key of testKeys) testIssueIds.push(await resolveTestIssueId(key));

  const testSet = await createXrayIssue(
    CREATE_TEST_SET_MUTATION,
    "createTestSet",
    projectKey,
    summary,
  );
  const devExecution = await createXrayIssue(
    CREATE_TEST_EXECUTION_MUTATION,
    "createTestExecution",
    projectKey,
    `[DEV] - ${summary}`,
  );
  const qaExecution = await createXrayIssue(
    CREATE_TEST_EXECUTION_MUTATION,
    "createTestExecution",
    projectKey,
    `[QA] - ${summary}`,
  );

  await addTests(ADD_TESTS_TO_SET_MUTATION, "issueId", testSet.issueId, testIssueIds);
  await addTests(ADD_TESTS_TO_EXECUTION_MUTATION, "issueId", devExecution.issueId, testIssueIds);
  await addTests(ADD_TESTS_TO_EXECUTION_MUTATION, "issueId", qaExecution.issueId, testIssueIds);

  await jiraRestRequest("/issueLink", {
    method: "POST",
    body: issueLinkBody(rootKey, testSet.jira.key, directions.testSet),
  });
  await jiraRestRequest("/issueLink", {
    method: "POST",
    body: issueLinkBody(rootKey, devExecution.jira.key, directions.testExecution),
  });
  await jiraRestRequest("/issueLink", {
    method: "POST",
    body: issueLinkBody(rootKey, qaExecution.jira.key, directions.testExecution),
  });

  p.log.success(`Test Set: ${testSet.jira.key}`);
  p.log.success(`DEV Execution: ${devExecution.jira.key}`);
  p.log.success(`QA Execution: ${qaExecution.jira.key}`);
  p.outro(`${testKeys.length} Test Case(s) added and linked to ${rootKey}.`);
}

if (require.main === module) {
  run().catch((err) => {
    p.log.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  collectFeatureTestKeys,
  issueLinkBody,
  normalizeIssueKeys,
  resolveLinkDirection,
  run,
};
