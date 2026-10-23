// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Importing the dictionaries here also typechecks them under the host program,
// which has no DOM lib: they must stay environment-free data.
import { en, zh } from "./locales.js";

interface LocaleFile {
  readonly meta?: { readonly title?: unknown; readonly description?: unknown };
  readonly strings?: Readonly<Record<string, unknown>>;
}

function localeFile(language: string): LocaleFile {
  return JSON.parse(
    readFileSync(
      new URL(`../locale/${language}.json`, import.meta.url),
      "utf8",
    ),
  );
}

test("both dictionaries carry the same non-empty keys", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const [language, dictionary] of [["en", en], ["zh", zh]] as const) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(
        typeof value,
        "string",
        `${language}: ${key} must be a string`,
      );
      assert.notEqual(
        value.trim(),
        "",
        `${language}: ${key} must not be empty`,
      );
    }
  }
});

test("the exported locale files mirror the runtime dictionaries", () => {
  for (const [language, dictionary] of [["en", en], ["zh", zh]] as const) {
    assert.deepEqual(
      localeFile(language).strings,
      dictionary,
      `${language}.json strings must match src/locales.ts`,
    );
  }
});

test("the exported locale files describe the plugin", () => {
  for (const language of ["en", "zh"]) {
    const meta = localeFile(language).meta;
    assert.equal(typeof meta?.title, "string", `${language}: meta.title`);
    assert.notEqual(
      String(meta?.title).trim(),
      "",
      `${language}: meta.title must not be empty`,
    );
    assert.equal(
      typeof meta?.description,
      "string",
      `${language}: meta.description`,
    );
    assert.notEqual(
      String(meta?.description).trim(),
      "",
      `${language}: meta.description must not be empty`,
    );
  }
});
