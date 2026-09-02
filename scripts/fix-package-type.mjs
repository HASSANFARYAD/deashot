/**
 * Post-build fixup for dual (ESM+CJS) packages.
 * Writes a nested package.json into each dist folder so that:
 *  - dist/esm/*.js is interpreted as ESM
 *  - dist/cjs/*.js is interpreted as CommonJS
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , packageDir] = process.argv;

function write(dir, type) {
  writeFileSync(
    resolve(packageDir, dir, "package.json"),
    JSON.stringify({ type }, null, 2) + "\n"
  );
}

write("dist/esm", "module");
write("dist/cjs", "commonjs");

console.log(`[fixup] ${packageDir}: wrote dist/esm & dist/cjs package.json types`);