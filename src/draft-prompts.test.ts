// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  betweenDraftOrders,
  compareDraftPrompts,
  draftDropOrder,
  draftEditDirty,
  type DraftEditState,
  draftEditState,
  draftEditStatesEqual,
  draftPromptConflict,
  type DraftPromptRecord,
  draftPromptRecordError,
  draftPromptRecordsEqual,
  draftPromptSendTarget,
  editedDraftPrompt,
  filterDraftPrompts,
  firstDraftOrder,
  isDraftPromptRecord,
  newDraftPrompt,
  redraftedDraftPrompt,
  reorderedDraftPrompt,
  sortDraftPrompts,
} from "./draft-prompts.js";

const CREATED = "2026-01-01T00:00:00.000Z";
const UPDATED = "2026-01-01T00:00:01.000Z";

function draft(over: Partial<DraftPromptRecord> = {}): DraftPromptRecord {
  return {
    id: "d1",
    sessionId: "s1",
    workspaceId: "w1",
    text: "hello",
    sendInPlanMode: false,
    order: 0,
    status: "draft",
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...over,
  };
}

test("record validation accepts pending and sent records", () => {
  assert.equal(draftPromptRecordError(draft()), null);
  assert.equal(
    draftPromptRecordError(
      draft({ status: "sent", sentAt: "2026-01-02T00:00:00.000Z" }),
    ),
    null,
  );
  assert.equal(isDraftPromptRecord(draft()), true);
});

test("record validation rejects every malformed field shape", () => {
  const cases: readonly [string, unknown][] = [
    ["not an object", null],
    ["unknown field", { ...draft(), extra: true }],
    ["empty id", draft({ id: "" })],
    ["empty session", draft({ sessionId: "" })],
    ["non-string workspace", { ...draft(), workspaceId: 7 }],
    ["empty text", draft({ text: "   " })],
    ["non-boolean plan flag", { ...draft(), sendInPlanMode: "yes" }],
    ["missing order", { ...draft(), order: undefined }],
    ["non-number order", { ...draft(), order: "1" }],
    ["NaN order", draft({ order: Number.NaN })],
    ["infinite order", draft({ order: Number.POSITIVE_INFINITY })],
    ["bad status", { ...draft(), status: "queued" }],
    ["bad createdAt", draft({ createdAt: "yesterday" })],
    ["bad updatedAt", draft({ updatedAt: "2026-01-01" })],
    ["sent without sentAt", draft({ status: "sent" })],
    [
      "pending with sentAt",
      draft({ sentAt: "2026-01-02T00:00:00.000Z" }),
    ],
  ];
  for (const [label, value] of cases) {
    assert.equal(isDraftPromptRecord(value), false, label);
    assert.notEqual(draftPromptRecordError(value), null, label);
  }
});

test("conflict detection compares the whole record read", () => {
  const expected = draft();
  assert.equal(draftPromptRecordsEqual(expected, draft()), true);
  assert.equal(draftPromptConflict(expected, draft()), false);
  assert.equal(draftPromptConflict(expected, draft({ text: "changed" })), true);
  assert.equal(
    draftPromptConflict(
      expected,
      draft({ updatedAt: "2026-01-01T00:00:02.000Z" }),
    ),
    true,
  );
  assert.equal(
    draftPromptConflict(
      expected,
      draft({ status: "sent", sentAt: "2026-01-02T00:00:00.000Z" }),
    ),
    true,
  );
});

test("status decides the block: every pending draft is above every sent one", () => {
  const pending = draft({ id: "p", order: 100, createdAt: CREATED });
  const sent = draft({
    id: "s",
    order: -100,
    status: "sent",
    sentAt: CREATED,
  });
  assert.ok(compareDraftPrompts(pending, sent) < 0);
  assert.ok(compareDraftPrompts(sent, pending) > 0);
  assert.deepEqual(
    sortDraftPrompts([sent, pending]).map((item) => item.id),
    ["p", "s"],
  );
});

test("pending drafts ascend by order, not by creation time", () => {
  const later = draft({
    id: "later-created-first",
    order: -2,
    createdAt: "2026-01-02T00:00:00.000Z",
  });
  const earlier = draft({
    id: "earlier-created-second",
    order: 3.5,
    createdAt: CREATED,
  });
  assert.ok(compareDraftPrompts(later, earlier) < 0);
  assert.deepEqual(
    sortDraftPrompts([earlier, later]).map((item) => item.id),
    ["later-created-first", "earlier-created-second"],
  );
});

test("sent drafts descend by send time", () => {
  const older = draft({
    id: "older",
    status: "sent",
    sentAt: "2026-01-01T00:00:03.000Z",
  });
  const newer = draft({
    id: "newer",
    status: "sent",
    sentAt: "2026-01-01T00:00:04.000Z",
  });
  assert.ok(compareDraftPrompts(newer, older) < 0);
  assert.deepEqual(
    sortDraftPrompts([older, newer]).map((item) => item.id),
    ["newer", "older"],
  );
});

