// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  DraftPromptConflictError,
  DraftPromptFrozenError,
  DraftPromptInvalidError,
  DraftPromptNotFoundError,
  DraftPromptStore,
  type DraftPromptTable,
  type RawDraftPromptTable,
  RecoveringDraftPromptTable,
} from "./draft-store.js";
import { readStoredDraftPrompt } from "./draft-records.js";
import type { DraftPromptRecord } from "./draft-prompts.js";

/** In-memory table with the domain's queue-free update semantics. */
class FakeTable implements DraftPromptTable {
  private readonly records = new Map<string, DraftPromptRecord>();

  get(key: string): DraftPromptRecord | undefined {
    return this.records.get(key);
  }

  entries(): IterableIterator<[string, DraftPromptRecord]> {
    return this.records.entries();
  }

  async put(key: string, value: DraftPromptRecord): Promise<void> {
    this.records.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.records.delete(key);
  }

  async update(
    key: string,
    transform: (current: DraftPromptRecord) => DraftPromptRecord,
  ): Promise<DraftPromptRecord> {
    const current = this.records.get(key);
    if (current === undefined) throw new DraftPromptNotFoundError(key);
    const next = transform(current);
    this.records.set(key, next);
    return next;
  }
}

function makeStore(workspace = "w1"): {
  store: DraftPromptStore;
  table: FakeTable;
  setNow: (value: string) => void;
  now: () => string;
} {
  let nextId = 0;
  let clock = 0;
  const now = (): string =>
    new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();
  const table = new FakeTable();
  const store = new DraftPromptStore(table, {
    resolveWorkspaceId: async (sessionId) =>
      sessionId === "unowned" ? "" : workspace,
    mintId: () => `id-${++nextId}`,
    now,
  });
  return {
    store,
    table,
    setNow: (value: string) => {
      clock = Math.floor((Date.parse(value) - Date.UTC(2026, 0, 1)) / 1000);
    },
    now,
  };
}

test("create resolves the workspace and stores a pending draft", async () => {
  const { store } = makeStore("w9");
  const created = await store.create("s1", "hello", false);
  assert.equal(created.workspaceId, "w9");
  assert.equal(created.status, "draft");
  assert.equal(created.text, "hello");
  assert.equal(created.order, 0);
  assert.deepEqual(store.list(), [created]);
});

test("each new draft takes the place above the current first one", async () => {
  const { store } = makeStore();
  const first = await store.create("s1", "first", false);
  const second = await store.create("s1", "second", false);
  assert.equal(second.order, first.order - 1);
  assert.deepEqual(
    store.list().map((draft) => draft.text),
    ["second", "first"],
  );
});

test("update is a compare-and-swap on the whole record", async () => {
  const { store } = makeStore();
  const created = await store.create("s1", "hello", false);
  const updated = await store.update(created, "hello there", true);
  assert.equal(updated.text, "hello there");
  assert.equal(updated.sendInPlanMode, true);
  assert.equal(updated.status, "draft");
  assert.equal(updated.createdAt, created.createdAt);
  assert.notEqual(updated.updatedAt, created.updatedAt);
  await assert.rejects(
    store.update(created, "stale write", false),
    DraftPromptConflictError,
  );
  assert.equal(store.list()[0]?.text, "hello there");
  assert.equal(store.list()[0]?.sendInPlanMode, true);
});

test("update saves a plan-mode toggle without a text change", async () => {
  const { store } = makeStore();
  const created = await store.create("s1", "hello", false);
  const updated = await store.update(created, "hello", true);
  assert.equal(updated.text, "hello");
  assert.equal(updated.sendInPlanMode, true);
  assert.equal(store.list()[0]?.sendInPlanMode, true);
});

test("a sent draft is frozen against edits", async () => {
  const { store } = makeStore();
  const created = await store.create("s1", "hello", false);
  const sent = await store.markSent(created);
  assert.equal(sent.status, "sent");
  assert.equal(typeof sent.sentAt, "string");
  await assert.rejects(
    store.update(created, "changed after send", true),
    DraftPromptFrozenError,
  );
  // Repeating the same mark-sent call is idempotent, matching a double click.
  assert.deepEqual(await store.markSent(created), sent);
});

test("mark-sent refuses a stale read", async () => {
  const { store } = makeStore();
  const created = await store.create("s1", "hello", false);
  await store.update(created, "newer", false);
  await assert.rejects(store.markSent(created), DraftPromptConflictError);
});

test("reorder is a compare-and-swap that only writes a pending order", async () => {
  const { store } = makeStore();
  const first = await store.create("s1", "first", false);
  const second = await store.create("s1", "second", false);
  assert.equal(second.order, first.order - 1);
  // Moving the first draft below the second, then a conflicting replay.
  const moved = await store.reorder(first, 2.5);
  assert.equal(moved.order, 2.5);
  assert.equal(moved.text, "first");
  assert.notEqual(moved.updatedAt, first.updatedAt);
  assert.deepEqual(
    store.list().map((draft) => draft.text),
    ["second", "first"],
  );
  await assert.rejects(store.reorder(first, -5), DraftPromptConflictError);
});

