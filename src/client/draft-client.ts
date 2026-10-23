// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// Browser half of the plugin's host route. The route lives on the harness API
// channel, so a same-origin fetch carries the browser session the harness
// issued for it; no extra token is minted here.
import {
  DRAFT_PROMPTS_PATH,
  type DraftPromptCommand,
  type DraftPromptCommandResult,
  type DraftPromptErrorBody,
  DraftPromptRequestError,
} from "../draft-protocol.js";
import type { DraftPromptList, DraftPromptRecord } from "../draft-prompts.js";

/** Operations the tab performs against the host store. */
export interface DraftPromptClient {
  /** Read every draft plus the asking session's workspace id. */
  list(sessionId: string): Promise<DraftPromptList>;
  /** Create a pending draft in one session. */
  create(
    sessionId: string,
    text: string,
    sendInPlanMode: boolean,
  ): Promise<DraftPromptRecord>;
  /** Replace a pending draft's text and plan flag under compare-and-swap. */
  update(
    expected: DraftPromptRecord,
    text: string,
    sendInPlanMode: boolean,
  ): Promise<DraftPromptRecord>;
  /** Remove a draft. */
  remove(id: string): Promise<void>;
  /** Move a pending draft to a new fractional order under compare-and-swap. */
  reorder(
    expected: DraftPromptRecord,
    order: number,
  ): Promise<DraftPromptRecord>;
  /** Flip a draft to sent. */
  markSent(expected: DraftPromptRecord): Promise<DraftPromptRecord>;
  /** Copy a draft's text into a fresh pending draft, ordered first. */
  redraft(sourceId: string, sessionId: string): Promise<DraftPromptRecord>;
}

async function failure(response: Response): Promise<DraftPromptRequestError> {
  try {
    const body = (await response.json()) as Partial<DraftPromptErrorBody>;
    const error = body?.error;
    if (
      typeof error?.code === "string" && typeof error?.message === "string" &&
      error.message !== ""
    ) {
      return new DraftPromptRequestError(
        error.code as DraftPromptRequestError["code"],
        `${error.message} (status ${response.status})`,
      );
    }
  } catch {
    // A non-JSON body falls through to the status text.
  }
  return new DraftPromptRequestError(
    "internal",
    `draft prompt request failed (status ${response.status})`,
  );
}

/**
 * Decode a successful list reply. A reply that is not JSON cannot be read at
 * all; one that is JSON but not a list is a protocol failure. Both carry the
 * status so the tab can tell the user what actually went wrong.
 * @param response - the successful GET reply.
 * @returns the parsed list.
 */
async function listOf(response: Response): Promise<DraftPromptList> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DraftPromptRequestError(
      "internal",
      `the host reply was not valid JSON (status ${response.status})`,
    );
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new DraftPromptRequestError(
      "internal",
      `the host reply was not a draft list (status ${response.status})`,
    );
  }
  const list = body as {
    readonly drafts?: unknown;
    readonly workspaceId?: unknown;
  };
  if (!Array.isArray(list.drafts)) {
    throw new DraftPromptRequestError(
      "internal",
      `the host reply was not a draft list (status ${response.status})`,
    );
  }
  if (typeof list.workspaceId !== "string") {
    throw new DraftPromptRequestError(
      "internal",
      `the host reply carried no workspace id (status ${response.status})`,
    );
  }
  return {
    drafts: list.drafts as DraftPromptRecord[],
    workspaceId: list.workspaceId,
  };
}

async function command(
  body: DraftPromptCommand,
): Promise<DraftPromptCommandResult> {
  const response = await fetch(DRAFT_PROMPTS_PATH, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ command: body }),
  });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as DraftPromptCommandResult;
}

function recordOf(result: DraftPromptCommandResult): DraftPromptRecord {
  if ("draft" in result) return result.draft;
  throw new DraftPromptRequestError(
    "internal",
    "the host replied to a write without a draft",
  );
}

/** Build the client bound to the plugin's route. */
export function createDraftPromptClient(): DraftPromptClient {
  return {
    async list(sessionId: string): Promise<DraftPromptList> {
      const query = new URLSearchParams({ sessionId });
      const response = await fetch(`${DRAFT_PROMPTS_PATH}?${query}`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw await failure(response);
      return await listOf(response);
    },
    async create(
      sessionId: string,
      text: string,
      sendInPlanMode: boolean,
    ): Promise<DraftPromptRecord> {
      return recordOf(
        await command({ op: "create", sessionId, text, sendInPlanMode }),
      );
    },
    async update(
      expected: DraftPromptRecord,
      text: string,
      sendInPlanMode: boolean,
    ): Promise<DraftPromptRecord> {
      return recordOf(
        await command({ op: "update", expected, text, sendInPlanMode }),
      );
    },
    async remove(id: string): Promise<void> {
      await command({ op: "delete", id });
    },
    async reorder(
      expected: DraftPromptRecord,
      order: number,
    ): Promise<DraftPromptRecord> {
      return recordOf(await command({ op: "reorder", expected, order }));
    },
    async markSent(expected: DraftPromptRecord): Promise<DraftPromptRecord> {
      return recordOf(await command({ op: "mark-sent", expected }));
    },
    async redraft(
      sourceId: string,
      sessionId: string,
    ): Promise<DraftPromptRecord> {
      return recordOf(await command({ op: "redraft", sourceId, sessionId }));
    },
  };
}
