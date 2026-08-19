const esbuild = require("esbuild");
const fs = require("node:fs");

const production = process.argv.includes("--production");

fs.rmSync("dist", { recursive: true, force: true });
if (production) fs.rmSync("media/editor.js.map", { force: true });

async function build() {
  await esbuild.build({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["vscode"],
    sourcemap: !production,
    minify: production,
    sourcesContent: !production,
    outfile: "dist/extension.js",
    logLevel: "info"
  });

  if (!production) {
    await esbuild.build({
      entryPoints: ["src/cdb/Parser.ts"],
      bundle: true,
      platform: "node",
      format: "cjs",
      sourcemap: true,
      minify: false,
      sourcesContent: true,
      outfile: "dist/cdb/Parser.js",
      logLevel: "info"
    });

    await esbuild.build({
      entryPoints: ["src/shared/protocol.ts"],
      bundle: true,
      platform: "node",
      format: "cjs",
      sourcemap: true,
      minify: false,
      sourcesContent: true,
      outfile: "dist/shared/protocol.js",
      logLevel: "info"
    });
  }

  await esbuild.build({
    entryPoints: ["src/webview.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    sourcemap: !production,
    minify: production,
    sourcesContent: !production,
    outfile: "media/editor.js",
    logLevel: "info"
  });
}

build().catch(() => process.exitCode = 1);
