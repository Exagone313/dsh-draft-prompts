// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The Draft prompts tab body. It lives in its own Session through the slot's
// session scope: every draft belongs to a session (and, when the registry could
// resolve one, to that session's workspace), and the tab owns both the composer
// that creates one and the list that sends, edits, redrafts, reorders, or
// deletes it.
//
// Freshness is pull-only: there is no push channel. The list is refetched when
// the page becomes visible, when the window regains focus, and after every
// action; each write that replaces an existing record is a compare-and-swap,
// so a second tab editing the same draft gets a conflict instead of a silent
// overwrite.
import type { TranslateNS } from "@deepseek-ai/dsh-client-locale/client";
import type {
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  confirmedDraftAction,
  draftConfirmationPreview,
  type DraftConfirmedAction,
  draftDiscardPreview,
  draftEditDecision,
  draftFailureReason,
  draftRowActions,
} from "../draft-actions.js";
import {
  type DraftDropHalf,
  draftDropOrder,
  type DraftEditState,
  draftEditState,
  type DraftPromptRecord,
  type DraftPromptScope,
  filterDraftPrompts,
  sortDraftPrompts,
} from "../draft-prompts.js";
import { DraftPromptRequestError } from "../draft-protocol.js";
import { NS } from "../locales.js";
import { PLAN_TOGGLE_CLASS } from "../plan-mode-chip.js";
import { relativeTimeLabel } from "../relative-time.js";
import { DraftConfirmDialog } from "./DraftConfirmDialog.js";
import type { DraftPromptClient } from "./draft-client.js";
import { PlanModeDot, PlanModeIndicator } from "./plan-mode-indicator.js";
import { useAutoGrowTextarea } from "./use-auto-grow.js";

/** Business face the registrant adds to the tab body's props. */
export interface DraftPromptsTabInjected {
  /** The plugin's authenticated host client. */
  readonly client: DraftPromptClient;
  /** Send one draft through the command or prompt remote. */
  readonly send: (
    draft: DraftPromptRecord,
    requestId: string,
  ) => Promise<void>;
}

/** Everything the tab body receives: framework shares plus the injected face. */
export type DraftPromptsTabProps =
  & PropsRuntime<"sidebar.right.pane.tab">
  & PropsLocale<typeof NS>
  & InjectFace<DraftPromptsTabInjected>;

/** Scope selection in the tab. */
type ScopeKind = "session" | "workspace";

/** How often the relative labels re-render while the tab is visible. */
const RELATIVE_TIME_REFRESH_MS = 30_000;

/**
 * Mint a send identity. The prompt remote treats an identical request id as
 * the same submission, so a double click cannot enqueue two turns.
 * @returns a fresh request id.
 */
function newRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `draft-prompts-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Whether an error is the optimistic-write conflict a refetch resolves.
 * @param error - caught value.
 * @returns true for a conflict or frozen-record refusal.
 */
function isConflict(error: unknown): boolean {
  return error instanceof DraftPromptRequestError &&
    (error.code === "conflict" || error.code === "frozen");
}

/** One row's resolved copy, and the callbacks the row may invoke. */
interface DraftRowProps {
  readonly draft: DraftPromptRecord;
  readonly t: TranslateNS<typeof NS>;
  readonly now: number;
  readonly busy: boolean;
  /** This card is the one being dragged. */
  readonly dragging: boolean;
  /** Which half of this card the active drag is hovering, if any. */
  readonly dropHalf: DraftDropHalf | null;
  /** Another pending card is being dragged and may land here. */
  readonly acceptDrop: boolean;
  readonly onSend: (draft: DraftPromptRecord) => Promise<void>;
  readonly onDelete: (draft: DraftPromptRecord) => Promise<void>;
  readonly onRedraft: (draft: DraftPromptRecord) => Promise<void>;
  /** Save one inline edit; resolves true when the host accepted it. */
  readonly onSaveEdit: (
    draft: DraftPromptRecord,
    edit: DraftEditState,
  ) => Promise<boolean>;
  /** Begin a drag from this card. */
  readonly onDragStart: () => void;
  /** The active drag entered one half of this card. */
  readonly onDragOver: (half: DraftDropHalf) => void;
  /** The active drag was released on this card. */
  readonly onDrop: (half: DraftDropHalf) => void;
  /** The drag ended, wherever it was released. */
  readonly onDragEnd: () => void;
  /** Move this card one place from its drag handle's arrow keys. */
  readonly onMove: (direction: "up" | "down") => void;
}

/** One drag in flight and the half of the card it is currently over. */
interface DraftDragState {
  readonly id: string;
  readonly over: { readonly id: string; readonly half: DraftDropHalf } | null;
}

/** The plan-mode pill, shared by the composer and the inline editor. */
interface PlanModeToggleProps {
  readonly pressed: boolean;
  readonly t: TranslateNS<typeof NS>;
  readonly onToggle: () => void;
}

/**
 * Which half of a card a drag is over. A release above the midpoint inserts
 * before the card, below it after, matching the harness's own row reordering.
 * @param event - the drag event over the card.
 * @returns the half the pointer occupies.
 */
function rowHalf(
  event: { readonly clientY: number; readonly currentTarget: HTMLElement },
): DraftDropHalf {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/**
 * Draw the plan-mode toggle exactly as both the composer and an edited draft
 * offer it.
 * @param props - current flag, translator, and the flip callback.
 * @returns the toggle button.
 */
function PlanModeToggle(props: PlanModeToggleProps): ReactNode {
  const { pressed, t, onToggle } = props;
  return (
    <button
      type="button"
      className={PLAN_TOGGLE_CLASS}
      aria-pressed={pressed}
      title={t("composer.hint")}
      onClick={onToggle}
    >
      <PlanModeDot />
      {t("composer.plan")}
    </button>
  );
}

/**
 * Draw one draft: its text (or editor), plan marker, and actions.
 * @param props - record, copy, and callbacks.
 * @returns one card.
 */
function DraftRow(props: DraftRowProps): ReactNode {
  const {
    draft,
    t,
    now,
    busy,
    dragging,
    dropHalf,
    acceptDrop,
    onSaveEdit,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onMove,
  } = props;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(draft.text);
  const [planMode, setPlanMode] = useState(draft.sendInPlanMode);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<
    DraftConfirmedAction | null
  >(null);
  // The editor's textarea only exists while editing; reopening remounts it at
  // the minimum height and the fit then applies to the stored text.
  const editorRef = useAutoGrowTextarea(value, editing);

  // A refetch replaces the record; the editor keeps the user's unsaved edit,
  // while a closed editor follows the stored copy.
  useEffect(() => {
    if (!editing) {
      const stored = draftEditState(draft);
      setValue(stored.text);
      setPlanMode(stored.sendInPlanMode);
    }
  }, [draft, editing]);

  // A refetch may reveal that another tab sent this record; editing a frozen
  // receipt is meaningless, so close the editor.
  useEffect(() => {
    if (draft.status === "sent") setEditing(false);
  }, [draft.status]);

  const pendingEdit = (): DraftEditState => ({
    text: value,
    sendInPlanMode: planMode,
  });

  // Only the explicit Save button writes: typing and the plan toggle just move
  // the row's own state, and Cancel discards that state locally.
  const finishEdit = async (): Promise<void> => {
    const decision = draftEditDecision(draft, pendingEdit(), "save");
    if (decision.write !== null) {
      setSaving(true);
      await onSaveEdit(draft, decision.write);
      setSaving(false);
    }
    setEditing(false);
  };

  const cancelEdit = (): void => {
    const decision = draftEditDecision(draft, pendingEdit(), "cancel");
    if (decision.confirmDiscard) {
      setConfirmation("discard");
    } else if (decision.close) {
      setEditing(false);
    }
  };

  const sent = draft.status === "sent";
  const pending = draft.status === "draft";
  // A pending card is draggable unless its editor is open or an action is in
  // flight; a sent receipt never moves.
  const draggable = pending && !editing && !busy;
  // The card renders its controls in this order: the confirming action first,
  // the other non-destructive ones next, and Cancel or Delete last. The order
  // is exactly what `draftRowActions` returns for the row's state.
  const actions = draftRowActions(draft.status, editing);
  return (
    <article
      className="ddp-card"
      data-status={draft.status}
      data-dragging={dragging ? "true" : undefined}
      data-drop={dropHalf ?? undefined}
      role="listitem"
      draggable={draggable}
      onDragStart={!draggable ? undefined : (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draft.id);
        onDragStart();
      }}
      onDragEnd={!draggable ? undefined : onDragEnd}
      onDragOver={!acceptDrop ? undefined : (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOver(rowHalf(event));
      }}
      onDrop={!acceptDrop ? undefined : (event) => {
        event.preventDefault();
        onDrop(rowHalf(event));
      }}
    >
      <div className="ddp-card-head">
        {sent
          ? (
            <span className="ddp-sent-marker">
              <span className="ddp-sent-dot" aria-hidden="true" />
              {t("draft.sentAt", {
                time: relativeTimeLabel(
                  draft.sentAt ?? draft.updatedAt,
                  now,
                  t,
                ),
              })}
            </span>
          )
          : (
            <span>
              {relativeTimeLabel(draft.updatedAt, now, t)}
            </span>
          )}
        {pending && !editing
          ? (
            <button
              type="button"
              className="ddp-drag-handle"
              aria-label={t("draft.dragHandle")}
              title={t("draft.dragHandle")}
              aria-keyshortcuts="ArrowUp ArrowDown"
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  onMove("up");
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  onMove("down");
                }
              }}
            >
              <span aria-hidden="true">⠿</span>
            </button>
          )
          : null}
      </div>
      {editing
        ? (
          <>
            <textarea
              ref={editorRef}
              className="ddp-input"
              value={value}
              aria-label={t("draft.edit")}
              onChange={(event) => {
                setValue(event.target.value);
              }}
            />
            <div className="ddp-composer-row">
              <PlanModeToggle
                pressed={planMode}
                t={t}
                onToggle={() => {
                  setPlanMode((current) => !current);
                }}
              />
            </div>
          </>
        )
        : (
          <>
            <p className="ddp-text">{draft.text}</p>
            {draft.sendInPlanMode
              ? (
                <div className="ddp-composer-row">
                  <PlanModeIndicator t={t} />
                </div>
              )
              : null}
          </>
        )}
      <div className="ddp-actions">
        {actions.includes("send")
          ? (
            <button
              type="button"
              className="ddp-primary"
              disabled={busy || saving || value.trim() === ""}
              onClick={() => {
                setConfirmation("send");
              }}
            >
              {busy ? t("draft.sending") : t("draft.send")}
            </button>
          )
          : null}
        {actions.includes("edit")
          ? (
            <button
              type="button"
              className="ddp-secondary"
              disabled={saving}
              onClick={() => {
                // Opening the editor reflects what is stored now, including
                // the plan flag, instead of anything left from a prior edit.
                const stored = draftEditState(draft);
                setValue(stored.text);
                setPlanMode(stored.sendInPlanMode);
                setEditing(true);
              }}
            >
              {t("draft.edit")}
            </button>
          )
          : null}
        {actions.includes("redraft")
          ? (
            <button
              type="button"
              className="ddp-secondary"
              disabled={busy}
              onClick={() => {
                void props.onRedraft(draft);
              }}
            >
              {t("draft.redraft")}
            </button>
          )
          : null}
        {actions.includes("save")
          ? (
            <button
              type="button"
              className="ddp-primary"
              disabled={saving}
              onClick={() => {
                void finishEdit();
              }}
            >
              {t("draft.save")}
            </button>
          )
          : null}
        {actions.includes("cancel")
          ? (
            <button
              type="button"
              className="ddp-danger"
              disabled={saving}
              onClick={cancelEdit}
            >
              {t("cancel")}
            </button>
          )
          : null}
        {actions.includes("delete")
          ? (
            <button
              type="button"
              className="ddp-danger"
              disabled={busy || saving}
              onClick={() => {
                setConfirmation("delete");
              }}
            >
              {t("draft.delete")}
            </button>
          )
          : null}
      </div>
      {confirmation === null ? null : (
        <DraftConfirmDialog
          action={confirmation}
          preview={confirmation === "discard"
            ? ""
            : draftConfirmationPreview(draft.text)}
          planMode={draft.sendInPlanMode}
          status={draft.status}
          discardPreview={confirmation === "discard"
            ? draftDiscardPreview(draft, pendingEdit())
            : null}
          t={t}
          onCancel={() => {
            setConfirmation(null);
          }}
          onConfirm={() => {
            const action = confirmedDraftAction(
              confirmation,
              draft.status,
              editing,
            );
            setConfirmation(null);
            if (action === "send") {
              void props.onSend(draft);
            } else if (action === "delete") {
              void props.onDelete(draft);
            } else if (action === "discard") {
              setEditing(false);
            }
          }}
        />
      )}
    </article>
  );
}

/**
 * Render the Draft prompts page.
 * @param props - session scope, translator, and injected client and send.
 * @returns the tab body.
 */
export function DraftPromptsTab(props: DraftPromptsTabProps): ReactNode {
  const { sessionId, t, client, send } = props;
  const { tab } = props.useTabInfo();
  const visible = tab.visible;
  const [drafts, setDrafts] = useState<readonly DraftPromptRecord[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [scope, setScope] = useState<ScopeKind>("session");
  const [text, setText] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The last refetch failed, so the error line offers a retry. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The pending card being dragged and the half of the card under the pointer;
  // the preview is local until the drop writes one order through the store.
  const [drag, setDrag] = useState<DraftDragState | null>(null);
  // The reference time every relative label renders against; the interval
  // below keeps it moving so "2 minutes ago" does not go stale.
  const [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);
  const sending = useRef(new Set<string>());
  // The composer always stays mounted, so clearing it after Add shrinks the
  // field back to its minimum through the value the hook refits on.
  const composerRef = useAutoGrowTextarea(text);

  const reload = useCallback(async (): Promise<void> => {
    const current = ++generation.current;
    try {
      const list = await client.list(sessionId);
      if (current !== generation.current) return;
      setDrafts(list.drafts);
      setWorkspaceId(list.workspaceId);
      setError(null);
      setLoadFailed(false);
    } catch (failure) {
      if (current !== generation.current) return;
      const reason = draftFailureReason(failure);
      setLoadFailed(true);
      setError(t("loadError", {
        reason: reason === "" ? t("loadErrorUnknown") : reason,
      }));
    } finally {
      if (current === generation.current) {
        // A refetch is a fresh observation too, so the labels move with it.
        setNow(Date.now());
        setLoading(false);
      }
    }
  }, [client, sessionId, t]);

  useEffect(() => {
    if (visible) void reload();
  }, [visible, sessionId, reload]);

  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, RELATIVE_TIME_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onFocus = (): void => {
      void reload();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [visible, reload]);

  const addDraft = async (): Promise<void> => {
    if (adding || text.trim() === "") return;
    setAdding(true);
    setError(null);
    try {
      await client.create(sessionId, text, planMode);
      setText("");
      setPlanMode(false);
      await reload();
    } catch {
      setLoadFailed(false);
      setError(t("addError"));
    } finally {
      setAdding(false);
    }
  };

  const deleteDraft = async (draft: DraftPromptRecord): Promise<void> => {
    setBusyId(draft.id);
    setError(null);
    try {
      await client.remove(draft.id);
      await reload();
    } catch (failure) {
      setError(
        isConflict(failure) ? t("conflict") : t("deleteError"),
      );
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const redraftDraft = async (draft: DraftPromptRecord): Promise<void> => {
    setBusyId(draft.id);
    setError(null);
    try {
      await client.redraft(draft.id, sessionId);
      await reload();
    } catch (failure) {
      setError(
        isConflict(failure) ? t("conflict") : t("saveError"),
      );
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const reorderDraft = async (
    draft: DraftPromptRecord,
    order: number,
  ): Promise<void> => {
    setBusyId(draft.id);
    setError(null);
    try {
      await client.reorder(draft, order);
      await reload();
    } catch (failure) {
      // The compare-and-swap refused a concurrent move: show the conflict and
      // refetch instead of silently reordering over the other device's write.
      setError(
        isConflict(failure) ? t("conflict") : t("saveError"),
      );
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = useCallback(
    async (
      draft: DraftPromptRecord,
      edit: DraftEditState,
    ): Promise<boolean> => {
      setError(null);
      try {
        await client.update(draft, edit.text, edit.sendInPlanMode);
        await reload();
        return true;
      } catch (failure) {
        setError(
          isConflict(failure) ? t("conflict") : t("saveError"),
        );
        await reload();
        return false;
      }
    },
    [client, reload, t],
  );

  const sendDraft = async (draft: DraftPromptRecord): Promise<void> => {
    if (sending.current.has(draft.id)) return;
    // One identity per click sequence: a second click while this send is in
    // flight is ignored, and the prompt remote would dedupe it anyway.
    const requestId = newRequestId();
    sending.current.add(draft.id);
    setBusyId(draft.id);
    setError(null);
    try {
      await send(draft, requestId);
      await client.markSent(draft);
      await reload();
    } catch (failure) {
      setError(
        isConflict(failure) ? t("conflict") : t("sendError"),
      );
      await reload();
    } finally {
      sending.current.delete(draft.id);
      setBusyId(null);
    }
  };

  const chosenScope: DraftPromptScope = scope === "session"
    ? { kind: "session", sessionId }
    : { kind: "workspace", workspaceId };
  const shown = useMemo(
    () => sortDraftPrompts(filterDraftPrompts(drafts, chosenScope)),
    [drafts, scope, sessionId, workspaceId],
  );
  // Dragging only reorders the pending work queue: a sent card has no order it
  // may change, and a pending card can never land in the sent block.
  const pendingShown = useMemo(
    () => shown.filter((draft) => draft.status === "draft"),
    [shown],
  );

  const moveDraft = (
    draft: DraftPromptRecord,
    targetId: string,
    half: DraftDropHalf,
  ): void => {
    const order = draftDropOrder(pendingShown, draft.id, targetId, half);
    if (order === null) return;
    void reorderDraft(draft, order);
  };

  const moveDraftBy = (
    draft: DraftPromptRecord,
    direction: "up" | "down",
  ): void => {
    const index = pendingShown.findIndex((item) => item.id === draft.id);
    if (index < 0) return;
    const target = direction === "up"
      ? pendingShown[index - 1]
      : pendingShown[index + 1];
    if (target === undefined) return;
    moveDraft(draft, target.id, direction === "up" ? "before" : "after");
  };

  return (
    <div className="ddp-root" data-draft-prompts="">
      <div className="ddp-composer">
        <textarea
          ref={composerRef}
          className="ddp-input"
          value={text}
          placeholder={t("composer.placeholder")}
          aria-label={t("composer.placeholder")}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" && (event.metaKey || event.ctrlKey)
            ) {
              event.preventDefault();
              void addDraft();
            }
          }}
        />
        <div className="ddp-composer-row">
          <PlanModeToggle
            pressed={planMode}
            t={t}
            onToggle={() => {
              setPlanMode((current) => !current);
            }}
          />
          <button
            type="button"
            className="ddp-primary"
            disabled={adding || text.trim() === ""}
            onClick={() => {
              void addDraft();
            }}
          >
            {t("composer.add")}
          </button>
        </div>
      </div>
      <div className="ddp-scope" role="group" aria-label={t("aria.list")}>
        <button
          type="button"
          className="ddp-scope-button"
          aria-pressed={scope === "session"}
          onClick={() => {
            setScope("session");
          }}
        >
          {t("scope.session")}
        </button>
        <button
          type="button"
          className="ddp-scope-button"
          aria-pressed={scope === "workspace"}
          onClick={() => {
            setScope("workspace");
          }}
        >
          {t("scope.workspace")}
        </button>
      </div>
      {error === null
        ? null
        : (
          <div className="ddp-error ddp-error-block" role="alert">
            <span className="ddp-error-text">{error}</span>
            {loadFailed
              ? (
                <button
                  type="button"
                  className="ddp-secondary"
                  disabled={loading}
                  onClick={() => {
                    void reload();
                  }}
                >
                  {t("retry")}
                </button>
              )
              : null}
          </div>
        )}
      {loading
        ? <p className="ddp-notice">{t("loading")}</p>
        : shown.length === 0
        ? (
          <div className="ddp-empty">
            <span className="ddp-empty-title">{t("empty.title")}</span>
            <span className="ddp-empty-description">
              {t("empty.description")}
            </span>
          </div>
        )
        : (
          <div className="ddp-list" role="list">
            {shown.map((draft) => {
              const dragging = drag?.id === draft.id;
              const dropHalf = drag?.over?.id === draft.id
                ? drag.over.half
                : null;
              const acceptDrop = draft.status === "draft" && drag !== null &&
                drag.id !== draft.id && busyId !== draft.id;
              return (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  t={t}
                  now={now}
                  busy={busyId === draft.id}
                  dragging={dragging}
                  dropHalf={dropHalf}
                  acceptDrop={acceptDrop}
                  onSend={sendDraft}
                  onDelete={deleteDraft}
                  onRedraft={redraftDraft}
                  onSaveEdit={saveEdit}
                  onDragStart={() => {
                    setDrag({ id: draft.id, over: null });
                  }}
                  onDragOver={(half) => {
                    setDrag((current) =>
                      current === null || current.id === draft.id
                        ? current
                        : { ...current, over: { id: draft.id, half } }
                    );
                  }}
                  onDrop={(half) => {
                    if (drag !== null) {
                      const moving = pendingShown.find((item) =>
                        item.id === drag.id
                      );
                      if (moving !== undefined) {
                        moveDraft(moving, draft.id, half);
                      }
                    }
                    setDrag(null);
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                  }}
                  onMove={(direction) => {
                    moveDraftBy(draft, direction);
                  }}
                />
              );
            })}
          </div>
        )}
    </div>
  );
}