test("the id is a stable total tiebreak inside each block", () => {
  const first = draft({ id: "b", order: 1 });
  const second = draft({ id: "a", order: 1 });
  assert.ok(compareDraftPrompts(first, second) > 0);
  assert.equal(compareDraftPrompts(first, draft({ id: "b", order: 1 })), 0);
  assert.deepEqual(
    sortDraftPrompts([first, second]).map((item) => item.id),
    ["a", "b"],
  );
  const sentA = draft({ id: "a", status: "sent", sentAt: CREATED });
  const sentB = draft({ id: "b", status: "sent", sentAt: CREATED });
  assert.deepEqual(
    sortDraftPrompts([sentB, sentA]).map((item) => item.id),
    ["a", "b"],
  );
});

test("a new draft takes one below the current minimum order", () => {
  assert.equal(firstDraftOrder([]), 0);
  assert.equal(
    firstDraftOrder([
      draft({ id: "a", order: 4 }),
      draft({ id: "b", order: -2.5 }),
      draft({ id: "c", order: 9 }),
    ]),
    -3.5,
  );
  // Sent records still contribute their frozen order to the minimum.
  assert.equal(
    firstDraftOrder([
      draft({ id: "a", order: 1 }),
      draft({ id: "s", order: -8, status: "sent", sentAt: CREATED }),
    ]),
    -9,
  );
});

test("a drop between neighbours takes the midpoint", () => {
  const a = draft({ id: "a", order: -1 });
  const b = draft({ id: "b", order: 3 });
  assert.equal(betweenDraftOrders(a, b), 1);
  assert.equal(draftDropOrder([a, b], "b", "a", "before"), -2);
  assert.equal(draftDropOrder([a, b], "a", "b", "after"), 4);
  const c = draft({ id: "c", order: 7 });
  // Dropping a between b and c: the midpoint of their orders.
  assert.equal(draftDropOrder([a, b, c], "a", "b", "after"), 5);
  assert.equal(draftDropOrder([a, b, c], "a", "c", "before"), 5);
});

test("a drop at either end steps past the terminal neighbour", () => {
  const a = draft({ id: "a", order: 0 });
  const b = draft({ id: "b", order: 1 });
  const c = draft({ id: "c", order: 2 });
  const all = [a, b, c];
  assert.equal(draftDropOrder(all, "c", "a", "before"), -1);
  assert.equal(draftDropOrder(all, "a", "c", "after"), 3);
});

test("a drop that would not move the card is a no-op", () => {
  const a = draft({ id: "a", order: 0 });
  const b = draft({ id: "b", order: 1 });
  const c = draft({ id: "c", order: 2 });
  const all = [a, b, c];
  // Releasing the first card on the top of its own row, or on the next row's
  // top, changes nothing; the same holds at the bottom.
  assert.equal(draftDropOrder(all, "a", "a", "before"), null);
  assert.equal(draftDropOrder(all, "a", "b", "before"), null);
  assert.equal(draftDropOrder(all, "c", "b", "after"), null);
  assert.equal(draftDropOrder(all, "c", "c", "after"), null);
  assert.equal(draftDropOrder(all, "missing", "b", "after"), null);
  assert.equal(betweenDraftOrders(undefined, undefined), null);
});

test("a reorder changes only the order and write time", () => {
  const before = draft({ order: 0, text: "keep", updatedAt: UPDATED });
  const at = "2026-01-01T00:00:09.000Z";
  assert.deepEqual(reorderedDraftPrompt(before, 2.5, at), {
    ...before,
    order: 2.5,
    updatedAt: at,
  });
  assert.equal(before.order, 0);
});

test("redrafting copies text and plan flag into a first-place pending draft", () => {
  const source = draft({
    id: "sent-1",
    sessionId: "s1",
    workspaceId: "w1",
    text: "plan this",
    sendInPlanMode: true,
    status: "sent",
    sentAt: "2026-01-02T00:00:00.000Z",
  });
  const before = { ...source };
  const copy = redraftedDraftPrompt(source, {
    id: "copy-1",
    sessionId: "s2",
    workspaceId: "w2",
    order: -4,
    now: "2026-01-03T00:00:00.000Z",
  });
  assert.deepEqual(copy, {
    id: "copy-1",
    sessionId: "s2",
    workspaceId: "w2",
    text: "plan this",
    sendInPlanMode: true,
    order: -4,
    status: "draft",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  });
  assert.deepEqual(source, before, "the sent source must stay frozen");
});