test("a sent draft cannot be reordered", async () => {
  const { store } = makeStore();
  const created = await store.create("s1", "hello", false);
  const sent = await store.markSent(created);
  await assert.rejects(store.reorder(sent, 4), DraftPromptFrozenError);
  assert.equal(store.list()[0]?.order, created.order);
});

test("redraft copies text and plan flag into a first-place pending draft", async () => {
  const { store } = makeStore("w1");
  const source = await store.create("s1", "plan this", true);
  const sent = await store.markSent(source);
  const newer = await store.create("s1", "newer first", false);
  const copy = await store.redraft(sent.id, "s2");
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.text, "plan this");
  assert.equal(copy.sendInPlanMode, true);
  assert.equal(copy.status, "draft");
  assert.equal(copy.sessionId, "s2");
  assert.equal(copy.workspaceId, "w1");
  assert.ok(copy.order < newer.order, "a redraft is ordered first");
  // The sent source keeps its identity, text, status and order.
  assert.deepEqual(store.list().find((draft) => draft.id === sent.id), sent);
});

test("delete removes an existing record and misses are visible", async () => {
  const { store } = makeStore();
  const created = await store.create("s1", "hello", false);
  assert.equal(await store.delete(created.id), true);
  assert.deepEqual(store.list(), []);
  assert.equal(await store.delete(created.id), false);
});

/** Raw table holding whatever a previous version stored, including legacy data. */
class FakeRawTable implements RawDraftPromptTable {
  private readonly records = new Map<string, unknown>();

  constructor(entries: readonly (readonly [string, unknown])[] = []) {
    for (const [key, value] of entries) this.records.set(key, value);
  }

  get(key: string): unknown {
    return this.records.get(key);
  }

  entries(): IterableIterator<[string, unknown]> {
    return this.records.entries();
  }

  async put(key: string, value: DraftPromptRecord): Promise<void> {
    this.records.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.records.delete(key);
  }

  async update(
    key: string,
    transform: (current: unknown) => DraftPromptRecord,
  ): Promise<DraftPromptRecord> {
    if (!this.records.has(key)) throw new DraftPromptNotFoundError(key);
    const next = transform(this.records.get(key));
    this.records.set(key, next);
    return next;
  }
}

/** A stored record as a version without `order` wrote it. */
function legacyStored(
  id: string,
  updatedAt: string,
): Record<string, unknown> {
  return {
    id,
    sessionId: "s1",
    workspaceId: "w1",
    text: id,
    sendInPlanMode: false,
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  };
}

test("opening the store migrates legacy records and skips corrupt ones", () => {
  const raw = new FakeRawTable([
    ["newest", legacyStored("newest", "2026-03-01T00:00:00.000Z")],
    ["broken", { id: "broken", text: "" }],
    ["oldest", legacyStored("oldest", "2026-01-01T00:00:00.000Z")],
  ]);
  const table = new RecoveringDraftPromptTable(raw);
  const store = new DraftPromptStore(table, {
    resolveWorkspaceId: async () => "w1",
    mintId: () => "id-new",
    now: () => "2026-04-01T00:00:00.000Z",
  });
  assert.deepEqual(table.recovery.migrated.map(([key]) => key), [
    "newest",
    "oldest",
  ]);
  assert.deepEqual(table.recovery.dropped.map(({ key }) => key), ["broken"]);
  // The corrupt record no longer fails the read, and the legacy order still
  // reads newest first.
  assert.deepEqual(store.list().map((draft) => draft.id), [
    "newest",
    "oldest",
  ]);
});

test("recovered orders are written back so the stored file heals in place", async () => {
  const raw = new FakeRawTable([
    ["legacy", legacyStored("legacy", "2026-02-01T00:00:00.000Z")],
  ]);
  const table = new RecoveringDraftPromptTable(raw);
  const before = readStoredDraftPrompt(raw.get("legacy"));
  assert.equal(before.kind, "record");
  if (before.kind !== "record") return;
  assert.equal(before.migrated, true);
  assert.deepEqual(await table.persistMigrated(), []);
  const after = readStoredDraftPrompt(raw.get("legacy"));
  assert.equal(after.kind, "record");
  if (after.kind !== "record") return;
  assert.equal(after.migrated, false);
  assert.equal(after.record.order, before.record.order);
});

test("invalid writes are refused before touching the domain", async () => {
  const { store } = makeStore();
  await assert.rejects(
    store.create("s1", "  ", false),
    DraftPromptInvalidError,
  );
  await assert.rejects(
    store.create("", "hello", false),
    DraftPromptInvalidError,
  );
  await assert.rejects(
    store.create("s1", "hello", "yes"),
    DraftPromptInvalidError,
  );
  const created = await store.create("s1", "hello", false);
  await assert.rejects(
    store.update(created, "edited", "yes"),
    DraftPromptInvalidError,
  );
  await assert.rejects(
    store.reorder(created, Number.NaN),
    DraftPromptInvalidError,
  );
  await assert.rejects(store.delete(""), DraftPromptInvalidError);
});
