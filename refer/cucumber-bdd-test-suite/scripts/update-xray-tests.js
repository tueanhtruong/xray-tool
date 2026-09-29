#!/usr/bin/env node
/**
 * update-xray-tests.js
 * ---------------------------------------------------------------
 * Syncs already-created Xray Cloud Cucumber Tests with their
 * current .feature file content.
 *
 * Only scenarios tagged with "@xray-<KEY>" (written automatically
 * by scripts/create-xray-tests.js) are processed — untagged
 * scenarios are skipped (run create-xray-tests.js for those first).
 *
 * For each tagged scenario this updates:
 *   - the Gherkin definition (steps/Examples)
 *   - the Test Repository folder, if the file has moved
 *
 * Usage:
 *   pnpm update-xray-tests   (standalone)
 *   pnpm xray                (interactive menu -> "Update test case")
 * ---------------------------------------------------------------
 */

const p = require("@clack/prompts");
const { parseScenariosFromFile, extractXrayKey } = require("./gherkin-parser");
const { loadConfig } = require("./xray-client");
const { resolveFeatureFiles, folderPathFor } = require("./common");
const { updateExistingTest } = require("./xray-sync");

// ── main ─────────────────────────────────────────────────────────

async function run() {
  p.intro("Xray · Update test case");

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

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const folderPath = folderPathFor(file, config.featureRoot || "src/feature");
    const scenarios = parseScenariosFromFile(file);

    for (const scenario of scenarios) {
      const key = extractXrayKey(scenario.tags);
      if (!key) {
        skipped++;
        continue;
      }

      try {
        await updateExistingTest(key, scenario.gherkin_def, folderPath, scenario.summary);
        p.log.success(`${key}  ${folderPath}  "${scenario.summary}"`);
        updated++;
      } catch (err) {
        p.log.error(`Failed ${key} "${scenario.summary}" (${file}): ${err.message}`);
        failed++;
      }
    }
  }

  p.outro(`${updated} test(s) updated, ${skipped} skipped (no @xray- tag), ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  run().catch((err) => {
    p.log.error(`Unexpected error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { run };
