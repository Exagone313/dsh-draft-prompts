// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The confirmation dialog a draft's Send, Delete or Cancel button opens.
// Sending a draft appends a turn, deleting it cannot be undone, and canceling
// an edited draft throws its local changes away, so all three go through the
// same harness Modal the sibling plugin uses, with what each action will affect
// shown and Cancel as the initial focus: a stray Enter dismisses the dialog
// instead of confirming it. A discard compares both versions: the editor text
// Cancel throws away and the stored text it reverts to.
import type { TranslateNS } from "@deepseek-ai/dsh-client-locale/client";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ReactNode } from "react";
import {
  type DraftConfirmedAction,
  type DraftConfirmSide,
  draftDeleteCopy,
  type DraftDiscardPreview,
} from "../draft-actions.js";
import type { DraftPromptStatus } from "../draft-prompts.js";
import { NS } from "../locales.js";
import { PlanModeIndicator } from "./plan-mode-indicator.js";

/** One open confirmation: the action, its preview, and the two outcomes. */
export interface DraftConfirmDialogProps {
  readonly action: DraftConfirmedAction;
  /** The first line of the sent or deleted draft, already shortened. */
  readonly preview: string;
  /** Whether the sent or deleted draft is in plan mode. */
  readonly planMode: boolean;
  /** The record's status, which the delete copy follows. */
  readonly status: DraftPromptStatus;
  /** Both versions when discarding, or null for the other actions. */
  readonly discardPreview: DraftDiscardPreview | null;
  readonly t: TranslateNS<typeof NS>;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * The plan-mode chip, or an explicit "off" so a flag-only change stays visible.
 * @param props - the flag and the translator.
 * @returns the chip or its off label.
 */
function PlanModeFlag(
  props: { readonly on: boolean; readonly t: TranslateNS<typeof NS> },
): ReactNode {
  if (props.on) return <PlanModeIndicator t={props.t} />;
  return (
    <span className="ddp-confirm-plan-off">{props.t("confirm.planOff")}</span>
  );
}

/**
 * One labelled version of the discard comparison, in its own scrollable block.
 * The plan chip sits on its own line under the text, like a saved draft's
 * marker under its text in the list, rather than beside the label.
 * @param props - the version and the translator.
 * @returns the labelled block.
 */
function DraftConfirmSideBlock(
  props: {
    readonly side: DraftConfirmSide;
    readonly t: TranslateNS<typeof NS>;
  },
): ReactNode {
  const { side, t } = props;
  const label = side.role === "discarded"
    ? "confirm.discardedLabel"
    : "confirm.storedLabel";
  return (
    <div className="ddp-confirm-side">
      <div className="ddp-confirm-side-head">
        <span className="ddp-confirm-label">{t(label)}</span>
      </div>
      <div className="ddp-confirm-text">{side.text}</div>
      {side.sendInPlanMode
        ? (
          <div className="ddp-composer-row">
            <PlanModeIndicator t={t} />
          </div>
        )
        : null}
    </div>
  );
}

/**
 * The discard confirmation's body. Both versions appear in full when their
 * text differs; when only the plan flag changed, the shared text appears once
 * and an explicit comparison shows the two flags, instead of two identical
 * blocks.
 * @param props - the computed discard preview and the translator.
 * @returns the versions to compare.
 */
function DraftDiscardBody(
  props: {
    readonly preview: DraftDiscardPreview;
    readonly t: TranslateNS<typeof NS>;
  },
): ReactNode {
  const { preview, t } = props;
  if (!preview.sameText) {
    return (
      <div className="ddp-confirm-sides">
        {preview.sides.map((side) => (
          <DraftConfirmSideBlock key={side.role} side={side} t={t} />
        ))}
      </div>
    );
  }
  return (
    <div className="ddp-confirm-sides">
      <div className="ddp-confirm-side">
        <div className="ddp-confirm-side-head">
          <span className="ddp-confirm-label">
            {t("confirm.unchangedLabel")}
          </span>
        </div>
        <div className="ddp-confirm-text">{preview.discarded.text}</div>
      </div>
      <div className="ddp-confirm-side">
        <div className="ddp-confirm-side-head">
          <span className="ddp-confirm-label">{t("confirm.planOnly")}</span>
        </div>
        <div className="ddp-confirm-plan-change">
          <div className="ddp-confirm-side">
            <span className="ddp-confirm-label">
              {t("confirm.discardedLabel")}
            </span>
            <PlanModeFlag on={preview.discarded.sendInPlanMode} t={t} />
          </div>
          <span className="ddp-confirm-arrow" aria-hidden="true">→</span>
          <div className="ddp-confirm-side">
            <span className="ddp-confirm-label">
              {t("confirm.storedLabel")}
            </span>
            <PlanModeFlag on={preview.stored.sendInPlanMode} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Draw the confirmation dialog for one draft action.
 * @param props - action, preview, copy, and the cancel and confirm callbacks.
 * @returns the portaled dialog.
 */
export function DraftConfirmDialog(props: DraftConfirmDialogProps): ReactNode {
  const {
    action,
    preview,
    planMode,
    status,
    discardPreview,
    t,
    onCancel,
    onConfirm,
  } = props;
  const send = action === "send";
  const discard = action === "discard";
  const deleteCopy = draftDeleteCopy(status);
  const title = discard
    ? "confirm.discardTitle"
    : send
    ? "confirm.sendTitle"
    : deleteCopy.title;
  const description = discard
    ? "confirm.discardDescription"
    : send
    ? "confirm.sendDescription"
    : deleteCopy.description;
  const confirmLabel = discard
    ? t("draft.discard")
    : send
    ? t("draft.send")
    : t("draft.delete");
  let body: ReactNode = null;
  if (discard) {
    body = discardPreview === null
      ? null
      : <DraftDiscardBody preview={discardPreview} t={t} />;
  } else if (preview !== "" || planMode) {
    body = (
      <div className="ddp-confirm-preview-block">
        {preview === ""
          ? null
          : <p className="ddp-confirm-preview">{preview}</p>}
        {planMode
          ? (
            <div className="ddp-composer-row">
              <PlanModeIndicator t={t} />
            </div>
          )
          : null}
      </div>
    );
  }
  return (
    <Modal
      open
      onClose={onCancel}
      title={t(title)}
      description={t(description)}
      closeLabel={t("cancel")}
      footer={
        <>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-modal-autofocus=""
            onClick={onCancel}
          >
            {t("cancel")}
          </Button>
        </>
      }
    >
      {body}
    </Modal>
  );
}
