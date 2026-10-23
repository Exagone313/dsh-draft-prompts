// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The plan-mode chip shared by the composer/editor toggle, a saved draft's
// marker, and the confirmation dialogs: one component keeps every chip
// identical. The marker is static, so it keeps the toggle's classes for its
// appearance but not its behaviour.
import type { TranslateNS } from "@deepseek-ai/dsh-client-locale/client";
import type { ReactNode } from "react";
import { NS } from "../locales.js";
import { PLAN_DOT_CLASS, PLAN_INDICATOR_CLASS } from "../plan-mode-chip.js";

/** The plan-mode dot both the toggle and the marker draw. */
export function PlanModeDot(): ReactNode {
  return <span className={PLAN_DOT_CLASS} aria-hidden="true" />;
}

/**
 * Mark a version of a draft that is in plan mode with the same chip the toggle
 * shows while pressed.
 * @param props - translator for the chip's label.
 * @returns the static indicator.
 */
export function PlanModeIndicator(
  props: { readonly t: TranslateNS<typeof NS> },
): ReactNode {
  return (
    <span
      className={PLAN_INDICATOR_CLASS}
      role="img"
      aria-label={props.t("composer.plan")}
    >
      <PlanModeDot />
      {props.t("composer.plan")}
    </span>
  );
}
