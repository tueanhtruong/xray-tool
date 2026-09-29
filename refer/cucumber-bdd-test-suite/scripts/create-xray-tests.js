#!/usr/bin/env node
/**
 * create-xray-tests.js
 * ---------------------------------------------------------------
 * Parses Gherkin .feature files and creates Xray Cloud Cucumber
 * Tests directly via the Xray GraphQL API (no manual Jira UI
 * import step needed).
 *
 * Scenarios already tagged "@xray-<KEY>" (from a previous run) are
 * NOT skipped — their existing Xray Test is overwritten in place
 * with the current Gherkin definition and folder instead of
 * creating a duplicate.
 *
 * The Test Repository folder path is derived from each feature
 * file's location under `featureRoot` (see api/config.json), and
 * is created automatically if it does not exist yet on Jira.
 *
 * Example (featureRoot: "src/feature"):
 *   src/feature/test-flow/foo.feature  ->  folder "/test-flow"
 *   src/feature/foo.feature            ->  folder "/"
 *
 * Usage:
 *   pnpm create-xray-tests   (standalone)
 *   pnpm xray                (interactive menu -> "Create test case")
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const p = require("@clack/prompts");
const {
  parseScenariosFromFile,
  extractXrayKey,
  insertXrayTag,
} = require("./gherkin-parser");
const { graphqlRequest, loadConfig, loadQuery } = require("./xray-client");
const { resolveFeatureFiles, folderPathFor } = require("./common");
const { updateExistingTest } = require("./xray-sync");

// ── GraphQL operations (see api/create/*.graphql) ─────────────────

const GET_FOLDER_QUERY = loadQuery("create/get-folder");
const CREATE_FOLDER_MUTATION = loadQuery("create/create-folder");
const CREATE_TEST_MUTATION = loadQuery("create/create-test");

const ensuredFolders = new Set();

/** Ensure the given Test Repository folder exists, creating it if missing. */
async function ensureFolder(projectId, folderPath) {
  if (ensuredFolders.has(folderPath)) return;
  ensuredFolders.add(folderPath);

  let exists = false;
  try {
    const data = await graphqlRequest(GET_FOLDER_QUERY, { projectId, path: folderPath });
    exists = Boolean(data.getFolder);
  } catch {
    exists = false; // getFolder errors when the path doesn't exist yet
  }
  if (exists) return;

  try {
    await graphqlRequest(CREATE_FOLDER_MUTATION, { projectId, path: folderPath });
    p.log.step(`created folder ${folderPath}`);
  } catch (err) {
    p.log.warn(`could not create folder ${folderPath}: ${err.message}`);
  }
}

// ── main ─────────────────────────────────────────────────────────

async function run(title = "Create test case") {
  p.intro(`Xray · ${title}`);

  const config = loadConfig();
  if (!config.projectKey || !config.projectId) {
    p.log.error(
      'Missing "projectKey" and/or "projectId" in api/config.json. Fill them in before running this script.',
    );
    return p.outro("Failed.");
  }

  const defaultPath = config.featureRoot || "src/feature";
  const pathsInput = await p.text({
    message: "Path(s) to .feature file or directory (comma-separated for multiple)",
    placeholder: defaultPath,
  });
  if (p.isCancel(pathsInput)) return p.cancel("Cancelled.");

  const labelsInput = await p.text({
    message: "Labels (comma-separated, e.g. Automated,Regression)",
    placeholder: "(none)",
  });
  if (p.isCancel(labelsInput)) return p.cancel("Cancelled.");

  const labels = (labelsInput || "").trim()
    ? labelsInput.split(",").map((l) => l.trim()).filter(Boolean)
    : [];

  let files;
  try {
    files = resolveFeatureFiles(pathsInput || "", defaultPath);
  } catch (err) {
    p.log.error(err.message);
    return p.outro("Failed.");
  }
  if (files.length === 0) {
    p.log.error("No .feature files found at the given path(s).");
    return p.outro("Failed.");
  }

  let created = 0;
  let overwritten = 0;
  let failed = 0;

  for (const file of files) {
    const folderPath = folderPathFor(file, config.featureRoot || "src/feature");
    await ensureFolder(config.projectId, folderPath);

    const scenarios = parseScenariosFromFile(file);
    let lineOffset = 0; // tracks lines inserted earlier in this same file

    for (const scenario of scenarios) {
      const existingKey = extractXrayKey(scenario.tags);
      if (existingKey) {
        try {
          await updateExistingTest(existingKey, scenario.gherkin_def, folderPath, scenario.summary);
          p.log.success(`${existingKey}  ${folderPath}  "${scenario.summary}" (overwritten — already linked)`);
          overwritten++;
        } catch (err) {
          p.log.error(`Failed to overwrite ${existingKey} "${scenario.summary}" (${file}): ${err.message}`);
          failed++;
        }
        continue;
      }

      const jira = {
        fields: {
          summary: scenario.summary,
          project: { key: config.projectKey },
          labels,
        },
      };

      try {
        const data = await graphqlRequest(CREATE_TEST_MUTATION, {
          gherkin: scenario.gherkin_def,
          folderPath,
          jira,
        });
        const key = data.createTest.test.jira.key;
        p.log.success(`${key}  ${folderPath}  "${scenario.summary}"`);
        if (data.createTest.warnings?.length) {
          p.log.warn(data.createTest.warnings.join("; "));
        }
        created++;

        const lineDelta = insertXrayTag(file, scenario.scenarioLineIndex + lineOffset, key);
        if (lineDelta === 0 && !fs.readFileSync(file, "utf8").includes(`@xray-${key}`)) {
          p.log.warn(
            `created ${key} but could not tag it in ${file} — add "@xray-${key}" above the scenario manually.`,
          );
        }
        lineOffset += lineDelta;
      } catch (err) {
        p.log.error(`Failed "${scenario.summary}" (${file}): ${err.message}`);
        failed++;
      }
    }
  }

  p.outro(`${created} test(s) created, ${overwritten} overwritten (already linked), ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  run().catch((err) => {
    p.log.error(`Unexpected error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { run };
