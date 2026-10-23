// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PLAN_DOT_CLASS,
  PLAN_INDICATOR_CLASS,
  PLAN_TOGGLE_CLASS,
} from "./plan-mode-chip.js";

function classes(value: string): string[] {
  return value.split(/\s+/u);
}

test("the static plan marker carries the active toggle's chip classes", () => {
  const toggle = classes(PLAN_TOGGLE_CLASS);
  const indicator = classes(PLAN_INDICATOR_CLASS);
  for (const name of toggle) {
    assert.ok(
      indicator.includes(name),
      `the marker must carry the toggle class ${name}`,
    );
  }
  assert.deepEqual(
    indicator.filter((name) => !toggle.includes(name)),
    ["ddp-plan-indicator"],
    "the marker adds only its own modifier",
  );
  assert.equal(PLAN_DOT_CLASS, "ddp-plan-dot");
});

test("the stylesheet applies the pressed toggle's appearance to the marker", () => {
  const stylesheet = readFileSync(
    new URL("../src/client/styles.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    stylesheet,
    /\.ddp-plan-toggle\[aria-pressed="true"\],\n\.ddp-plan-indicator \{/u,
    "the active toggle and the marker must share one rule",
  );
  assert.match(
    stylesheet,
    /\.ddp-plan-indicator \{\n  cursor: default;/u,
    "the marker must not look clickable",
  );
});
