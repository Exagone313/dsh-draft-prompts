// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// Resolve the workspace that owns a session, eagerly and at creation time.
// The session header carries the cwd the agent started in; the workspace
// registry is the authority on which registered workspace owns that directory.
// A session without a cwd, a cwd that no longer resolves, or a cwd no workspace
// owns all yield the empty id: the draft stays session-scoped and never leaks
// into another workspace's view.

/** Structural slice of the host Session store this resolver needs. */
export interface WorkspaceLookupSessions {
  get(sessionId: string): {
    readonly header?: { readonly cwd?: string | undefined };
  } | undefined;
}

/** Structural slice of the host workspace registry this resolver needs. */
export interface WorkspaceLookupRegistry {
  resolveByPath(
    path: string,
  ): Promise<{ readonly id: string | { toString(): string } } | undefined>;
}

/** Host services the lookup reads. */
export interface WorkspaceLookupContext {
  readonly sessions?: WorkspaceLookupSessions;
  readonly workspaceRegistry?: WorkspaceLookupRegistry;
}

/**
 * Resolve the workspace id owning a session's cwd.
 * @param ctx - host context carrying the Session store and workspace registry.
 * @param sessionId - session the draft belongs to.
 * @returns the workspace id, or the empty string when none owns the cwd.
 */
export async function resolveWorkspaceId(
  ctx: WorkspaceLookupContext,
  sessionId: string,
): Promise<string> {
  const cwd = ctx.sessions?.get(sessionId)?.header?.cwd;
  if (typeof cwd !== "string" || cwd === "") return "";
  try {
    const workspace = await ctx.workspaceRegistry?.resolveByPath(cwd);
    if (workspace === undefined) return "";
    return String(workspace.id);
  } catch {
    // A cwd that vanished (or a registry that is not ready) is not an error
    // for the draft: it only means no workspace currently owns the session.
    return "";
  }
}
