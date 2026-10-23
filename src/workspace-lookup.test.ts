// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveWorkspaceId,
  type WorkspaceLookupContext,
} from "./workspace-lookup.js";

function context(
  cwd: string | undefined,
  resolve: (path: string) => Promise<{ readonly id: string } | undefined>,
): WorkspaceLookupContext {
  return {
    sessions: {
      get: () => ({ header: cwd === undefined ? {} : { cwd } }),
    },
    workspaceRegistry: { resolveByPath: resolve },
  };
}

test("a session cwd resolves through the workspace registry", async () => {
  const looked: string[] = [];
  const value = await resolveWorkspaceId(
    context("/work/project", async (path) => {
      looked.push(path);
      return { id: "w1" };
    }),
    "s1",
  );
  assert.equal(value, "w1");
  assert.deepEqual(looked, ["/work/project"]);
});

test("a missing, unknown, or unreadable cwd yields no workspace", async () => {
  assert.equal(
    await resolveWorkspaceId(
      context(undefined, async () => ({ id: "w1" })),
      "s1",
    ),
    "",
  );
  assert.equal(
    await resolveWorkspaceId(context("", async () => ({ id: "w1" })), "s1"),
    "",
  );
  assert.equal(
    await resolveWorkspaceId(context("/gone", async () => undefined), "s1"),
    "",
  );
  assert.equal(
    await resolveWorkspaceId(
      context("/gone", async () => {
        throw new Error("ENOENT");
      }),
      "s1",
    ),
    "",
  );
});
