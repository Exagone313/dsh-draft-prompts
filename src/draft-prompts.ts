// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The draft-prompt record and every pure rule over it: validation, conflict
// detection for compare-and-swap writes, list ordering, scope filtering, and
// the mapping from a draft to the command or prompt it sends. Both halves of
// the plugin import this module, so it stays free of Node and DOM APIs (and of
// the host-only storage schema), which is what makes it testable harness-free.

/** A draft is either still pending or was already sent. */
export type DraftPromptStatus = "draft" | "sent";

/** One stored draft prompt. */
export interface DraftPromptRecord {
  /** Stable record identity, minted when the draft is created. */
  readonly id: string;
  /** Session that owns the draft and receives it when sent. */
  readonly sessionId: string;
  /** Owning workspace, resolved from the session cwd; empty when unowned. */
  readonly workspaceId: string;
  /** Prompt text exactly as the user wrote it. */
  readonly text: string;
  /** Send as `/plan <text>` instead of a plain prompt. */
  readonly sendInPlanMode: boolean;
  /** Fractional sort key: pending drafts ascend from the lowest value. */
  readonly order: number;
  readonly status: DraftPromptStatus;
  /** Canonical UTC instant of creation. */
  readonly createdAt: string;
  /** Canonical UTC instant of the last durable write. */
  readonly updatedAt: string;
  /** Canonical UTC instant the draft was sent; present exactly when sent. */
  readonly sentAt?: string;
}

/** Which drafts a list shows. */
export type DraftPromptScope =
  | { readonly kind: "session"; readonly sessionId: string }
  | { readonly kind: "workspace"; readonly workspaceId: string };

/** Wire description of one list request's result. */
export interface DraftPromptList {
  /** Every stored draft; the client applies its own scope filter. */
  readonly drafts: readonly DraftPromptRecord[];
  /** Workspace of the session that asked, or empty when it owns none. */
  readonly workspaceId: string;
}

/** Input for creating a pending draft; ids and timestamps are host-minted. */
export interface NewDraftPrompt {
  readonly id: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly text: string;
  readonly sendInPlanMode: boolean;
  /** Sort key; the store passes the current first-place value. */
  readonly order: number;
  readonly now: string;
}

/** Identity and placement of a pending draft copied from a sent one. */
export interface RedraftPromptInput {
  readonly id: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly order: number;
  readonly now: string;
}

/** Which side of a hovered card a dropped card should land on. */
export type DraftDropHalf = "before" | "after";

/** The editable half of a draft: its text and its plan-mode flag. */
export interface DraftEditState {
  /** Prompt text as the inline editor holds it. */
  readonly text: string;
  /** Whether the draft will send as `/plan <text>`. */
  readonly sendInPlanMode: boolean;
}

/** Where a draft's send goes: a slash command or the session prompt remote. */
export type DraftPromptSendTarget =
  | {
    readonly kind: "command";
    readonly sessionId: string;
    readonly requestId: string;
    /** Complete `/plan <text>` line, exactly the line `/plan` accepts. */
    readonly line: string;
  }
  | {
    readonly kind: "prompt";
    readonly sessionId: string;
    readonly requestId: string;
    readonly text: string;
  };

const RECORD_KEYS = new Set([
  "id",
  "sessionId",
  "workspaceId",
  "text",
  "sendInPlanMode",
  "order",
  "status",
  "createdAt",
  "updatedAt",
  "sentAt",
]);

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && INSTANT_RE.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Whether a value is a usable fractional sort key.
 * @param value - unknown candidate.
 * @returns true for a finite number, negative and fractional included.
 */
