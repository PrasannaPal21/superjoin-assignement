/**
 * Offline eval aggregator: hybrid + classify + ask smokes.
 * Usage: npm run eval
 */
import { spawnSync } from "child_process";
import path from "path";

const root = process.cwd();
const scripts = [
  ["smoke:hybrid", path.join(root, "scripts", "smoke-hybrid.ts")],
  ["smoke:classify", path.join(root, "scripts", "smoke-classify.ts")],
  ["smoke:ask", path.join(root, "scripts", "smoke-ask.ts")],
] as const;

let failed = 0;
for (const [name, file] of scripts) {
  console.log(`\n=== ${name} ===`);
  const r = spawnSync("npx", ["tsx", file], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) {
    failed += 1;
    console.error(`${name} failed with status ${r.status}`);
  }
}

console.log(
  failed === 0
    ? "\nEVAL PASS — hybrid + classify + ask smokes green"
    : `\nEVAL FAIL — ${failed} smoke(s) failed`,
);
process.exitCode = failed === 0 ? 0 : 1;
