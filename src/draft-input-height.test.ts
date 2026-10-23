// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_INPUT_CHROME,
  DRAFT_INPUT_LINE_HEIGHT,
  DRAFT_INPUT_MAX_LINES,
  DRAFT_INPUT_MIN_LINES,
  DRAFT_INPUT_PADDING_Y,
  draftInputHeight,
  draftInputLineCount,
} from "./draft-input-height.js";

const minHeight = DRAFT_INPUT_CHROME +
  DRAFT_INPUT_MIN_LINES * DRAFT_INPUT_LINE_HEIGHT;
const maxHeight = DRAFT_INPUT_CHROME +
  DRAFT_INPUT_MAX_LINES * DRAFT_INPUT_LINE_HEIGHT;

test("the bounds are the couple of lines to a sensible cap", () => {
  assert.equal(DRAFT_INPUT_MIN_LINES, 2);
  assert.equal(DRAFT_INPUT_MAX_LINES, 10);
  assert.ok(DRAFT_INPUT_MAX_LINES > DRAFT_INPUT_MIN_LINES);
});

test("an empty or one-line field starts at the minimum height", () => {
  for (const lines of [DRAFT_INPUT_MIN_LINES, 1, 0, -3]) {
    assert.equal(draftInputHeight(lines), minHeight, `lines: ${lines}`);
  }
});

test("a missing measurement falls back to the minimum", () => {
  assert.equal(draftInputHeight(Number.NaN), minHeight);
  assert.equal(draftInputHeight(Number.POSITIVE_INFINITY), minHeight);
});

test("each line inside the range adds exactly one line box", () => {
  for (
    let lines = DRAFT_INPUT_MIN_LINES;
    lines <= DRAFT_INPUT_MAX_LINES;
    ++lines
  ) {
    assert.equal(
      draftInputHeight(lines),
      DRAFT_INPUT_CHROME + lines * DRAFT_INPUT_LINE_HEIGHT,
      `lines: ${lines}`,
    );
    if (lines > DRAFT_INPUT_MIN_LINES) {
      assert.equal(
        draftInputHeight(lines) - draftInputHeight(lines - 1),
        DRAFT_INPUT_LINE_HEIGHT,
      );
    }
  }
});

test("growth stops at the maximum and never exceeds it", () => {
  assert.equal(draftInputHeight(DRAFT_INPUT_MAX_LINES), maxHeight);
  for (
    const lines of [
      DRAFT_INPUT_MAX_LINES + 1,
      DRAFT_INPUT_MAX_LINES * 10,
      1000,
    ]
  ) {
    assert.equal(draftInputHeight(lines), maxHeight, `lines: ${lines}`);
  }
});

test("a fractional count is floored before clamping", () => {
  assert.equal(draftInputHeight(3.9), draftInputHeight(3));
  assert.equal(draftInputHeight(1.5), minHeight);
});

test("the measured scrollHeight converts back to a line count", () => {
  // Two lines plus padding is the smallest content a textarea reports.
  assert.equal(
    draftInputLineCount(
      DRAFT_INPUT_PADDING_Y + DRAFT_INPUT_MIN_LINES * DRAFT_INPUT_LINE_HEIGHT,
    ),
    DRAFT_INPUT_MIN_LINES,
  );
  assert.equal(
    draftInputLineCount(DRAFT_INPUT_PADDING_Y + 3 * DRAFT_INPUT_LINE_HEIGHT),
    3,
  );
  // A partially wrapped line rounds up rather than clipping its text.
  assert.equal(
    draftInputLineCount(
      DRAFT_INPUT_PADDING_Y + 3 * DRAFT_INPUT_LINE_HEIGHT + 1,
    ),
    4,
  );
});

test("a short or missing measurement stays at the minimum line count", () => {
  for (
    const height of [
      0,
      DRAFT_INPUT_PADDING_Y,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]
  ) {
    assert.equal(draftInputLineCount(height), DRAFT_INPUT_MIN_LINES);
  }
});

test("measuring a height and sizing it back is stable", () => {
  // The browser reads scrollHeight without the border, while the height rule
  // includes it: round-tripping must not creep upward on every keystroke.
  for (
    let lines = DRAFT_INPUT_MIN_LINES;
    lines <= DRAFT_INPUT_MAX_LINES;
    ++lines
  ) {
    const height = draftInputHeight(lines);
    const scrollHeight = height - (DRAFT_INPUT_CHROME - DRAFT_INPUT_PADDING_Y);
    assert.equal(draftInputLineCount(scrollHeight), lines);
  }
});
