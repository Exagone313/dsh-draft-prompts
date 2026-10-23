// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// Build the browser client half into the format the dsh host serves: a single
// classic script that registers a closure factory via
// `window.__ModuleLoader__.load({ id, factory })`. Module-table rows (React, its
// JSX runtime, and the shell's static UI primitives) stay as `require()` calls
// answered by the loader; everything else is inlined.
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ID = "@exagone313/dsh-draft-prompts";

// React and the shell's static UI primitives are installed by the page, never
// bundled. The remaining dsh packages this plugin imports stay type-only, so
// the list stays this short.
const EXTERNALS = [
  "react",
  "react/jsx-runtime",
  "@deepseek-ai/dsh-client-ui-primitives",
];

// The guide card reaches the plugin's artwork through the package's `./icon`
// export, which esbuild resolves to icon.svg. Inlining it as a data URL keeps
// the browser bundle self-contained: the host only serves client scripts under
// /plugins, not package files, so the card cannot fetch the SVG separately.
const LOADER = { ".svg": "dataurl" };

await build({
  entryPoints: [join(root, "src/client/index.ts")],
  outfile: join(root, "dist/client/index.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  external: EXTERNALS,
  loader: LOADER,
  banner: {
    js:
      `window.__ModuleLoader__.load({ id: ${
        JSON.stringify(ID)
      }, factory: (require) => {\n` +
      "var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: "\nreturn module.exports; } });",
  },
  logLevel: "info",
});
console.log("built client bundle -> dist/client/index.js");
