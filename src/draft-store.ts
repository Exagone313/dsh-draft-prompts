// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// Durable operations over the draft domain. Every mutation that replaces an
// existing draft is a compare-and-swap: the caller supplies the whole record
// it read, the store compares it on the domain's write chain, and a mismatch
// rejects as a conflict instead of overwriting a newer version. Sent records
// are frozen for the same reason: their text is the record of what was sent.
import {
  type DroppedStoredDraft,
  readStoredDraftPrompt,
  recoverStoredDraftPrompts,
} from "./draft-records.js";
import {
  type DraftEditState,
  draftPromptConflict,
  type DraftPromptRecord,
  draftPromptRecordError,
  editedDraftPrompt,
  firstDraftOrder,
  isDraftOrder,
  isDraftPromptRecord,
  newDraftPrompt,
  redraftedDraftPrompt,
  reorderedDraftPrompt,
  sortDraftPrompts,
} from "./draft-prompts.js";

/** No stored draft carries the requested id. */
export class DraftPromptNotFoundError extends Error {
  /** @param id - missing record id. */
  constructor(readonly id: string) {
    super(`draft prompt ${JSON.stringify(id)} does not exist`);
    this.name = "DraftPromptNotFoundError";
  }
}

/** A compare-and-swap write saw a record that differs from the one read. */
export class DraftPromptConflictError extends Error {
  /** @param id - record whose stored value moved. */
  constructor(readonly id: string) {
    super(`draft prompt ${JSON.stringify(id)} changed since it was read`);
    this.name = "DraftPromptConflictError";
  }
}

/** A sent record is an immutable receipt and cannot be edited. */
export class DraftPromptFrozenError extends Error {
  /** @param id - sent record that the caller tried to edit. */
  constructor(readonly id: string) {
    super(`draft prompt ${JSON.stringify(id)} was sent and is frozen`);
    this.name = "DraftPromptFrozenError";
  }
}

/** A request body failed validation before touching the domain. */
export class DraftPromptInvalidError extends Error {
  /** @param message - what is wrong with the request. */
  constructor(message: string) {
    super(message);
    this.name = "DraftPromptInvalidError";
  }
}

/** The subset of the domain table the store needs, which tests can fake. */
export interface DraftPromptTable {
  get(key: string): DraftPromptRecord | undefined;
  entries(): IterableIterator<[string, DraftPromptRecord]>;
  put(key: string, value: DraftPromptRecord): Promise<void>;
  delete(key: string): Promise<boolean>;
  update(
    key: string,
    transform: (current: DraftPromptRecord) => DraftPromptRecord,
  ): Promise<DraftPromptRecord>;
}

/**
 * The domain table as opened, before record recovery: the medium is untrusted,
 * so values stay `unknown` until {@link RecoveringDraftPromptTable} reads them.
 */
export interface RawDraftPromptTable {
  get(key: string): unknown;
  entries(): IterableIterator<[string, unknown]>;
  put(key: string, value: DraftPromptRecord): Promise<void>;
  delete(key: string): Promise<boolean>;
  update(
    key: string,
    transform: (current: unknown) => DraftPromptRecord,
  ): Promise<DraftPromptRecord>;
}

/** What opening the durable table recovered from the stored values. */
export interface DraftPromptRecovery {
  /** Records whose missing `order` was derived from `updatedAt`. */
  readonly migrated: readonly (readonly [string, DraftPromptRecord])[];
  /** Unreadable records that were skipped. */
  readonly dropped: readonly DroppedStoredDraft[];
}

/**
 * A {@link DraftPromptTable} over the domain's raw table. It normalizes every
 * stored value once, when the store opens: legacy records gain an `order`, and
 * records that are genuinely corrupt are dropped without failing the open.
 * Writes update both the medium and this normalized view.
 */
export class RecoveringDraftPromptTable implements DraftPromptTable {
  private readonly records = new Map<string, DraftPromptRecord>();
  /** The migration and drop report for this open, for the host logger. */
  readonly recovery: DraftPromptRecovery;

  /** @param raw - the opened domain table, whose values are still unknown. */
  constructor(private readonly raw: RawDraftPromptTable) {
    const recovered = recoverStoredDraftPrompts(raw.entries());
    for (const [key, record] of recovered.records) {
      this.records.set(key, record);
    }
    this.recovery = {
      migrated: recovered.migrated,
      dropped: recovered.dropped,
    };
  }

  /**
   * Write the migrated records back to the medium, healing an existing file
   * instead of re-deriving the order on every start.
   * @returns the keys that could not be written; a failure is not fatal.
   */
  async persistMigrated(): Promise<readonly string[]> {
    const failed: string[] = [];
    for (const [key, record] of this.recovery.migrated) {
      try {
        await this.raw.put(key, record);
      } catch {
        failed.push(key);
      }
    }
    return failed;
  }

