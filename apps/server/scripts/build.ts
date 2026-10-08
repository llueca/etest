import { build } from "esbuild";

// One self-contained bundle per Lambda -> dist/lambda/<name>/index.mjs (zipped by Terraform).
// Bundling means no node_modules resolution is needed at runtime.
for (const name of ["api", "settler"]) {
  await build({
    entryPoints: [`src/entrypoints/lambda-${name}.ts`],
    outfile: `dist/lambda/${name}/index.mjs`,
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    sourcemap: true,
    // Some CommonJS dependencies call require() at runtime.
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: "info",
  });
}
