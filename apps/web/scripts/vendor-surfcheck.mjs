// Vendor surfcheck/ from the repo root into apps/web/api/_vendored/surfcheck
// so the Python serverless function can import the canonical scoring/fetch
// modules at runtime. Re-run on every predev/prebuild; the destination tree
// is wiped first so deletions in the source propagate.

import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "..", "..", "surfcheck");
const dest = resolve(here, "..", "api", "_vendored", "surfcheck");

if (!existsSync(src)) {
  console.error(`vendor-surfcheck: source not found at ${src}`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, {
  recursive: true,
  filter: (path) => {
    // Skip __pycache__/.pyc artefacts so they don't end up in the deploy bundle.
    if (path.includes("__pycache__")) return false;
    if (path.endsWith(".pyc")) return false;
    return true;
  },
});

const repoRoot = resolve(here, "..", "..", "..");
console.log(`vendored ${relative(repoRoot, src)} → ${relative(repoRoot, dest)}`);
