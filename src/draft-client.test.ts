// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { createDraftPromptClient } from "./client/draft-client.js";
import { DraftPromptRequestError } from "./draft-protocol.js";
import type { DraftPromptRecord } from "./draft-prompts.js";

/** Run the client with one stubbed fetch, restoring the real one afterwards. */
async function withFetch(
  stub: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

/** The failure a rejected list call surfaced. */
async function listFailure(
  stub: typeof fetch,
): Promise<DraftPromptRequestError> {
  try {
    await withFetch(stub, async () => {
      await createDraftPromptClient().list("s1");
    });
  } catch (error) {
    assert.ok(error instanceof DraftPromptRequestError);
    return error;
  }
  assert.fail("the list call should have failed");
}

const DRAFT: DraftPromptRecord = {
  id: "d1",
  sessionId: "s1",
  workspaceId: "w1",
  text: "hello",
  sendInPlanMode: false,
  order: 0,
  status: "draft",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("the client reads a draft list", async () => {
  await withFetch(
    async () =>
      new Response(JSON.stringify({ drafts: [DRAFT], workspaceId: "w1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    async () => {
      const list = await createDraftPromptClient().list("s1");
      assert.deepEqual(list, { drafts: [DRAFT], workspaceId: "w1" });
    },
  );
});

test("a failed route surfaces its status and host message", async () => {
  const error = await listFailure(
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "internal",
            message: "domain 'draft_prompts' could not be opened",
          },
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      ),
  );
  assert.equal(error.code, "internal");
  assert.match(error.message, /could not be opened/u);
  assert.match(error.message, /status 500/u);
});

test("an unparsable reply surfaces the parse failure", async () => {
  const error = await listFailure(
    async () => new Response("<html>not json</html>", { status: 200 }),
  );
  assert.match(error.message, /not valid JSON/u);
  assert.match(error.message, /status 200/u);
});

test("a reply that is not a draft list surfaces the shape failure", async () => {
  const error = await listFailure(
    async () =>
      new Response(JSON.stringify({ drafts: "nope" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  assert.match(error.message, /not a draft list/u);
  assert.match(error.message, /status 200/u);
});
