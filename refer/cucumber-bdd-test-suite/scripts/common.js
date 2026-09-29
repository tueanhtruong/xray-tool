/**
 * common.js
 * ---------------------------------------------------------------
 * Shared helpers for resolving user-provided feature file paths and
 * Xray Test Repository folder paths, used by export-xray.js,
 * create-xray-tests.js and update-xray-tests.js.
 *
 * All relative paths are resolved against the package root (based on
 * __dirname), NOT process.cwd() — this keeps behaviour identical no
 * matter where the script is invoked from (package dir, repo root via
 * pnpm --filter/turbo, etc.), and absolute paths are passed through as-is.
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const { collectFeatureFiles } = require("./gherkin-parser");

const PACKAGE_ROOT = path.join(__dirname, "..");

/** Resolve a path against the package root unless it's already absolute. */
function resolvePackagePath(target) {
  return path.isAbsolute(target) ? target : path.resolve(PACKAGE_ROOT, target);
}

/** Strips a single pair of matching surrounding quotes (' or "), if present. */
function stripQuotes(str) {
  if (str.length >= 2) {
    const first = str[0];
    const last = str[str.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return str.slice(1, -1);
    }
  }
  return str;
}

/** Splits raw user input into one or more path entries (comma or newline separated). */
function splitPathInput(raw) {
  return raw
    .split(/[,\n]/)
    .map((p) => stripQuotes(p.trim()))
    .filter(Boolean);
}

/**
 * Resolves user input (one or more comma-separated paths, relative to the
 * package root or absolute) into a deduplicated list of .feature files.
 * Throws if any given path does not exist.
 */
function resolveFeatureFiles(input, defaultPath) {
  const inputTargets = splitPathInput(input);
  const targets = inputTargets.length ? inputTargets : splitPathInput(defaultPath);
  const seen = new Set();
  const files = [];

  for (const target of targets) {
    const resolved = resolvePackagePath(target);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Path not found: ${resolved}`);
    }
    for (const file of collectFeatureFiles(resolved)) {
      if (!seen.has(file)) {
        seen.add(file);
        files.push(file);
      }
    }
  }

  return files;
}

/**
 * Xray Test Repository folder path for a feature file, relative to
 * `featureRoot` (see api/config.json). The folder mirrors the directory
 * structure under featureRoot, with no extra root segment prefixed.
 *
 * Example (featureRoot: "src/feature"):
 *   src/feature/x.feature            -> "/"
 *   src/feature/test-flow/x.feature  -> "/test-flow"
 */
function folderPathFor(filePath, featureRoot) {
  const featureRootAbs = resolvePackagePath(featureRoot);
  const relative = path.relative(featureRootAbs, filePath);
  const dir = path.dirname(relative);
  if (dir === ".") return "/";
  return "/" + dir.split(path.sep).join("/");
}

module.exports = {
  PACKAGE_ROOT,
  resolvePackagePath,
  splitPathInput,
  resolveFeatureFiles,
  folderPathFor,
};
