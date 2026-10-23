// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The pure action rules of one draft card: which controls the row offers, the
// confirmation gate a send, delete or discard has to pass, and the preview the
// confirmation dialog shows. Keeping them free of React and the DOM lets the
// browser half and the tests share one source of truth.
import {
  draftEditDirty,
  type DraftEditState,
  type DraftPromptRecord,
  type DraftPromptStatus,
} from "./draft-prompts.js";
import type { DraftPromptsKey } from "./locales.js";

/**
 * The reason a list read failed, for the tab's error line. The client's request
 * error already carries the route's message and status (or the parse failure),
 * so surfacing its message keeps the line actionable instead of generic.
 * @param error - the caught failure.
 * @returns the detail to show after the generic sentence; empty when there is none.
 */
export function draftFailureReason(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  return String(error).trim();
}

/** One control a pending or sent draft card can offer. */
export type DraftRowAction =
  | "edit"
  | "save"
  | "cancel"
  | "send"
  | "redraft"
  | "delete";

/** The actions a confirmation dialog can authorize. */
export type DraftConfirmedAction = "send" | "delete" | "discard";

/**
 * The controls a card offers, in the order they render: the confirming or
 * primary action first, then the other non-destructive ones, and Cancel or the
 * destructive action last. While the inline editor is open only Save and Cancel
 * remain, Save first; a half-edited draft must not be sent, redrafted or
 * deleted, so those controls disappear until editing ends.
 * @param status - whether the draft is still pending or already sent.
 * @param editing - whether the row's inline editor is open.
 * @returns the actions to render, in display order.
 */
export function draftRowActions(
  status: DraftPromptStatus,
  editing: boolean,
): readonly DraftRowAction[] {
  if (editing) return ["save", "cancel"];
  return status === "sent" ? ["redraft", "delete"] : ["send", "edit", "delete"];
}

/**
 * Resolve the action a confirmation dialog may run. A send or a delete reaches
 * the host only through this gate: no request means no action, an open editor
 * refuses both, and a sent record can no longer be sent (only resent). A
 * discard is the exception: it only makes sense while an editor is open.
 * @param request - the action the dialog was opened for, or null when closed.
 * @param status - the record's current status, which a refetch may have changed.
 * @param editing - whether the row's inline editor is open.
 * @returns the action to run now, or null when the dialog may not run one.
 */
export function confirmedDraftAction(
  request: DraftConfirmedAction | null,
  status: DraftPromptStatus,
  editing: boolean,
): DraftConfirmedAction | null {
  if (request === null) return null;
  if (request === "discard") return editing ? "discard" : null;
  if (editing) return null;
  if (request === "send" && status !== "draft") return null;
  return request;
}

/** The title and description the delete confirmation shows. */
export interface DraftDeleteCopy {
  /** The modal title, naming the kind of record being deleted. */
  readonly title: DraftPromptsKey;
  /** The modal description, naming what will be removed. */
  readonly description: DraftPromptsKey;
}

/**
 * Name the record being deleted the way the list does: a pending record is a
 * draft, while a sent record is a sent prompt, so the dialog never calls a
 * receipt a draft. Only Delete is status-dependent; sending and discarding can
 * only ever affect a pending draft.
 * @param status - the record's current status.
 * @returns the copy keys for that record's delete confirmation.
 */
export function draftDeleteCopy(status: DraftPromptStatus): DraftDeleteCopy {
  return status === "sent"
    ? {
      title: "confirm.deleteSentTitle",
      description: "confirm.deleteSentDescription",
    }
    : {
      title: "confirm.deleteDraftTitle",
      description: "confirm.deleteDraftDescription",
    };
}

/** What the inline editor does when it handles Save or Cancel. */
export type DraftEditIntent = "save" | "cancel";

/** The pure outcome of one explicit editor action. */
export interface DraftEditDecision {
  /**
   * The text and plan flag to persist, or null when this action writes
   * nothing. Cancel never writes; Save only writes a dirty, non-empty edit.
   */
  readonly write: DraftEditState | null;
  /** Whether the editor closes after this action. */
  readonly close: boolean;
  /** Whether Cancel has to confirm that the local edit will be discarded. */
  readonly confirmDiscard: boolean;
}

