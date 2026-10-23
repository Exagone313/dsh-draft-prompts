// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// Reading the durable draft table: stored values are untrusted input because a
// newer plugin version can require a field that an older file does not carry.
// The storage-domain schema therefore accepts every stored value, and this
// module turns those values into the current record shape. A record written
// before `order` existed is migrated, deriving the order from `updatedAt` so
// the old newest-first list order survives; a record that is genuinely corrupt
// is dropped and reported instead of failing the whole list.
import {
  type DraftPromptRecord,
  draftPromptRecordError,
  isDraftOrder,
} from "./draft-prompts.js";

/** One stored value that could not be recovered, with the reason it was lost. */
export interface DroppedStoredDraft {
  /** Table key the value was stored under. */
  readonly key: string;
  /** Short description of the first fault. */
  readonly reason: string;
}

/** The outcome of reading one stored value. */
export type StoredDraftPromptRead =
  | {
    readonly kind: "record";
    readonly record: DraftPromptRecord;
    /** Whether a missing `order` was filled in by this read. */
    readonly migrated: boolean;
  }
  | { readonly kind: "invalid"; readonly reason: string };

/** Everything one durable-table read found. */
export interface RecoveredDraftPrompts {
  /** Recovered records, in stored-table order. */
  readonly records: readonly (readonly [string, DraftPromptRecord])[];
  /** The subset whose `order` had to be derived. */
  readonly migrated: readonly (readonly [string, DraftPromptRecord])[];
  /** Values that could not be recovered and must be skipped. */
  readonly dropped: readonly DroppedStoredDraft[];
}

/**
 * The order a pre-`order` draft takes. Before the field existed the list showed
 * the newest `updatedAt` first; pending drafts sort ascending by `order`, so
 * negating that instant reproduces the same order. The derivation is pure, so
 * reading the same file twice always yields the same values; `compareDraftPrompts`
 * breaks any tie by record id.
 * @param updatedAt - validated canonical instant of the last write.
 * @returns the derived fractional sort key.
 */
function legacyDraftOrder(updatedAt: string): number {
  return -Date.parse(updatedAt);
}

/**
 * Read one stored value as a current draft record. A record that is valid but
 * lacks the newer `order` field is migrated; only a value that is invalid in
 * every other respect is reported as unusable.
 * @param value - unknown value, typically decoded JSON.
 * @returns the record and whether it was migrated, or the reason it is invalid.
 */
export function readStoredDraftPrompt(value: unknown): StoredDraftPromptRead {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { kind: "invalid", reason: "a draft record must be an object" };
  }
  const stored = value as Record<string, unknown>;
  if (stored.order === undefined) {
    // Check every other field first, so a corrupt legacy record reports its
    // real fault instead of only the missing order.
    const error = draftPromptRecordError({ ...stored, order: 0 });
    if (error !== null) return { kind: "invalid", reason: error };
    const order = legacyDraftOrder(stored.updatedAt as string);
    if (!isDraftOrder(order)) {
      return { kind: "invalid", reason: '"updatedAt" is not a usable instant' };
    }
    return {
      kind: "record",
      record: { ...stored, order } as unknown as DraftPromptRecord,
      migrated: true,
    };
  }
  const error = draftPromptRecordError(stored);
  if (error !== null) return { kind: "invalid", reason: error };
  return {
    kind: "record",
    record: stored as unknown as DraftPromptRecord,
    migrated: false,
  };
}

/**
 * Read every stored table entry, separating recoverable records from values
 * that must be dropped. One bad value never fails the read.
 * @param entries - raw key/value pairs from the durable table.
 * @returns the recovered records, the migrated subset, and the dropped values.
 */
export function recoverStoredDraftPrompts(
  entries: Iterable<readonly [string, unknown]>,
): RecoveredDraftPrompts {
  const records: (readonly [string, DraftPromptRecord])[] = [];
  const migrated: (readonly [string, DraftPromptRecord])[] = [];
  const dropped: DroppedStoredDraft[] = [];
  for (const [key, value] of entries) {
    const read = readStoredDraftPrompt(value);
    if (read.kind === "invalid") {
      dropped.push({ key, reason: read.reason });
      continue;
    }
    records.push([key, read.record]);
    if (read.migrated) migrated.push([key, read.record]);
  }
  return { records, migrated, dropped };
}
