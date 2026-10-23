// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The draft store's authenticated host route. It is served below the harness
// API path, so the carrier applies the Host/Origin fence and browser
// authentication before the handler runs; the route itself only validates the
// command and calls the store.
import {
  DRAFT_PROMPTS_PATH,
  type DraftPromptCommand,
  type DraftPromptCommandResult,
  type DraftPromptErrorBody,
  type DraftPromptErrorCode,
} from "./draft-protocol.js";
import {
  type DraftPromptList,
  type DraftPromptRecord,
  draftPromptRecordError,
} from "./draft-prompts.js";
import {
  DraftPromptConflictError,
  DraftPromptFrozenError,
  DraftPromptInvalidError,
  DraftPromptNotFoundError,
  type DraftPromptStore,
} from "./draft-store.js";

/** Structural logger slice the route reports registration problems through. */
export interface DraftPromptRouteLogger {
  warn(message: string): void;
}

/** What the route needs from the plugin. */
export interface DraftPromptRouteDeps {
  /** Open the domain lazily; a rejected activation surfaces as a 500. */
  readonly store: () => Promise<DraftPromptStore>;
  /** Resolve the asking session's workspace for the list reply. */
  readonly resolveWorkspaceId: (sessionId: string) => Promise<string>;
  /** Optional logger for a refused route registration. */
  readonly logger?: DraftPromptRouteLogger | undefined;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(
  status: number,
  code: DraftPromptErrorCode,
  message: string,
): Response {
  const body: DraftPromptErrorBody = { error: { code, message } };
  return jsonResponse(status, body);
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new DraftPromptInvalidError(`"${name}" must be a string`);
  }
  return value;
}

function booleanField(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new DraftPromptInvalidError(`"${name}" must be a boolean`);
  }
  return value;
}

function numberField(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DraftPromptInvalidError(`"${name}" must be a finite number`);
  }
  return value;
}

function recordField(value: unknown): DraftPromptRecord {
  const error = draftPromptRecordError(value);
  if (error !== null) {
    throw new DraftPromptInvalidError(`"expected" is not a draft: ${error}`);
  }
  return value as DraftPromptRecord;
}

/**
 * Normalize one untrusted command body.
 * @param raw - decoded `command` member.
 * @returns the typed command.
 */
export function normalizeDraftPromptCommand(
  raw: unknown,
): DraftPromptCommand {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DraftPromptInvalidError("a command object is required");
  }
  const value = raw as Record<string, unknown>;
  switch (value.op) {
    case "create":
      return {
        op: "create",
        sessionId: stringField(value.sessionId, "sessionId"),
        text: stringField(value.text, "text"),
        sendInPlanMode: booleanField(
          value.sendInPlanMode,
          "sendInPlanMode",
        ),
      };
    case "update":
      return {
        op: "update",
        expected: recordField(value.expected),
        text: stringField(value.text, "text"),
        sendInPlanMode: booleanField(value.sendInPlanMode, "sendInPlanMode"),
      };
    case "mark-sent":
      return { op: "mark-sent", expected: recordField(value.expected) };
    case "delete":
      return {
        op: "delete",
        id: stringField(value.id, "id"),
      };
    case "reorder":
      return {
        op: "reorder",
        expected: recordField(value.expected),
        order: numberField(value.order, "order"),
      };
    case "redraft":
      return {
        op: "redraft",
        sourceId: stringField(value.sourceId, "sourceId"),
        sessionId: stringField(value.sessionId, "sessionId"),
      };
    default:
      throw new DraftPromptInvalidError(
        `unknown command ${JSON.stringify(value.op)}`,
      );
  }
}

async function handleCommand(
  store: DraftPromptStore,
  command: DraftPromptCommand,
): Promise<DraftPromptCommandResult> {
  switch (command.op) {
    case "create":
      return {
        draft: await store.create(
          command.sessionId,
          command.text,
          command.sendInPlanMode,
        ),
      };
    case "update":
      return {
        draft: await store.update(
          command.expected,
          command.text,
          command.sendInPlanMode,
        ),
      };
    case "delete": {
      const deleted = await store.delete(command.id);
      if (!deleted) throw new DraftPromptNotFoundError(command.id);
      return { deleted: true };
    }
    case "reorder":
      return {
        draft: await store.reorder(command.expected, command.order),
      };
    case "mark-sent":
      return { draft: await store.markSent(command.expected) };
    case "redraft":
      return {
        draft: await store.redraft(command.sourceId, command.sessionId),
      };
  }
}

