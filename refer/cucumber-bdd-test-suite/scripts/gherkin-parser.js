/**
 * gherkin-parser.js
 * ---------------------------------------------------------------
 * Shared Gherkin parsing helpers used by both export-xray.js
 * (CSV/JSON export flow) and create-xray-tests.js (direct API flow).
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

/** Recursively collect all .feature files under a directory. */
function collectFeatureFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return target.endsWith(".feature") ? [target] : [];
  }
  const files = [];
  for (const entry of fs.readdirSync(target)) {
    files.push(...collectFeatureFiles(path.join(target, entry)));
  }
  return files;
}

// "Scenario Outline:" must be checked before "Scenario:" to avoid partial match
const SCENARIO_KW = /^\s*(Scenario Outline:|Scenario:)/;
const BACKGROUND_KW = /^\s*Background:/;
const FEATURE_KW = /^\s*Feature:/;
const TAG_RE = /^\s*@/;
const BLANK_RE = /^\s*$/;

/**
 * Returns an array of scenario objects extracted from a single feature file.
 * Each object: { summary, gherkin_def, tags, scenarioLineIndex }
 * - tags: raw tag lines (e.g. "  @foo @bar") immediately preceding the
 *   Scenario/Scenario Outline keyword line.
 * - scenarioLineIndex: 0-based line index of the Scenario/Scenario Outline
 *   keyword line in the original file (useful to locate/insert tags later).
 */
function parseScenariosFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  const scenarios = [];

  let collecting = false; // inside a scenario block
  let pendingTags = []; // tag lines buffered before a keyword
  let scenarioLines = []; // lines of the current scenario block
  let summary = "";
  let currentTags = []; // tags captured for the scenario being collected
  let currentScenarioLineIndex = -1;

  function finalise() {
    if (!collecting || scenarioLines.length === 0) return;
    scenarios.push({
      summary,
      gherkin_def: [...pendingTags.slice(-0), ...scenarioLines]
        .join("\n")
        .trimEnd(),
      tags: currentTags,
      scenarioLineIndex: currentScenarioLineIndex,
    });
    collecting = false;
    scenarioLines = [];
    pendingTags = [];
    summary = "";
    currentTags = [];
    currentScenarioLineIndex = -1;
  }

  lines.forEach((line, index) => {
    // Skip Feature: header — not a test
    if (FEATURE_KW.test(line)) {
      finalise();
      pendingTags = [];
      return;
    }

    // Skip Background blocks
    if (BACKGROUND_KW.test(line)) {
      finalise();
      collecting = false;
      pendingTags = [];
      // consume background lines until next scenario/tag boundary
      // handled by collecting=false so lines just fall through
      return;
    }

    // Tag lines — buffer them; they may precede a Scenario or be inline
    if (TAG_RE.test(line)) {
      if (collecting) {
        // Tags inside a collecting block mean start of next scenario — finalise first
        finalise();
      }
      pendingTags.push(line);
      return;
    }

    // Scenario / Scenario Outline start
    if (SCENARIO_KW.test(line)) {
      finalise();
      collecting = true;
      scenarioLines = []; // exclude tags and Scenario: header line
      currentTags = pendingTags;
      currentScenarioLineIndex = index;
      pendingTags = [];
      // Extract summary: text after "Scenario Outline:" or "Scenario:"
      summary = line.replace(/^\s*(Scenario Outline:|Scenario:)\s*/, "").trim();
      return;
    }

    // While inside a background (collecting=false, pendingTags empty), discard lines
    if (!collecting) {
      // If it's a blank line after a non-scenario context, clear pending tags
      if (BLANK_RE.test(line)) pendingTags = [];
      return;
    }

    // Inside a scenario — accumulate lines (steps, Examples, table rows, comments)
    scenarioLines.push(line);
  });

  // Finalise last scenario
  finalise();

  return scenarios;
}

// ── Xray tag helpers ─────────────────────────────────────────────
// Once a scenario is created in Xray, its issue key is persisted as a
// "@xray-<KEY>" tag directly above the Scenario/Scenario Outline line,
// so future runs can tell create (untagged) apart from update (tagged).

const XRAY_TAG_RE = /@xray-([A-Z][A-Z0-9]*-\d+)\b/;

/** Returns the Xray issue key from a scenario's tags, or null if untagged. */
function extractXrayKey(tags) {
  for (const tagLine of tags) {
    const match = tagLine.match(XRAY_TAG_RE);
    if (match) return match[1];
  }
  return null;
}

/** Collect unique Xray Test keys from parsed scenarios. */
function collectXrayKeys(scenarios) {
  const keys = [];
  const seen = new Set();
  const untagged = [];
  for (const scenario of scenarios) {
    const key = extractXrayKey(scenario.tags);
    if (!key) {
      untagged.push(scenario.summary);
    } else if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return { keys, untagged };
}

/**
 * Inserts a "@xray-<key>" tag above the scenario at `scenarioLineIndex`
 * (appending to an existing tag line if present, otherwise adding a new
 * line). Returns the number of lines added to the file (0 or 1), so
 * callers can offset subsequent scenarios' `scenarioLineIndex` within the
 * same file.
 */
function insertXrayTag(filePath, scenarioLineIndex, key) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");

  let cursor = scenarioLineIndex - 1;
  const tagLineIndexes = [];
  while (cursor >= 0 && TAG_RE.test(lines[cursor])) {
    tagLineIndexes.unshift(cursor);
    cursor--;
  }

  if (tagLineIndexes.length > 0) {
    const lastTagIdx = tagLineIndexes[tagLineIndexes.length - 1];
    if (XRAY_TAG_RE.test(lines[lastTagIdx])) return 0; // already tagged, nothing to do
    lines[lastTagIdx] = `${lines[lastTagIdx].replace(/\s+$/, "")} @xray-${key}`;
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
    return 0;
  }

  lines.splice(scenarioLineIndex, 0, `  @xray-${key}`);
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  return 1;
}

module.exports = {
  collectFeatureFiles,
  parseScenariosFromFile,
  extractXrayKey,
  collectXrayKeys,
  insertXrayTag,
};
