// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The pure sizing rule behind both auto-growing draft textareas: the composer
// at the top of the tab and the inline editor of an existing draft. A height is
// derived from a visible line count and clamped between a minimum (an empty
// field is usable without a click) and a maximum (past it the field scrolls as
// it always did). Keeping the arithmetic here, free of React and the DOM, lets
// the stylesheet and the unit tests share one source of truth with the browser
// half; the measured line count itself comes from the textarea's scrollHeight.

/** Visible lines an empty draft textarea starts at. */
export const DRAFT_INPUT_MIN_LINES = 2;

/** Visible lines after which the textarea stops growing and scrolls. */
export const DRAFT_INPUT_MAX_LINES = 10;

/** One line box: the 12px type at the stylesheet's 1.5 line-height. */
export const DRAFT_INPUT_LINE_HEIGHT = 18;

/** .ddp-input's top and bottom padding, in CSS pixels. */
export const DRAFT_INPUT_PADDING_Y = 16;

/** .ddp-input's top and bottom border (0.5px each), in CSS pixels. */
export const DRAFT_INPUT_BORDER_Y = 1;

/** Space a draft textarea adds around its line boxes, in CSS pixels. */
export const DRAFT_INPUT_CHROME = DRAFT_INPUT_PADDING_Y + DRAFT_INPUT_BORDER_Y;

/**
 * Border-box height of a draft textarea showing a given number of lines,
 * clamped between {@link DRAFT_INPUT_MIN_LINES} and
 * {@link DRAFT_INPUT_MAX_LINES}. A non-finite count falls back to the minimum,
 * so a measurement that has not run yet cannot collapse the field.
 * @param lineCount - visible lines the content needs.
 * @returns the height to set on the textarea, in CSS pixels.
 */
export function draftInputHeight(lineCount: number): number {
  const requested = Number.isFinite(lineCount) ? Math.floor(lineCount) : 0;
  const lines = Math.min(
    DRAFT_INPUT_MAX_LINES,
    Math.max(DRAFT_INPUT_MIN_LINES, requested),
  );
  return DRAFT_INPUT_CHROME + lines * DRAFT_INPUT_LINE_HEIGHT;
}

/**
 * Lines a textarea's measured scrollHeight covers, rounding a partially
 * wrapped line up so it never clips. The result is only floored at the
 * minimum: {@link draftInputHeight} clamps the top, and the stylesheet's
 * max-height keeps an unexpected measurement from outgrowing the field.
 * @param scrollHeight - the textarea's measured scrollHeight, in CSS pixels.
 * @returns the visible line count the height rule should be given.
 */
export function draftInputLineCount(scrollHeight: number): number {
  if (!Number.isFinite(scrollHeight)) return DRAFT_INPUT_MIN_LINES;
  const content = Math.max(0, scrollHeight - DRAFT_INPUT_PADDING_Y);
  return Math.max(
    DRAFT_INPUT_MIN_LINES,
    Math.ceil(content / DRAFT_INPUT_LINE_HEIGHT),
  );
}
