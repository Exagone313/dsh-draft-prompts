// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every @deepseek-ai specifier is a caret range: the caret lets a compatible
// release in without editing the manifest, and no dependency is an exact pin.
// The harness set (`@deepseek-ai/dsh-*`) follows one range anchored on
// engines.dsh and moves together with the supported dsh release; the version
// itself lives only in package.json, so the tests derive the shared range from
// engines.dsh instead of naming a release. @deepseek-ai/cordis is outside that
// release set but follows the same caret policy.
const CARET_RANGE =
  /^\^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;

const HARNESS_PREFIX = "@deepseek-ai/dsh-";

const SECTIONS = ["devDependencies", "peerDependencies"] as const;

interface Manifest {
  readonly engines?: { readonly dsh?: string };
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<
    Record<string, { readonly optional?: boolean }>
  >;
}

function manifest(): Manifest {
  return JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
}

function supportedRange(pkg: Manifest): string {
  const range = pkg.engines?.dsh;
  assert.ok(range, "engines.dsh must declare the supported dsh range");
  assert.match(range, CARET_RANGE, "engines.dsh must be a caret range");
  return range;
}

test("every @deepseek-ai specifier is a caret range", () => {
  const pkg = manifest();
  const dshRange = supportedRange(pkg);
  for (const section of SECTIONS) {
    for (const [name, specifier] of Object.entries(pkg[section] ?? {})) {
      if (!name.startsWith("@deepseek-ai/")) continue;
      assert.match(
        specifier,
        CARET_RANGE,
        `${section}: "${name}": "${specifier}" must be a caret range`,
      );
      if (!name.startsWith(HARNESS_PREFIX)) continue;
      assert.equal(
        specifier,
        dshRange,
        `${section}: "${name}": "${specifier}" must match engines.dsh (${dshRange})`,
      );
    }
  }
});

test("every peer dependency is declared optional", () => {
  const pkg = manifest();
  for (const name of Object.keys(pkg.peerDependencies ?? {})) {
    assert.equal(
      pkg.peerDependenciesMeta?.[name]?.optional,
      true,
      `peerDependenciesMeta["${name}"].optional must be true`,
    );
  }
});