export function isDraftOrder(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate one stored record.
 * @param value - unknown value, typically decoded JSON.
 * @returns the record when every field is well-typed and consistent.
 */
export function isDraftPromptRecord(
  value: unknown,
): value is DraftPromptRecord {
  if (!isObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (!RECORD_KEYS.has(key)) return false;
  }
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.sessionId)) return false;
  if (typeof value.workspaceId !== "string") return false;
  if (!isNonEmptyString(value.text)) return false;
  if (typeof value.sendInPlanMode !== "boolean") return false;
  if (!isDraftOrder(value.order)) return false;
  if (value.status !== "draft" && value.status !== "sent") return false;
  if (!isInstant(value.createdAt) || !isInstant(value.updatedAt)) return false;
  const sent = value.status === "sent";
  if (sent) {
    if (!isInstant(value.sentAt)) return false;
  } else if (value.sentAt !== undefined) {
    return false;
  }
  return true;
}

/**
 * Explain why a value is not a draft record.
 * @param value - candidate record.
 * @returns null when valid, otherwise a short description of the first fault.
 */
export function draftPromptRecordError(value: unknown): string | null {
  if (isDraftPromptRecord(value)) return null;
  if (!isObject(value)) return "a draft record must be an object";
  for (const key of Object.keys(value)) {
    if (!RECORD_KEYS.has(key)) return `unknown field "${key}"`;
  }
  for (const key of ["id", "sessionId", "text"] as const) {
    if (!isNonEmptyString(value[key])) {
      return `"${key}" must be a non-empty string`;
    }
  }
  if (typeof value.workspaceId !== "string") {
    return '"workspaceId" must be a string';
  }
  if (typeof value.sendInPlanMode !== "boolean") {
    return '"sendInPlanMode" must be a boolean';
  }
  if (!isDraftOrder(value.order)) {
    return '"order" must be a finite number';
  }
  if (value.status !== "draft" && value.status !== "sent") {
    return '"status" must be "draft" or "sent"';
  }
  if (!isInstant(value.createdAt)) {
    return '"createdAt" must be a canonical instant';
  }
  if (!isInstant(value.updatedAt)) {
    return '"updatedAt" must be a canonical instant';
  }
  if (value.status === "sent" && !isInstant(value.sentAt)) {
    return 'a sent draft must carry "sentAt"';
  }
  if (value.status === "draft" && value.sentAt !== undefined) {
    return 'a pending draft must not carry "sentAt"';
  }
  return "invalid draft record";
}

