import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

rmSync("dist", { recursive: true, force: true });
rmSync("apps/action/dist", { recursive: true, force: true });
mkdirSync("apps/action/dist", { recursive: true });

execFileSync("npx", ["tsc", "-p", "tsconfig.json"], { stdio: "inherit" });
execFileSync(
  "npx",
  [
    "esbuild",
    "apps/action/src/main.ts",
    "--bundle",
    "--platform=node",
    "--target=node20",
    "--format=cjs",
    "--outfile=apps/action/dist/index.js",
  ],
  { stdio: "inherit" }
);
