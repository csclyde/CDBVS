const Module = require("node:module");
const path = require("node:path");
const esbuild = require("esbuild");

function loadTsModule(filename, vscode) {
  const absolutePath = path.resolve(filename);
  const result = esbuild.buildSync({
    entryPoints: [absolutePath],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["vscode"],
    sourcemap: false,
    write: false
  });
  const compiledModule = new Module(absolutePath, module.parent);
  compiledModule.filename = absolutePath;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(absolutePath));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    return request === "vscode" && vscode !== undefined
      ? vscode
      : originalLoad.call(this, request, parent, isMain);
  };
  try {
    compiledModule._compile(result.outputFiles[0].text, absolutePath);
  } finally {
    Module._load = originalLoad;
  }
  return compiledModule.exports;
}

module.exports = { loadTsModule };