  get(key: string): DraftPromptRecord | undefined {
    return this.records.get(key);
  }

  entries(): IterableIterator<[string, DraftPromptRecord]> {
    return this.records.entries();
  }

  async put(key: string, value: DraftPromptRecord): Promise<void> {
    await this.raw.put(key, value);
    this.records.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    const deleted = await this.raw.delete(key);
    this.records.delete(key);
    return deleted;
  }

  async update(
    key: string,
    transform: (current: DraftPromptRecord) => DraftPromptRecord,
  ): Promise<DraftPromptRecord> {
    const next = await this.raw.update(key, (rawCurrent) => {
      // The transform runs inside the domain's write chain, so this value is
      // the authoritative one even if another write landed since the read.
      const read = readStoredDraftPrompt(rawCurrent);
      const current = read.kind === "record"
        ? read.record
        : this.records.get(key);
      if (current === undefined) throw new DraftPromptNotFoundError(key);
      return transform(current);
    });
    this.records.set(key, next);
    return next;
  }
}

/** Host-side inputs the store cannot derive from the record itself. */
export interface DraftPromptStoreOptions {
  /** Resolve the workspace owning a session's cwd; empty when unowned. */
  readonly resolveWorkspaceId: (sessionId: string) => Promise<string>;
  /** Mint a record id. */
  readonly mintId: () => string;
  /** Read the current instant as a canonical UTC ISO-8601 string. */
  readonly now: () => string;
}

function assertText(text: unknown): string {
  if (typeof text !== "string") {
    throw new DraftPromptInvalidError('"text" must be a string');
  }
  if (text.trim() === "") {
    throw new DraftPromptInvalidError("a draft prompt must not be empty");
  }
  return text;
}

function assertSessionId(sessionId: unknown): string {
  if (typeof sessionId !== "string" || sessionId === "") {
    throw new DraftPromptInvalidError('"sessionId" must be a non-empty string');
  }
  return sessionId;
}

function assertSendInPlanMode(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new DraftPromptInvalidError('"sendInPlanMode" must be a boolean');
  }
  return value;
}

function assertOrder(value: unknown): number {
  if (!isDraftOrder(value)) {
    throw new DraftPromptInvalidError('"order" must be a finite number');
  }
  return value;
}

/** Every stored record, in table order; used to place the next first draft. */
function storedRecords(table: DraftPromptTable): DraftPromptRecord[] {
  return [...table.entries()].map(([, record]) => record);
}

function assertRecord(value: unknown): DraftPromptRecord {
  const error = draftPromptRecordError(value);
  if (error !== null) {
    throw new DraftPromptInvalidError(`expected record is invalid: ${error}`);
  }
  return value as DraftPromptRecord;
}

/** Compare-and-swap draft store over one domain table. */
export class DraftPromptStore {
  /**
   * @param table - the opened `drafts` table.
   * @param options - workspace resolution, id minting, and clock.
   */
  constructor(
    private readonly table: DraftPromptTable,
    private readonly options: DraftPromptStoreOptions,
  ) {}

  /**
   * Every stored draft, pending first and newest first inside each group.
   * @returns a display-ordered copy.
   */
  list(): DraftPromptRecord[] {
    return sortDraftPrompts(
      [...this.table.entries()].map(([, record]) => record),
    );
  }

  /**
   * Store one new pending draft. The workspace is resolved from the owning
   * session's cwd now, so a later workspace rename cannot move the record.
   * @param sessionId - session that owns and will receive the draft.
   * @param text - prompt text.
   * @param sendInPlanMode - send as `/plan <text>`.
   * @param workspaceId - optional pre-resolved workspace (tests only).
   * @returns the created record.
   */
  async create(
    sessionId: unknown,
    text: unknown,
    sendInPlanMode: unknown,
    workspaceId?: string,
  ): Promise<DraftPromptRecord> {
    const owner = assertSessionId(sessionId);
    const body = assertText(text);
    const planMode = assertSendInPlanMode(sendInPlanMode);
    const workspace = workspaceId ??
      await this.options.resolveWorkspaceId(owner);
    const record = newDraftPrompt({
      id: this.options.mintId(),
      sessionId: owner,
      workspaceId: workspace,
      text: body,
      sendInPlanMode: planMode,
      order: firstDraftOrder(storedRecords(this.table)),
      now: this.options.now(),
    });
    await this.table.put(record.id, record);
    return record;
  }

