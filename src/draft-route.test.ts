// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  DraftPromptNotFoundError,
  DraftPromptStore,
  type DraftPromptTable,
} from "./draft-store.js";
import { createDraftPromptHandler } from "./draft-route.js";
import type { DraftPromptRecord } from "./draft-prompts.js";

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

function harness(): {
  handle: (request: Request) => Promise<Response>;
  create: () => Promise<DraftPromptRecord>;
} {
  let id = 0;
  const store = new DraftPromptStore(new FakeTable(), {
    resolveWorkspaceId: async () => "w1",
    mintId: () => `id-${++id}`,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString(),
  });
  const handle = createDraftPromptHandler({
    store: async () => store,
    resolveWorkspaceId: async () => "w1",
  });
  const post = async (command: unknown): Promise<Response> =>
    await handle(
      new Request("http://host/api/draft-prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command }),
      }),
    );
  return {
    handle,
    create: async () => {
      const response = await post({
        op: "create",
        sessionId: "s1",
        text: "hello",
        sendInPlanMode: false,
      });
      assert.equal(response.status, 200);
      return (await response.json() as { draft: DraftPromptRecord }).draft;
    },
  };
}

test("a store that cannot open surfaces its reason with a 500", async () => {
  const handle = createDraftPromptHandler({
    store: async () => {
      throw new Error(
        "domain 'draft_prompts': stored record 'd1' does not match its schema",
      );
    },
    resolveWorkspaceId: async () => "w1",
  });
  const response = await handle(
    new Request("http://host/api/draft-prompts?sessionId=s1"),
  );
  assert.equal(response.status, 500);
  const body = await response.json() as {
    error: { code: string; message: string };
  };
  assert.equal(body.error.code, "internal");
  assert.match(body.error.message, /stored record 'd1'/u);
});

test("list returns every draft and the asking workspace", async () => {
  const { handle, create } = harness();
  const draft = await create();
  const response = await handle(
    new Request("http://host/api/draft-prompts?sessionId=s1"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    drafts: [draft],
    workspaceId: "w1",
  });
});

test("update round-trips text and the plan flag", async () => {
  const { handle, create } = harness();
  const draft = await create();
  const post = (command: unknown): Promise<Response> =>
    handle(
      new Request("http://host/api/draft-prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command }),
      }),
    );
  const first = await post({
    op: "update",
    expected: draft,
    text: "edited",
    sendInPlanMode: true,
  });
  assert.equal(first.status, 200);
  const updated = (await first.json() as { draft: DraftPromptRecord }).draft;
  assert.equal(updated.text, "edited");
  assert.equal(updated.sendInPlanMode, true);
  const stale = await post({
    op: "update",
    expected: draft,
    text: "stale",
    sendInPlanMode: false,
  });
  assert.equal(stale.status, 409);
  assert.equal(
    (await stale.json() as { error: { code: string } }).error.code,
    "conflict",
  );
});

test("an update without the plan flag is refused with a 400", async () => {
  const { handle, create } = harness();
  const draft = await create();
  const response = await handle(
    new Request("http://host/api/draft-prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: { op: "update", expected: draft, text: "edited" },
      }),
    }),
  );
  assert.equal(response.status, 400);
});

test("a reorder without a finite order is refused with a 400", async () => {
  const { handle, create } = harness();
  const draft = await create();
  for (const order of [undefined, "1", Number.NaN, Number.POSITIVE_INFINITY]) {
    const response = await handle(
      new Request("http://host/api/draft-prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: { op: "reorder", expected: draft, order },
        }),
      }),
    );
    assert.equal(response.status, 400, `order: ${String(order)}`);
  }
});

test("mark-sent, redraft, reorder, and delete round-trip through the route", async () => {
  const { handle, create } = harness();
  const draft = await create();
  const post = (command: unknown): Promise<Response> =>
    handle(
      new Request("http://host/api/draft-prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command }),
      }),
    );
  const reorderResponse = await post({
    op: "reorder",
    expected: draft,
    order: 2.5,
  });
  assert.equal(reorderResponse.status, 200);
  const reordered =
    (await reorderResponse.json() as { draft: DraftPromptRecord }).draft;
  assert.equal(reordered.order, 2.5);
  const staleReorder = await post({
    op: "reorder",
    expected: draft,
    order: -1,
  });
  assert.equal(staleReorder.status, 409);

  const sentResponse = await post({
    op: "mark-sent",
    expected: reordered,
  });
  assert.equal(sentResponse.status, 200);
  const sent =
    (await sentResponse.json() as { draft: DraftPromptRecord }).draft;
  assert.equal(sent.status, "sent");

  const copyResponse = await post({
    op: "redraft",
    sourceId: sent.id,
    sessionId: "s1",
  });
  assert.equal(copyResponse.status, 200);
  const copy =
    (await copyResponse.json() as { draft: DraftPromptRecord }).draft;
  assert.equal(copy.status, "draft");
  assert.equal(copy.text, "hello");
  assert.ok(copy.order < sent.order);

  const deleteResponse = await post({ op: "delete", id: copy.id });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { deleted: true });
  assert.equal((await post({ op: "delete", id: copy.id })).status, 404);
});

test("malformed bodies are refused with a 400", async () => {
  const { handle } = harness();
  const response = await handle(
    new Request("http://host/api/draft-prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: { op: "create" } }),
    }),
  );
  assert.equal(response.status, 400);
  const badJson = await handle(
    new Request("http://host/api/draft-prompts", {
      method: "POST",
      body: "{",
    }),
  );
  assert.equal(badJson.status, 400);
});