test("scope filtering switches between session and workspace", () => {
  const mine = draft({ id: "mine", sessionId: "s1", workspaceId: "w1" });
  const sibling = draft({ id: "sibling", sessionId: "s2", workspaceId: "w1" });
  const other = draft({ id: "other", sessionId: "s3", workspaceId: "w2" });
  const unowned = draft({ id: "unowned", sessionId: "s4", workspaceId: "" });
  const all = [mine, sibling, other, unowned];

  assert.deepEqual(
    filterDraftPrompts(all, { kind: "session", sessionId: "s1" }).map((item) =>
      item.id
    ),
    ["mine"],
  );
  assert.deepEqual(
    filterDraftPrompts(all, { kind: "workspace", workspaceId: "w1" }).map((
      item,
    ) => item.id),
    ["mine", "sibling"],
  );
  assert.deepEqual(
    filterDraftPrompts(all, { kind: "workspace", workspaceId: "" }),
    [],
  );
});

test("plan drafts map to /plan, other drafts to a queued prompt", () => {
  const requestId = "req-1";
  assert.deepEqual(
    draftPromptSendTarget(
      draft({ text: "do it", sendInPlanMode: true }),
      requestId,
    ),
    {
      kind: "command",
      sessionId: "s1",
      requestId,
      line: "/plan do it",
    },
  );
  assert.deepEqual(
    draftPromptSendTarget(draft({ text: "do it" }), requestId),
    {
      kind: "prompt",
      sessionId: "s1",
      requestId,
      text: "do it",
    },
  );
});

test("a draft maps to the edit state its editor opens with", () => {
  const record = draft({ text: "keep this", sendInPlanMode: true });
  assert.deepEqual(draftEditState(record), {
    text: "keep this",
    sendInPlanMode: true,
  });
});

test("edit states compare both the text and the plan flag", () => {
  const state: DraftEditState = { text: "same", sendInPlanMode: false };
  assert.equal(draftEditStatesEqual(state, { ...state }), true);
  assert.equal(
    draftEditStatesEqual(state, { text: "other", sendInPlanMode: false }),
    false,
  );
  assert.equal(
    draftEditStatesEqual(state, { text: "same", sendInPlanMode: true }),
    false,
  );
});

test("dirty detection compares both the text and the plan flag", () => {
  const record = draft({ text: "stored", sendInPlanMode: false });
  assert.equal(
    draftEditDirty(record, { text: "stored", sendInPlanMode: false }),
    false,
  );
  assert.equal(
    draftEditDirty(record, { text: "edited", sendInPlanMode: false }),
    true,
  );
  assert.equal(
    draftEditDirty(record, { text: "stored", sendInPlanMode: true }),
    true,
  );
  assert.equal(
    draftEditDirty(record, { text: "stored ", sendInPlanMode: false }),
    true,
  );
  assert.equal(
    draftEditDirty(record, { text: "edited", sendInPlanMode: true }),
    true,
  );
  // Restoring both halves clears dirtiness again.
  assert.equal(
    draftEditDirty(record, { text: "stored", sendInPlanMode: false }),
    false,
  );
});

test("an edited draft keeps identity and takes text, plan flag, write time", () => {
  const before = draft({
    text: "old",
    sendInPlanMode: false,
    status: "draft",
    createdAt: CREATED,
    updatedAt: UPDATED,
  });
  const at = "2026-01-01T00:00:09.000Z";
  assert.deepEqual(
    editedDraftPrompt(before, { text: "new", sendInPlanMode: true }, at),
    {
      ...before,
      text: "new",
      sendInPlanMode: true,
      updatedAt: at,
    },
  );
  // The stored record is untouched by the pure builder.
  assert.equal(before.text, "old");
  assert.equal(before.sendInPlanMode, false);
});

test("a new draft starts pending with one timestamp", () => {
  const record = newDraftPrompt({
    id: "d9",
    sessionId: "s1",
    workspaceId: "w1",
    text: "fresh",
    sendInPlanMode: true,
    order: -1,
    now: CREATED,
  });
  assert.deepEqual(record, {
    id: "d9",
    sessionId: "s1",
    workspaceId: "w1",
    text: "fresh",
    sendInPlanMode: true,
    order: -1,
    status: "draft",
    createdAt: CREATED,
    updatedAt: CREATED,
  });
  assert.throws(() =>
    newDraftPrompt({
      id: "d9",
      sessionId: "s1",
      workspaceId: "w1",
      text: "  ",
      sendInPlanMode: false,
      order: 0,
      now: CREATED,
    })
  );
  assert.throws(() =>
    newDraftPrompt({
      id: "d9",
      sessionId: "s1",
      workspaceId: "w1",
      text: "fresh",
      sendInPlanMode: false,
      order: Number.NaN,
      now: CREATED,
    })
  );
});
