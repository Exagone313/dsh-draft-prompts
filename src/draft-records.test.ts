// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  readStoredDraftPrompt,
  recoverStoredDraftPrompts,
} from "./draft-records.js";
import { sortDraftPrompts } from "./draft-prompts.js";

const CREATED = "2026-01-01T00:00:00.000Z";

/** A record as an older version wrote it: every field except `order`. */
function legacy(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "d1",
    sessionId: "s1",
    workspaceId: "w1",
    text: "hello",
    sendInPlanMode: false,
    status: "draft",
    createdAt: CREATED,
    updatedAt: CREATED,
    ...over,
  };
}

test("a legacy record without order is migrated from its update time", () => {
  const updatedAt = "2026-01-02T03:04:05.006Z";
  const read = readStoredDraftPrompt(legacy({ updatedAt }));
  assert.equal(read.kind, "record");
  if (read.kind !== "record") return;
  assert.equal(read.migrated, true);
  assert.equal(read.record.order, -Date.parse(updatedAt));
});

test("migrated orders reproduce the old newest-first display order", () => {
  const entries: [string, unknown][] = [
    ["oldest", legacy({ id: "oldest", updatedAt: "2026-01-01T00:00:00.000Z" })],
    ["newest", legacy({ id: "newest", updatedAt: "2026-03-01T00:00:00.000Z" })],
    ["middle", legacy({ id: "middle", updatedAt: "2026-02-01T00:00:00.000Z" })],
  ];
  const first = recoverStoredDraftPrompts(entries);
  assert.deepEqual(first.dropped, []);
  assert.equal(first.migrated.length, 3);
  assert.deepEqual(
    sortDraftPrompts(first.records.map(([, record]) => record)).map((
      record,
    ) => record.id),
    ["newest", "middle", "oldest"],
  );
  // The derivation is deterministic: a second read assigns the same orders.
  const second = recoverStoredDraftPrompts(entries);
  assert.deepEqual(
    second.records.map(([, record]) => record.order),
    first.records.map(([, record]) => record.order),
  );
});

test("an existing order is kept and not reported as migrated", () => {
  const read = readStoredDraftPrompt(legacy({ order: 7.5 }));
  assert.equal(read.kind, "record");
  if (read.kind !== "record") return;
  assert.equal(read.migrated, false);
  assert.equal(read.record.order, 7.5);
});

test("a corrupt record is dropped without losing the recoverable ones", () => {
  const recovered = recoverStoredDraftPrompts([
    ["good", legacy({ id: "good" })],
    ["no-text", { ...legacy({ id: "no-text" }), text: "" }],
    ["not-an-object", "nope"],
    ["bad-order", legacy({ id: "bad-order", order: null })],
    ["legacy", legacy({ id: "legacy", updatedAt: "2026-02-01T00:00:00.000Z" })],
  ]);
  assert.deepEqual(
    recovered.records.map(([key]) => key),
    ["good", "legacy"],
  );
  assert.deepEqual(
    recovered.migrated.map(([key]) => key),
    ["good", "legacy"],
  );
  assert.deepEqual(
    recovered.dropped.map(({ key }) => key),
    ["no-text", "not-an-object", "bad-order"],
  );
  assert.match(
    recovered.dropped.find(({ key }) => key === "no-text")?.reason ?? "",
    /"text"/u,
  );
  assert.match(
    recovered.dropped.find(({ key }) => key === "bad-order")?.reason ?? "",
    /"order"/u,
  );
});
