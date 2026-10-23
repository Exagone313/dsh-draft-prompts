// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmedDraftAction,
  DRAFT_CONFIRM_PREVIEW_LENGTH,
  draftConfirmationPreview,
  draftDeleteCopy,
  draftDiscardPreview,
  draftEditDecision,
  draftFailureReason,
  draftRowActions,
} from "./draft-actions.js";
import { en, zh } from "./locales.js";
import type { DraftPromptRecord } from "./draft-prompts.js";
import { DraftPromptRequestError } from "./draft-protocol.js";

const CREATED = "2026-01-01T00:00:00.000Z";
const UPDATED = "2026-01-01T00:00:01.000Z";

function storedDraft(
  over: Partial<DraftPromptRecord> = {},
): DraftPromptRecord {
  return {
    id: "d1",
    sessionId: "s1",
    workspaceId: "w1",
    text: "stored",
    sendInPlanMode: false,
    order: 0,
    status: "draft",
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...over,
  };
}

test("every card state pins its control order", () => {
  const cases = [
    ["draft", false, ["send", "edit", "delete"]],
    ["draft", true, ["save", "cancel"]],
    ["sent", false, ["redraft", "delete"]],
    ["sent", true, ["save", "cancel"]],
  ] as const;
  for (const [status, editing, expected] of cases) {
    assert.deepEqual(
      draftRowActions(status, editing),
      expected,
      `${status}, editing=${editing}`,
    );
  }
});

test("editing hides send, redraft and delete, keeping save then cancel", () => {
  for (const status of ["draft", "sent"] as const) {
    const actions = draftRowActions(status, true);
    assert.deepEqual(actions, ["save", "cancel"]);
    assert.ok(!actions.includes("send"), "send must be hidden while editing");
    assert.ok(
      !actions.includes("redraft"),
      "redraft must be hidden while editing",
    );
    assert.ok(
      !actions.includes("delete"),
      "delete must be hidden while editing",
    );
  }
  // Closing the editor restores the read-only controls.
  assert.deepEqual(
    draftRowActions("draft", false),
    ["send", "edit", "delete"],
  );
  assert.deepEqual(draftRowActions("sent", false), ["redraft", "delete"]);
});

test("the delete confirmation copy follows the record status", () => {
  assert.deepEqual(draftDeleteCopy("draft"), {
    title: "confirm.deleteDraftTitle",
    description: "confirm.deleteDraftDescription",
  });
  assert.deepEqual(draftDeleteCopy("sent"), {
    title: "confirm.deleteSentTitle",
    description: "confirm.deleteSentDescription",
  });
  const sent = draftDeleteCopy("sent");
  for (const dictionary of [en, zh]) {
    assert.match(dictionary[sent.title], /sent prompt|已发送/u);
    assert.match(dictionary[sent.description], /sent prompt|已发送/u);
  }
});

test("send and delete only run once confirmed", () => {
  assert.equal(confirmedDraftAction(null, "draft", false), null);
  assert.equal(confirmedDraftAction("send", "draft", false), "send");
  assert.equal(confirmedDraftAction("delete", "draft", false), "delete");
});

test("a confirmation cannot run while editing or for a stale action", () => {
  assert.equal(confirmedDraftAction("send", "draft", true), null);
  assert.equal(confirmedDraftAction("delete", "draft", true), null);
  // A refetch may have frozen the record between opening and confirming.
  assert.equal(confirmedDraftAction("send", "sent", false), null);
  // Deleting a sent receipt is still a valid confirmed action.
  assert.equal(confirmedDraftAction("delete", "sent", false), "delete");
});

test("discarding is confirmed only while an editor is open", () => {
  assert.equal(confirmedDraftAction("discard", "draft", false), null);
  assert.equal(confirmedDraftAction("discard", "sent", false), null);
  assert.equal(confirmedDraftAction("discard", "draft", true), "discard");
});

test("cancel closes at once without a prompt when nothing changed", () => {
  assert.deepEqual(
    draftEditDecision(
      storedDraft(),
      { text: "stored", sendInPlanMode: false },
      "cancel",
    ),
    { write: null, close: true, confirmDiscard: false },
  );
});

test("cancel asks before discarding a text or plan-flag change", () => {
  for (
    const edit of [
      { text: "edited", sendInPlanMode: false },
      { text: "stored", sendInPlanMode: true },
      { text: "edited", sendInPlanMode: true },
    ]
  ) {
    assert.deepEqual(
      draftEditDecision(storedDraft(), edit, "cancel"),
      { write: null, close: false, confirmDiscard: true },
    );
  }
});

