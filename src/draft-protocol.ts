// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// Wire vocabulary shared by the host route and the browser client. The route
// sits below the harness API prefix, so the carrier has already applied its
// Host/Origin fence and browser authentication before a handler sees a request.

import type { DraftPromptList, DraftPromptRecord } from "./draft-prompts.js";

/** Exact authenticated path owned by this plugin. */
export const DRAFT_PROMPTS_PATH = "/api/draft-prompts";

/** One command the browser sends to the host store. */
export type DraftPromptCommand =
  | {
    readonly op: "create";
    readonly sessionId: string;
    readonly text: string;
    readonly sendInPlanMode: boolean;
  }
  | {
    readonly op: "update";
    /** The full record the caller read; a mismatch is a conflict. */
    readonly expected: DraftPromptRecord;
    /** Replacement text. */
    readonly text: string;
    /** Replacement plan-mode flag. */
    readonly sendInPlanMode: boolean;
  }
  | { readonly op: "delete"; readonly id: string }
  | {
    readonly op: "reorder";
    /** The full record the caller read; a mismatch is a conflict. */
    readonly expected: DraftPromptRecord;
    /** Replacement fractional sort key. */
    readonly order: number;
  }
  | {
    readonly op: "mark-sent";
    /** The full record the caller read; a mismatch is a conflict. */
    readonly expected: DraftPromptRecord;
  }
  | {
    readonly op: "redraft";
    readonly sourceId: string;
    /** Session that owns the fresh pending draft. */
    readonly sessionId: string;
  };

/** Successful command reply: the stored record, or a delete acknowledgement. */
export type DraftPromptCommandResult =
  | { readonly draft: DraftPromptRecord }
  | { readonly deleted: true };

/** Body of a non-2xx reply. */
export interface DraftPromptErrorBody {
  readonly error: {
    readonly code: DraftPromptErrorCode;
    readonly message: string;
  };
}

/** Stable failure codes the client branches on. */
export type DraftPromptErrorCode =
  | "bad-request"
  | "conflict"
  | "not-found"
  | "frozen"
  | "internal";

/** Client-visible request failure carrying the host's stable code. */
export class DraftPromptRequestError extends Error {
  /**
   * @param code - host failure code.
   * @param message - human-readable detail.
   */
  constructor(
    readonly code: DraftPromptErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DraftPromptRequestError";
  }
}

/** List reply type re-exported for both halves. */
export type { DraftPromptList };
