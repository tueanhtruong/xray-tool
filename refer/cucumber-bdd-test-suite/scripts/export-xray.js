#!/usr/bin/env node
/**
 * export-xray.js
 * ---------------------------------------------------------------
 * Parses Gherkin .feature files and exports an Xray-compatible
 * JSON array for one-time import into Jira/Xray.
 *
 * Usage:
 *   pnpm export-xray         (standalone)
 *   pnpm xray                (interactive menu -> "Generate test case")
 *
 * Output: scripts/xray-import.json
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const p = require("@clack/prompts");
const { parseScenariosFromFile } = require("./gherkin-parser");
const { resolveFeatureFiles } = require("./common");

async function run() {
  p.intro("Xray · Generate test case JSON");

  const defaultPath = "src/feature";
  const pathsInput = await p.text({
    message: `Path(s) to .feature file or directory (comma-separated for multiple)`,
    placeholder: defaultPath,
  });
  if (p.isCancel(pathsInput)) return p.cancel("Cancelled.");

  const folderInput = await p.text({
    message: "xray_test_repository_folder (e.g. /Dates/Week Calendar, leave blank to fill later)",
    placeholder: "(blank)",
  });
  if (p.isCancel(folderInput)) return p.cancel("Cancelled.");

  const labelsInput = await p.text({
    message: "Labels (comma-separated, e.g. Automated,Regression)",
    placeholder: "(none)",
  });
  if (p.isCancel(labelsInput)) return p.cancel("Cancelled.");

  const repositoryFolder = (folderInput || "").trim();
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

  const output = [];
  let fileCount = 0;

  for (const file of files) {
    const scenarios = parseScenariosFromFile(file);
    for (const s of scenarios) {
      output.push({
        fields: {
          summary: s.summary,
          priority: { name: "Medium" },
          labels,
        },
        xray_issue_type: "Test",
        xray_testtype: "Cucumber",
        xray_gherkin_def: s.gherkin_def,
        xray_test_repository_folder: repositoryFolder,
      });
    }
    if (scenarios.length > 0) fileCount++;
  }

  const outPath = path.join(__dirname, "xray-import.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  p.log.success(`${output.length} scenario(s) exported from ${fileCount} file(s)`);
  p.log.info(outPath);

  if (!repositoryFolder) {
    p.note(
      '1. Fill in "xray_test_repository_folder" values in xray-import.json\n2. Import into Xray via: Project Settings > Xray > Import Tests',
      "Next steps",
    );
  } else {
    p.note("Import into Xray via: Project Settings > Xray > Import Tests", "Next steps");
  }

  p.outro("Done.");
}

if (require.main === module) {
  run().catch((err) => {
    p.log.error(`Unexpected error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { run };