test("only Save produces a write, and it closes the editor", () => {
  const edited = { text: "edited", sendInPlanMode: true };
  // Editing state alone is local: cancel writes nothing, even when dirty.
  assert.equal(
    draftEditDecision(storedDraft(), edited, "cancel").write,
    null,
  );
  assert.deepEqual(
    draftEditDecision(storedDraft(), edited, "save"),
    { write: edited, close: true, confirmDiscard: false },
  );
  // An unchanged draft needs no write, and Save still closes the editor.
  assert.deepEqual(
    draftEditDecision(
      storedDraft(),
      { text: "stored", sendInPlanMode: false },
      "save",
    ),
    { write: null, close: true, confirmDiscard: false },
  );
  // Empty text is never a valid write, matching the store's rule.
  assert.deepEqual(
    draftEditDecision(
      storedDraft(),
      { text: "  ", sendInPlanMode: false },
      "save",
    ),
    { write: null, close: true, confirmDiscard: false },
  );
});

test("a discard shows the unsaved edit and the stored version", () => {
  const preview = draftDiscardPreview(
    storedDraft(),
    { text: "edited", sendInPlanMode: false },
  );
  assert.equal(preview.sameText, false);
  assert.deepEqual(
    preview.sides.map((side) => side.role),
    ["discarded", "stored"],
    "a text change must show both versions",
  );
  assert.deepEqual(
    preview.sides.map((side) => side.text),
    ["edited", "stored"],
  );
});

test("each discard side keeps its own plan flag", () => {
  for (const [storedPlan, editPlan] of [[false, true], [true, false]]) {
    const preview = draftDiscardPreview(
      storedDraft({ sendInPlanMode: storedPlan }),
      { text: "edited", sendInPlanMode: editPlan },
    );
    assert.equal(preview.discarded.role, "discarded");
    assert.equal(preview.discarded.sendInPlanMode, editPlan);
    assert.equal(preview.stored.role, "stored");
    assert.equal(preview.stored.sendInPlanMode, storedPlan);
    assert.deepEqual(
      preview.sides.map((side) => side.sendInPlanMode),
      [editPlan, storedPlan],
      "the rendered sides must not swap their flags",
    );
  }
});

test("an identical text shows one block and both plan flags", () => {
  const preview = draftDiscardPreview(
    storedDraft({ text: "stored", sendInPlanMode: false }),
    { text: "stored", sendInPlanMode: true },
  );
  assert.equal(preview.sameText, true);
  assert.deepEqual(
    preview.sides.map((side) => side.role),
    ["discarded"],
    "a plan-only change must not repeat the same text",
  );
  assert.equal(preview.discarded.text, "stored");
  assert.equal(preview.discarded.sendInPlanMode, true);
  assert.equal(preview.stored.sendInPlanMode, false);
});

test("the preview names the first non-empty trimmed line", () => {
  assert.equal(draftConfirmationPreview("one line"), "one line");
  assert.equal(
    draftConfirmationPreview("\n\n   first line  \nsecond line"),
    "first line",
  );
  assert.equal(draftConfirmationPreview("  padded  "), "padded");
  assert.equal(draftConfirmationPreview(""), "");
  assert.equal(draftConfirmationPreview(" \n\t\n"), "");
});

test("a load failure keeps the underlying reason", () => {
  assert.equal(
    draftFailureReason(
      new DraftPromptRequestError("internal", "store open failed (status 500)"),
    ),
    "store open failed (status 500)",
  );
  assert.equal(draftFailureReason(new Error("network down")), "network down");
  assert.equal(draftFailureReason(new Error("  ")), "");
  assert.equal(draftFailureReason("plain failure"), "plain failure");
});

test("the preview is shortened without splitting a code point", () => {
  const long = "a".repeat(DRAFT_CONFIRM_PREVIEW_LENGTH + 20);
  const preview = draftConfirmationPreview(long);
  assert.equal(
    Array.from(preview).length,
    DRAFT_CONFIRM_PREVIEW_LENGTH + 1,
  );
  assert.ok(preview.endsWith("…"));

  const emoji = draftConfirmationPreview(
    "😀".repeat(DRAFT_CONFIRM_PREVIEW_LENGTH + 5),
  );
  assert.equal(
    Array.from(emoji).length,
    DRAFT_CONFIRM_PREVIEW_LENGTH + 1,
  );
  assert.ok(emoji.endsWith("…"));
});