/**
 * Decide what an explicit Save or Cancel does, without touching React. A
 * changed text or plan flag is still only local state: nothing reaches the
 * host until Save asks for the write, and Cancel asks before throwing the
 * local state away only when there is something to discard.
 * @param draft - the stored record the editor is open against.
 * @param edit - the editor's current text and plan flag.
 * @param intent - the explicit action the user took.
 * @returns the write, close, and discard-confirmation outcome.
 */
export function draftEditDecision(
  draft: DraftPromptRecord,
  edit: DraftEditState,
  intent: DraftEditIntent,
): DraftEditDecision {
  const dirty = draftEditDirty(draft, edit);
  if (intent === "cancel") {
    return dirty
      ? { write: null, close: false, confirmDiscard: true }
      : { write: null, close: true, confirmDiscard: false };
  }
  return {
    write: dirty && edit.text.trim() !== "" ? edit : null,
    close: true,
    confirmDiscard: false,
  };
}

/** One version of a draft that the discard confirmation compares. */
export interface DraftConfirmSide {
  /** Which version this is: the editor's local state or the stored record. */
  readonly role: "discarded" | "stored";
  /** Full text of this version. */
  readonly text: string;
  /** Whether this version would send in plan mode. */
  readonly sendInPlanMode: boolean;
}

/** The two sides a discard confirmation shows, and which of them to render. */
export interface DraftDiscardPreview {
  /** The editor's version, which Cancel throws away. */
  readonly discarded: DraftConfirmSide;
  /** The stored version Cancel reverts to. */
  readonly stored: DraftConfirmSide;
  /**
   * The text blocks to render. Both versions are shown when their text
   * differs; only the discarded one when the text matches, because a second
   * identical block would say nothing and hide the plan-flag change.
   */
  readonly sides: readonly DraftConfirmSide[];
  /** Whether both versions share their text, so only the plan flag differs. */
  readonly sameText: boolean;
}

/**
 * Compare the editor's local state with the stored record for Cancel's
 * confirmation: what the user would lose, and what the draft would revert to.
 * The discarded side uses the editor's current plan toggle, the stored side the
 * record's flag; neither side stands in for the other.
 * @param draft - the stored record the editor is open against.
 * @param edit - the editor's current text and plan flag.
 * @returns the sides to show with their own text and plan flags.
 */
export function draftDiscardPreview(
  draft: DraftPromptRecord,
  edit: DraftEditState,
): DraftDiscardPreview {
  const discarded: DraftConfirmSide = {
    role: "discarded",
    text: edit.text,
    sendInPlanMode: edit.sendInPlanMode,
  };
  const stored: DraftConfirmSide = {
    role: "stored",
    text: draft.text,
    sendInPlanMode: draft.sendInPlanMode,
  };
  const sameText = edit.text === draft.text;
  return {
    discarded,
    stored,
    sides: sameText ? [discarded] : [discarded, stored],
    sameText,
  };
}

/** Longest preview the confirmation dialog shows, counted in code points. */
export const DRAFT_CONFIRM_PREVIEW_LENGTH = 120;

/**
 * The one line of draft text a confirmation names: its first non-empty line,
 * trimmed, shortened to {@link DRAFT_CONFIRM_PREVIEW_LENGTH} code points with an
 * ellipsis when it is longer. Splitting by code point keeps an emoji whole.
 * @param text - the draft's full text.
 * @returns the preview line, or an empty string when the text has no content.
 */
export function draftConfirmationPreview(text: string): string {
  const line = text.split(/\r\n|\r|\n/u)
    .map((part) => part.trim())
    .find((part) => part !== "") ?? "";
  const points = Array.from(line);
  if (points.length <= DRAFT_CONFIRM_PREVIEW_LENGTH) return line;
  return `${points.slice(0, DRAFT_CONFIRM_PREVIEW_LENGTH).join("")}…`;
}
