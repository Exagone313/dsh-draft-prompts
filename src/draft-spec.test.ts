// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { DRAFT_PROMPTS_DOMAIN, draftPromptDomain } from "./draft-spec.js";

test("the domain is a version 1 single-layout draft store", () => {
  assert.equal(draftPromptDomain.version, 1);
  assert.equal(draftPromptDomain.layout, "single");
  assert.match(DRAFT_PROMPTS_DOMAIN, /^[a-z][a-z0-9_]*$/u);
  assert.deepEqual(Object.keys(draftPromptDomain.tables), ["drafts"]);
});

test("the domain schema defers record recovery to the store", () => {
  const schema = draftPromptDomain.tables.drafts?.valueSchema;
  assert.ok(schema);
  // A pre-order record must reach the recovering store: the single-layout
  // open validates every record, so a rejecting schema would fail the list.
  const legacy = {
    id: "d1",
    sessionId: "s1",
    workspaceId: "w1",
    text: "hello",
    sendInPlanMode: false,
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  assert.deepEqual(schema.parse(legacy), legacy);
  // A corrupt record must also pass the schema so the store can skip it
  // instead of the whole open failing on it.
  assert.equal(schema.safeParse({ id: "" }).success, true);
});
