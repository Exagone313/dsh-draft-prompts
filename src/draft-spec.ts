// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The plugin-owned KV domain. The `single` layout validates every stored
// record while opening the unit, and a rejecting schema fails the whole open;
// a file written before a record field existed would then take the entire list
// down. The schema therefore accepts every stored value and the store's
// recovering table (draft-records.ts) validates, migrates or drops each record
// when it opens, so one corrupt record costs that record only.
//
// The harness restricts KV unit names to `^[a-z][a-z0-9_]*$` (a unit name is
// also a file-name segment), so the requested `draft-prompt` spelling cannot
// be an on-medium name. The domain keeps the draft-prompt identity in this
// comment and in every UI string; its unit is `draft_prompts`, which the JSON
// backend stores at `$DSH_HOME/storages/draft_prompts.json`.
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { z } from "zod";

/** KV unit / domain name (see the naming note above). */
export const DRAFT_PROMPTS_DOMAIN = "draft_prompts";

/** Table holding every draft, keyed by record id. */
export const DRAFT_PROMPT_TABLE = "drafts";

/**
 * Pass the stored value through: record recovery needs the whole table (to
 * report what was migrated or dropped) and must never reject at open.
 */
const storedDraftPromptSchema = z.unknown();

/** Authoritative draft store; one `single`-layout unit, version 1. */
export const draftPromptDomain = defineDomain({
  name: DRAFT_PROMPTS_DOMAIN,
  version: 1,
  layout: "single",
  tables: {
    [DRAFT_PROMPT_TABLE]: domainTable<string, unknown>(storedDraftPromptSchema),
  },
});
