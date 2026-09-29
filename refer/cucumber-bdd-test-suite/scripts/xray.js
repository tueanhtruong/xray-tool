#!/usr/bin/env node
/**
 * xray.js
 * ---------------------------------------------------------------
 * Interactive entry point for all Xray automation workflows.
 *
 * Usage:
 *   pnpm xray
 * ---------------------------------------------------------------
 */

const p = require("@clack/prompts");

async function main() {
  p.intro("Xray automation");

  const action = await p.select({
    message: "What would you like to do?",
    options: [
      {
        value: "generate",
        label: "Generate test case",
        hint: "export JSON for manual Jira/Xray import",
      },
      {
        value: "create",
        label: "Create test case",
        hint: "create new Tests directly via the Xray API",
      },
      {
        value: "update",
        label: "Update test case",
        hint: "sync already-created Tests (tagged @xray-<KEY>)",
      },
      {
        value: "sync",
        label: "Sync test case",
        hint: "create untagged scenarios and update tagged @xray-<KEY> scenarios",
      },
      {
        value: "set-executions",
        label: "Create Test Set and executions",
        hint: "create DEV/QA executions, add Tests, and link them to Jira",
      },
    ],
  });

  if (p.isCancel(action)) {
    p.cancel("Cancelled.");
    return;
  }

  switch (action) {
    case "generate":
      return require("./export-xray").run();
    case "create":
      return require("./create-xray-tests").run();
    case "update":
      return require("./update-xray-tests").run();
    case "sync":
      return require("./create-xray-tests").run("Sync test case");
    case "set-executions":
      return require("./create-test-set-executions").run();
  }
}

main().catch((err) => {
  p.log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
