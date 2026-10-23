// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// Host half of the dsh-draft-prompts bundle. It owns the draft store (one
// `single`-layout KV domain), exposes it through this plugin's authenticated
// route, and deliberately declares no tool, service, or configuration of its
// own. The browser module under `exports["./client"]` renders every pixel.
import { randomUUID } from "node:crypto";
import type { DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { DRAFT_PROMPT_TABLE, draftPromptDomain } from "./draft-spec.js";
import {
  DraftPromptStore,
  type RawDraftPromptTable,
  RecoveringDraftPromptTable,
} from "./draft-store.js";
import { registerDraftPromptRoute } from "./draft-route.js";
import {
  resolveWorkspaceId,
  type WorkspaceLookupContext,
} from "./workspace-lookup.js";

/** Cordis plugin name. */
export const name = "draft-prompts";

/** Host services the store and the workspace lookup read. */
export const inject = ["storageDomain", "sessions", "workspaceRegistry"];

/** Structural slice of one opened domain this plugin uses. */
interface OpenedDraftDomain {
  table(name: string): RawDraftPromptTable;
  close(): Promise<void>;
}

/** Sink for the recovery report; activation must never fail over logging. */
interface DraftPromptLogger {
  warn(message: string): void;
}

/** Structural slice of the storage-domain facility. */
interface StorageDomainService {
  open(spec: DomainSpec): Promise<OpenedDraftDomain>;
}

/** Host context members this plugin reads. */
interface HostContext extends WorkspaceLookupContext {
  readonly storageDomain: StorageDomainService;
  effect(factory: () => () => unknown, label: string): unknown;
  inject(services: readonly string[], factory: (ctx: unknown) => void): unknown;
  readonly logger?: { warn?(message: string): void };
}

/**
 * Open the domain and wrap its table in the compare-and-swap store. The wrapper
 * also recovers the stored records: a record written before `order` existed is
 * migrated and written back, and an unreadable record is skipped, so one bad
 * value can never fail the list again.
 * @param ctx - host plugin context.
 * @param logger - sink for the recovery report.
 * @returns the ready store and the domain's close function.
 */
async function openStore(
  ctx: HostContext,
  logger: DraftPromptLogger,
): Promise<{ store: DraftPromptStore; close: () => Promise<void> }> {
  const domain = await ctx.storageDomain.open(draftPromptDomain);
  const table = new RecoveringDraftPromptTable(
    domain.table(DRAFT_PROMPT_TABLE),
  );
  const { migrated, dropped } = table.recovery;
  if (migrated.length > 0) {
    logger.warn(
      `draft-prompts: migrated ${migrated.length} stored draft(s) written before "order" existed; derived their order from updatedAt, which preserves the old newest-first list`,
    );
    const failed = await table.persistMigrated();
    if (failed.length > 0) {
      logger.warn(
        `draft-prompts: could not write back the recovered order of ${failed.length} draft(s); they remain readable now and will be recovered again on the next start`,
      );
    }
  }
  for (const { key, reason } of dropped) {
    logger.warn(
      `draft-prompts: skipped unreadable stored draft ${
        JSON.stringify(key)
      }: ${reason}`,
    );
  }
  const store = new DraftPromptStore(table, {
    resolveWorkspaceId: (sessionId) => resolveWorkspaceId(ctx, sessionId),
    mintId: () => randomUUID(),
    now: () => new Date().toISOString(),
  });
  return { store, close: () => domain.close() };
}

/**
 * Host plugin body.
 * @param ctx - host root context carrying storage, sessions, and workspaces.
 */
export function apply(ctx: HostContext): void {
  const logger: DraftPromptLogger = {
    warn: (message: string): void => {
      try {
        ctx.logger?.warn?.(message);
      } catch {
        // Logging must never fail activation.
      }
    },
  };
  let open: Promise<DraftPromptStore>;
  try {
    open = openStore(ctx, logger).then(({ store, close }) => {
      // The domain outlives this promise; its close is owned by this plugin.
      try {
        ctx.effect(() => close, "draft-prompts: domain close");
      } catch (error) {
        logger.warn(
          `draft-prompts: could not own the domain lifetime: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return store;
    });
  } catch (error) {
    open = Promise.reject(error);
  }
  open.catch((error: unknown) => {
    logger.warn(
      `draft-prompts: the draft store could not be opened: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
  registerDraftPromptRoute(ctx, {
    store: () => open,
    resolveWorkspaceId: (sessionId) => resolveWorkspaceId(ctx, sessionId),
    logger,
  });
}