/**
 * Create the Fetch-shaped handler for the route.
 * @param deps - store access and workspace lookup.
 * @returns the handler registered with `connection.fetch`.
 */
export function createDraftPromptHandler(
  deps: DraftPromptRouteDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    let store: DraftPromptStore;
    try {
      store = await deps.store();
    } catch (error) {
      return errorResponse(
        500,
        "internal",
        error instanceof Error ? error.message : String(error),
      );
    }
    if (request.method === "GET") {
      try {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId") ?? "";
        const list: DraftPromptList = {
          drafts: store.list(),
          workspaceId: sessionId === ""
            ? ""
            : await deps.resolveWorkspaceId(sessionId),
        };
        return jsonResponse(200, list);
      } catch (error) {
        return errorResponse(
          500,
          "internal",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (request.method !== "POST") {
      return errorResponse(405, "bad-request", "method not allowed");
    }
    let raw: unknown;
    try {
      const body = (await request.json()) as { command?: unknown };
      raw = body?.command;
    } catch {
      return errorResponse(400, "bad-request", "invalid JSON body");
    }
    try {
      const command = normalizeDraftPromptCommand(raw);
      return jsonResponse(200, await handleCommand(store, command));
    } catch (error) {
      if (error instanceof DraftPromptConflictError) {
        return errorResponse(409, "conflict", error.message);
      }
      if (error instanceof DraftPromptFrozenError) {
        return errorResponse(409, "frozen", error.message);
      }
      if (error instanceof DraftPromptNotFoundError) {
        return errorResponse(404, "not-found", error.message);
      }
      if (error instanceof DraftPromptInvalidError) {
        return errorResponse(400, "bad-request", error.message);
      }
      return errorResponse(
        500,
        "internal",
        error instanceof Error ? error.message : String(error),
      );
    }
  };
}

/** Structural slice of Cordis this registration touches. */
export interface DraftPromptRouteContext {
  inject(
    services: readonly string[],
    factory: (ctx: DraftPromptRouteConnectionContext) => void,
  ): unknown;
}

/** Injected context carrying the Connection service. */
export interface DraftPromptRouteConnectionContext {
  readonly connection?: {
    readonly fetch?: {
      register(route: {
        readonly path: string;
        readonly methods: readonly string[];
        readonly requestBody: "buffered";
        readonly fetch: (request: Request) => Promise<Response>;
      }): unknown;
    };
  };
}

/**
 * Register the route, refusing neither activation nor the rest of the plugin
 * when the transport is unavailable.
 * @param ctx - host plugin context.
 * @param deps - handler dependencies.
 */
export function registerDraftPromptRoute(
  ctx: unknown,
  deps: DraftPromptRouteDeps,
): void {
  const routeCtx = ctx as DraftPromptRouteContext;
  if (typeof routeCtx.inject !== "function") {
    deps.logger?.warn(
      "draft-prompts: no injectable context; the host route was not registered",
    );
    return;
  }
  try {
    routeCtx.inject(["connection"], (connectionCtx) => {
      try {
        const fetch = connectionCtx.connection?.fetch;
        if (fetch === undefined) {
          deps.logger?.warn(
            "draft-prompts: Connection.fetch is unavailable; the host route was not registered",
          );
          return;
        }
        fetch.register({
          path: DRAFT_PROMPTS_PATH,
          methods: ["GET", "POST"],
          requestBody: "buffered",
          fetch: createDraftPromptHandler(deps),
        });
      } catch (error) {
        deps.logger?.warn(
          `draft-prompts: could not register the host route: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
  } catch (error) {
    deps.logger?.warn(
      `draft-prompts: could not watch the Connection service: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
