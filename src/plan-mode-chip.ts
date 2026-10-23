// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

/**
 * The classes of the plan-mode chip. The interactive toggle and a saved
 * draft's static marker render the same chip, so the static marker reuses the
 * toggle's class instead of duplicating its appearance in a separate rule.
 */
export const PLAN_TOGGLE_CLASS = "ddp-plan-toggle";

/** The active toggle's class plus the marker-only modifier. */
export const PLAN_INDICATOR_CLASS = `${PLAN_TOGGLE_CLASS} ddp-plan-indicator`;

/** The dot both the toggle and the marker draw. */
export const PLAN_DOT_CLASS = "ddp-plan-dot";
