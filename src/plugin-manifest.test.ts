// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

// The manifest is the only place that tells a profile how to load this bundle:
// its patch, its browser half, its display resources, and the dsh release range
// it targets. These assertions catch a rename or a dropped export before a
// packed install silently falls back to defaults.

interface Manifest {
  readonly name: string;
  readonly license: string;
  readonly type: string;
  readonly exports: Readonly<Record<string, unknown>>;
  readonly files: readonly string[];
  readonly engines?: { readonly dsh?: string };
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly dsh?: {
    readonly manifestVersion?: number;
    readonly bundle?: { readonly patch?: string };
    readonly client?: {
      readonly platform?: string;
      readonly inject?: readonly string[];
    };
  };
}

function manifest(): Manifest {
  return JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
}

test("the package declares both halves and its display resources", () => {
  const pkg = manifest();

  assert.equal(pkg.type, "module");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.exports["."], "./dist/index.js");
  assert.deepEqual(pkg.exports["./client"], {
    types: "./dist/client/index.d.ts",
    default: "./dist/client/index.js",
  });
  assert.equal(pkg.exports["./locale/*.json"], "./locale/*.json");
  assert.equal(pkg.exports["./icon"], "./icon.svg");
  for (
    const shipped of ["dist", "locale/*.json", "cordis.patch.yml", "icon.svg"]
  ) {
    assert.ok(pkg.files.includes(shipped), `files must ship ${shipped}`);
  }
});

test("the manifest declares the supported dsh range and bundle patch", () => {
  const pkg = manifest();

  assert.equal(pkg.dsh?.manifestVersion, 1);
  assert.match(
    pkg.engines?.dsh ?? "",
    /^\^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    "engines.dsh must be a caret range",
  );
  assert.equal(pkg.dsh?.bundle?.patch, "./cordis.patch.yml");
  assert.equal(pkg.dsh?.client?.platform, "web");
});

test("the client inject list names only packages the checkout installs", () => {
  const pkg = manifest();
  const inject = pkg.dsh?.client?.inject ?? [];

  assert.ok(inject.length > 0, "the client half must declare its dependencies");
  assert.equal(new Set(inject).size, inject.length, "inject must not repeat");
  for (const name of inject) {
    assert.ok(
      pkg.devDependencies?.[name] !== undefined,
      `dsh.client.inject "${name}" must be a devDependency`,
    );
  }
});

test("the bundle patch inserts one row named after the package", () => {
  const pkg = manifest();
  const patch = readFileSync(
    new URL("../cordis.patch.yml", import.meta.url),
    "utf8",
  );

  assert.match(
    patch,
    /^- insert:\n {4}- id: draft-prompts\n {6}name: '@exagone313\/dsh-draft-prompts'\n/m,
  );
  assert.equal(pkg.name, "@exagone313/dsh-draft-prompts");
});

test("the icon is a small SVG inside the package", () => {
  const icon = readFileSync(new URL("../icon.svg", import.meta.url), "utf8");
  const size = statSync(new URL("../icon.svg", import.meta.url)).size;

  assert.match(icon.trimStart(), /^<svg[\s>]/);
  assert.ok(size > 0 && size < 256 * 1024, `icon.svg is ${size} bytes`);
});