  /**
   * Replace a pending draft's editable fields when the stored record still
   * equals the caller's copy.
   * @param expected - whole record the caller read.
   * @param text - replacement text.
   * @param sendInPlanMode - replacement plan flag.
   * @returns the stored replacement.
   */
  async update(
    expected: unknown,
    text: unknown,
    sendInPlanMode: unknown,
  ): Promise<DraftPromptRecord> {
    const before = assertRecord(expected);
    const edit: DraftEditState = {
      text: assertText(text),
      sendInPlanMode: assertSendInPlanMode(sendInPlanMode),
    };
    const current = this.table.get(before.id);
    if (current === undefined) throw new DraftPromptNotFoundError(before.id);
    if (current.status === "sent") throw new DraftPromptFrozenError(before.id);
    if (draftPromptConflict(before, current)) {
      throw new DraftPromptConflictError(before.id);
    }
    return await this.table.update(before.id, (stored) => {
      if (stored.status === "sent") throw new DraftPromptFrozenError(before.id);
      if (draftPromptConflict(before, stored)) {
        throw new DraftPromptConflictError(before.id);
      }
      return editedDraftPrompt(stored, edit, this.options.now());
    });
  }

  /**
   * Move a pending draft to a new fractional order when the stored record still
   * equals the caller's copy, so a concurrent reorder from another device is a
   * conflict instead of a silent overwrite.
   * @param expected - whole record the caller read.
   * @param order - replacement fractional sort key.
   * @returns the stored replacement.
   */
  async reorder(expected: unknown, order: unknown): Promise<DraftPromptRecord> {
    const before = assertRecord(expected);
    const nextOrder = assertOrder(order);
    const current = this.table.get(before.id);
    if (current === undefined) throw new DraftPromptNotFoundError(before.id);
    if (current.status === "sent") throw new DraftPromptFrozenError(before.id);
    if (draftPromptConflict(before, current)) {
      throw new DraftPromptConflictError(before.id);
    }
    return await this.table.update(before.id, (stored) => {
      if (stored.status === "sent") throw new DraftPromptFrozenError(before.id);
      if (draftPromptConflict(before, stored)) {
        throw new DraftPromptConflictError(before.id);
      }
      return reorderedDraftPrompt(stored, nextOrder, this.options.now());
    });
  }

  /**
   * Delete one draft by id.
   * @param id - record to remove.
   * @returns true when a record existed.
   */
  async delete(id: unknown): Promise<boolean> {
    if (typeof id !== "string" || id === "") {
      throw new DraftPromptInvalidError('"id" must be a non-empty string');
    }
    return await this.table.delete(id);
  }

  /**
   * Flip a pending draft to sent and stamp the send instant. Repeating the
   * call with the record already sent (the same read) succeeds idempotently,
   * so a double click on a successful send cannot fail.
   * @param expected - whole record the caller read before sending.
   * @returns the sent record.
   */
  async markSent(expected: unknown): Promise<DraftPromptRecord> {
    const before = assertRecord(expected);
    const current = this.table.get(before.id);
    if (current === undefined) throw new DraftPromptNotFoundError(before.id);
    if (current.status === "sent") {
      // A double click carries the same pre-send record twice: when the stored
      // sent record is the one this call would have produced, succeed
      // idempotently instead of reporting a conflict.
      const sameCall = before.status === "draft" &&
        before.id === current.id &&
        before.sessionId === current.sessionId &&
        before.workspaceId === current.workspaceId &&
        before.text === current.text &&
        before.sendInPlanMode === current.sendInPlanMode &&
        before.createdAt === current.createdAt;
      if (sameCall || !draftPromptConflict(before, current)) return current;
      throw new DraftPromptConflictError(before.id);
    }
    if (draftPromptConflict(before, current)) {
      throw new DraftPromptConflictError(before.id);
    }
    return await this.table.update(before.id, (stored) => {
      if (stored.status === "sent") return stored;
      if (draftPromptConflict(before, stored)) {
        throw new DraftPromptConflictError(before.id);
      }
      const now = this.options.now();
      return {
        ...stored,
        status: "sent",
        sentAt: now,
        updatedAt: now,
      };
    });
  }

  /**
   * Copy a sent draft's text and plan flag into a fresh pending draft owned by
   * another (or the same) session, ordered first. The source stays frozen and
   * unmoved.
   * @param sourceId - draft to copy.
   * @param sessionId - session that owns the new draft.
   * @returns the new pending record.
   */
  async redraft(
    sourceId: unknown,
    sessionId: unknown,
  ): Promise<DraftPromptRecord> {
    if (typeof sourceId !== "string" || sourceId === "") {
      throw new DraftPromptInvalidError(
        '"sourceId" must be a non-empty string',
      );
    }
    const owner = assertSessionId(sessionId);
    const source = this.table.get(sourceId);
    if (source === undefined) throw new DraftPromptNotFoundError(sourceId);
    const workspace = await this.options.resolveWorkspaceId(owner);
    const record = redraftedDraftPrompt(source, {
      id: this.options.mintId(),
      sessionId: owner,
      workspaceId: workspace,
      order: firstDraftOrder(storedRecords(this.table)),
      now: this.options.now(),
    });
    if (!isDraftPromptRecord(record)) {
      throw new DraftPromptInvalidError("could not build the redrafted draft");
    }
    await this.table.put(record.id, record);
    return record;
  }
}