/** Field-by-field equality of two records, the CAS precondition's comparison. */
export function draftPromptRecordsEqual(
  left: DraftPromptRecord,
  right: DraftPromptRecord,
): boolean {
  const leftKeys = Object.keys(left) as (keyof DraftPromptRecord)[];
  const rightKeys = Object.keys(right) as (keyof DraftPromptRecord)[];
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

/**
 * Decide whether a compare-and-swap write must be refused.
 * @param expected - the record the caller read and is saving over.
 * @param current - the record stored now.
 * @returns true when the write would overwrite a different record.
 */
export function draftPromptConflict(
  expected: DraftPromptRecord,
  current: DraftPromptRecord,
): boolean {
  return !draftPromptRecordsEqual(expected, current);
}

/**
 * Map a stored draft to the state its inline editor opens with.
 * @param draft - the record being edited.
 * @returns a copy of the editable text and plan flag.
 */
export function draftEditState(draft: DraftPromptRecord): DraftEditState {
  return { text: draft.text, sendInPlanMode: draft.sendInPlanMode };
}

/**
 * Compare two edit states field by field.
 * @param left - one edit state.
 * @param right - the other edit state.
 * @returns true when both the text and the plan flag match.
 */
export function draftEditStatesEqual(
  left: DraftEditState,
  right: DraftEditState,
): boolean {
  return left.text === right.text &&
    left.sendInPlanMode === right.sendInPlanMode;
}

/**
 * Whether an open editor holds changes the stored draft does not have. Both
 * halves of the edit count: replacing the text and flipping the plan flag each
 * make the state dirty, and restoring either one clears that part again.
 * @param draft - the stored record the editor is open against.
 * @param edit - the editor's current text and plan flag.
 * @returns true when an explicit Save would have something to write.
 */
export function draftEditDirty(
  draft: DraftPromptRecord,
  edit: DraftEditState,
): boolean {
  return !draftEditStatesEqual(draftEditState(draft), edit);
}

/**
 * Apply one inline edit to a draft. Identity, owner, status, and creation time
 * are unchanged; only the editable fields and the write instant move.
 * @param draft - the stored record the edit was made against.
 * @param edit - replacement text and plan flag.
 * @param now - canonical instant of this durable write.
 * @returns the record to store.
 */
export function editedDraftPrompt(
  draft: DraftPromptRecord,
  edit: DraftEditState,
  now: string,
): DraftPromptRecord {
  return {
    ...draft,
    text: edit.text,
    sendInPlanMode: edit.sendInPlanMode,
    updatedAt: now,
  };
}

/**
 * Move a pending draft to a new fractional order. Nothing but the order and the
 * write instant changes, so a sent copy would stay a sent copy; the store
 * refuses that case separately.
 * @param draft - the stored record the gesture was made against.
 * @param order - validated fractional sort key.
 * @param now - canonical instant of this durable write.
 * @returns the record to store.
 */
export function reorderedDraftPrompt(
  draft: DraftPromptRecord,
  order: number,
  now: string,
): DraftPromptRecord {
  return { ...draft, order, updatedAt: now };
}

/**
 * Compare two drafts for display. Status decides the block first: every pending
 * draft stays above every sent one. Pending drafts then ascend by their
 * fractional `order`, so a drag can place one between two neighbours; sent
 * records descend by send time, reading as an activity log. The id breaks a tie
 * so the result is total and does not depend on the input order.
 * @param left - one record.
 * @param right - the other record.
 * @returns a negative, zero, or positive sort result.
 */
export function compareDraftPrompts(
  left: DraftPromptRecord,
  right: DraftPromptRecord,
): number {
  const leftSent = left.status === "sent";
  const rightSent = right.status === "sent";
  if (leftSent !== rightSent) return leftSent ? 1 : -1;
  if (leftSent) {
    const time = (right.sentAt ?? "").localeCompare(left.sentAt ?? "");
    return time !== 0 ? time : left.id.localeCompare(right.id);
  }
  const order = left.order - right.order;
  return order !== 0 ? order : left.id.localeCompare(right.id);
}

/**
 * Order drafts for the tab: pending before sent, in this first block by their
 * fractional order and in the sent block newest first.
 * @param drafts - records to order, left untouched.
 * @returns a new array in display order.
 */
export function sortDraftPrompts(
  drafts: readonly DraftPromptRecord[],
): DraftPromptRecord[] {
  return [...drafts].sort(compareDraftPrompts);
}

/**
 * The order value that puts a new draft first: one below the current minimum,
 * or zero when nothing is stored yet. A negative minimum keeps descending
 * without renumbering any record.
 * @param drafts - every stored record.
 * @returns the `order` a newly created or redrafted draft should take.
 */
export function firstDraftOrder(
  drafts: readonly DraftPromptRecord[],
): number {
  if (drafts.length === 0) return 0;
  return Math.min(...drafts.map((draft) => draft.order)) - 1;
}

/**
 * The fractional order a dropped draft takes between the two records now around
 * it. Dropping above the first record steps below it, below the last steps
 * above it, and between two records takes their midpoint, so neighbours never
 * have to be renumbered.
 * @param before - record the moved draft lands after, or undefined at the top.
 * @param after - record the moved draft lands before, or undefined at the end.
 * @returns the new order, or null when there is nowhere to land.
 */
export function betweenDraftOrders(
  before: DraftPromptRecord | undefined,
  after: DraftPromptRecord | undefined,
): number | null {
  if (before === undefined) {
    return after === undefined ? null : after.order - 1;
  }
  if (after === undefined) return before.order + 1;
  return (before.order + after.order) / 2;
}

/**
 * Resolve one drag-and-drop gesture over the pending list into the moved
 * draft's new order. The target's half decides the insertion index in the list
 * with the moved draft taken out; landing where the draft already sits is a
 * no-op, so releasing it in place writes nothing.
 * @param pending - pending drafts in display order.
 * @param movingId - id of the draft being dragged.
 * @param targetId - id of the card under the pointer.
 * @param half - the half of the target the pointer is on.
 * @returns the order to persist, or null when the drop changes nothing.
 */
export function draftDropOrder(
  pending: readonly DraftPromptRecord[],
  movingId: string,
  targetId: string,
  half: DraftDropHalf,
): number | null {
  if (movingId === targetId) return null;
  const movingIndex = pending.findIndex((draft) => draft.id === movingId);
  const target = pending.find((draft) => draft.id === targetId);
  if (movingIndex < 0 || target === undefined) return null;
  const without = pending.filter((draft) => draft.id !== movingId);
  const targetIndex = without.findIndex((draft) => draft.id === targetId);
  if (targetIndex < 0) return null;
  const insert = half === "before" ? targetIndex : targetIndex + 1;
  if (insert === movingIndex) return null;
  return betweenDraftOrders(without[insert - 1], without[insert]);
}

/**
 * Keep only the drafts visible under one scope.
 * @param drafts - records to filter.
 * @param scope - the tab's session or workspace selection.
 * @returns the matching records, in their input order.
 */
export function filterDraftPrompts(
  drafts: readonly DraftPromptRecord[],
  scope: DraftPromptScope,
): DraftPromptRecord[] {
  if (scope.kind === "session") {
    return drafts.filter((draft) => draft.sessionId === scope.sessionId);
  }
  if (scope.workspaceId === "") return [];
  return drafts.filter((draft) => draft.workspaceId === scope.workspaceId);
}

/**
 * Map a draft to the transport call that sends it. Plan mode is the `/plan`
 * command, which both turns plan mode on and steers the message; every other
 * draft is a plain queued prompt.
 * @param draft - record being sent.
 * @param requestId - idempotency identity carried by this send.
 * @returns the command line or prompt payload to submit.
 */
export function draftPromptSendTarget(
  draft: DraftPromptRecord,
  requestId: string,
): DraftPromptSendTarget {
  if (draft.sendInPlanMode) {
    return {
      kind: "command",
      sessionId: draft.sessionId,
      requestId,
      line: `/plan ${draft.text}`,
    };
  }
  return {
    kind: "prompt",
    sessionId: draft.sessionId,
    requestId,
    text: draft.text,
  };
}

/**
 * Mint one pending draft.
 * @param input - identity, owner, text, plan flag, order, and the current instant.
 * @returns the record to store.
 */
export function newDraftPrompt(input: NewDraftPrompt): DraftPromptRecord {
  if (input.text.trim() === "") {
    throw new Error("draft text must not be empty");
  }
  if (!isDraftOrder(input.order)) {
    throw new Error("draft order must be a finite number");
  }
  const record: DraftPromptRecord = {
    id: input.id,
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    text: input.text,
    sendInPlanMode: input.sendInPlanMode,
    order: input.order,
    status: "draft",
    createdAt: input.now,
    updatedAt: input.now,
  };
  return record;
}

/**
 * Copy a sent (or pending) draft into a fresh pending one. The text and plan
 * flag carry over; the new record gets its own identity, owner, and first-place
 * order, and the source stays untouched.
 * @param source - record being redrafted.
 * @param input - new identity, owner, first-place order, and current instant.
 * @returns the new pending record.
 */
export function redraftedDraftPrompt(
  source: DraftPromptRecord,
  input: RedraftPromptInput,
): DraftPromptRecord {
  return newDraftPrompt({
    ...input,
    text: source.text,
    sendInPlanMode: source.sendInPlanMode,
  });
}
