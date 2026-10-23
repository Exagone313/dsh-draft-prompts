// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The tab's stylesheet, injected once for the plugin's lifetime. The pane
// prescribes no padding, so the root brings the sidebar's own insets and scroll
// container, and every colour comes from a `--dsw-alias-*` token so light and
// dark themes both apply. Class names are prefixed to stay clear of the host.
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import {
  DRAFT_INPUT_MAX_LINES,
  DRAFT_INPUT_MIN_LINES,
  draftInputHeight,
} from "../draft-input-height.js";

/** The bounds the auto-growing hook applies, kept in the stylesheet too. */
const INPUT_MIN_HEIGHT = draftInputHeight(DRAFT_INPUT_MIN_LINES);
const INPUT_MAX_HEIGHT = draftInputHeight(DRAFT_INPUT_MAX_LINES);

/** Every class this plugin renders; the single source for CSS and TSX. */
export const DRAFT_PROMPTS_CLASS = "ddp-root";

/** The stylesheet text appended to the document head while the plugin is loaded. */
export const DRAFT_PROMPTS_STYLES = `
.ddp-root {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  gap: 12px;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 14px;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}

.ddp-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}

.ddp-input {
  box-sizing: border-box;
  width: 100%;
  /* Height is fitted by useAutoGrowTextarea between these bounds: the field
     starts at two lines, grows with its content and scrolls past ten. */
  min-height: ${INPUT_MIN_HEIGHT}px;
  max-height: ${INPUT_MAX_HEIGHT}px;
  margin: 0;
  padding: 8px 10px;
  overflow-y: auto;
  resize: none;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2, transparent);
}

.ddp-input:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.ddp-composer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ddp-plan-toggle,
.ddp-plan-indicator {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  gap: 5px;
  padding: 4px 8px;
  font: inherit;
  font-size: 11px;
  line-height: 1.4;
  border: 0.5px solid transparent;
  border-radius: 999px;
}

.ddp-plan-toggle {
  margin-right: auto;
  color: var(--dsw-alias-label-secondary);
  border-color: var(--dsw-alias-border-l3);
  background: transparent;
  cursor: pointer;
}

.ddp-plan-toggle:not(.ddp-plan-indicator):hover {
  border-color: var(--dsw-alias-border-l4);
  background: var(--dsw-alias-interactive-bg-hover);
}

/* The marker borrows the toggle's chip, but it is not interactive. */
.ddp-plan-indicator {
  cursor: default;
}

/* The active toggle and a saved draft's static marker share one appearance. */
.ddp-plan-toggle[aria-pressed="true"],
.ddp-plan-indicator {
  color: var(--dsw-alias-state-business-primary);
  border-color: var(--dsw-alias-state-business-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
}

.ddp-plan-toggle:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}

.ddp-plan-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.ddp-primary,
.ddp-secondary,
.ddp-danger {
  padding: 5px 10px;
  font: inherit;
  font-size: 11px;
  line-height: 1.4;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}

/* The harness's own primary control, in its token family: the fill is
   --dsw-alias-button-primary-fill, and the label is
   --dsw-alias-label-primary-foreground, the alias that contrasts with that
   fill in both themes (white on the near-black light-mode fill, near-black on
   the near-white dark-mode one). Never brand-primary as text: in dark mode it
   is the same near-white as the label. */
.ddp-primary {
  color: var(--dsw-alias-label-primary-foreground);
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
}

.ddp-secondary {
  color: var(--dsw-alias-label-secondary);
}

/* dsh-podman's destructive action: the ordinary outline control whose text and
   stroke carry the error state colour. */
.ddp-danger {
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-secondary));
  border-color: var(--dsw-alias-state-error-primary, var(--dsw-alias-border-l3));
}

.ddp-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover);
}

.ddp-secondary:hover:not(:disabled),
.ddp-danger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.ddp-primary:focus-visible,
.ddp-secondary:focus-visible,
.ddp-danger:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}

/* Disabled is deliberate, not an inherited opacity: the primary fill swaps to
   the harness's dimmed token under the ordinary primary label, and the outline
   controls mute their text while keeping a neutral stroke. Both pairings keep
   their contrast in light and dark themes. */
.ddp-primary:disabled {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-button-primary-dimmed);
  border-color: transparent;
  opacity: 1;
}

.ddp-secondary:disabled,
.ddp-danger:disabled {
  color: var(--dsw-alias-label-tertiary);
  border-color: var(--dsw-alias-border-l3);
  background: transparent;
  opacity: 1;
}

.ddp-primary:disabled,
.ddp-secondary:disabled,
.ddp-danger:disabled {
  cursor: not-allowed;
}

.ddp-scope {
  display: inline-flex;
  align-self: flex-start;
  padding: 2px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}

.ddp-scope-button {
  padding: 4px 10px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 1.4;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.ddp-scope-button[aria-pressed="true"] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.ddp-scope-button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.ddp-notice,
.ddp-error {
  margin: 0;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.5;
  border-radius: 7px;
}

.ddp-notice {
  color: var(--dsw-alias-label-tertiary);
  text-align: center;
}

.ddp-error {
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-secondary));
  border: 0.5px solid var(--dsw-alias-border-l3);
}

/* The failure line pairs the reason with a retry control, so a transient
   read failure does not force the user to reload the whole page. */
.ddp-error-block {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.ddp-error-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.ddp-error-block .ddp-secondary {
  flex: 0 0 auto;
}

.ddp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ddp-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-1);
}

.ddp-card[data-status="sent"] {
  background: transparent;
}

/* The drag handle is the only affordance the pending card needs: the article
   itself is the HTML5 draggable, and the arrows reorder it without a pointer. */
.ddp-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  padding: 0 3px;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: grab;
}

.ddp-drag-handle:hover:not(:disabled) {
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.ddp-drag-handle:active:not(:disabled) {
  cursor: grabbing;
}

.ddp-drag-handle:disabled {
  cursor: not-allowed;
}

.ddp-drag-handle:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

/* The lifted card and the insertion line under the pointer preview where the
   drop will land; only the drop itself writes the new order. */
.ddp-card[data-dragging="true"] {
  opacity: 0.55;
}

.ddp-card[data-drop="before"] {
  box-shadow: 0 -2px 0 0 var(--dsw-alias-brand-primary);
}

.ddp-card[data-drop="after"] {
  box-shadow: 0 2px 0 0 var(--dsw-alias-brand-primary);
}

.ddp-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 1.4;
}

.ddp-sent-marker {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ddp-sent-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
}

.ddp-text {
  margin: 0;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.55;
}

.ddp-card[data-status="sent"] .ddp-text {
  color: var(--dsw-alias-label-secondary);
}

.ddp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* The confirmation dialog's body: the draft's first line, quoted so it is
   obvious which draft the pending send or delete affects. It lives outside
   ddp-root because the harness portals the dialog to the document body. */
.ddp-confirm-preview {
  margin: 0;
  padding: 8px 10px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2, transparent);
}

/* The send/delete preview stacks above its plan chip, like a saved row and
   the discard dialog do: the text block, then the chip on its own line. */
.ddp-confirm-preview-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* The discard comparison stacks its versions; each text scrolls on its own so
   a long prompt cannot push the buttons off-screen. */
.ddp-confirm-sides {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ddp-confirm-side {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ddp-confirm-side-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.ddp-confirm-label {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

.ddp-confirm-text {
  box-sizing: border-box;
  max-height: 160px;
  margin: 0;
  padding: 8px 10px;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2, transparent);
}

.ddp-confirm-plan-change {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.ddp-confirm-arrow {
  color: var(--dsw-alias-label-tertiary);
}

.ddp-confirm-plan-off {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.ddp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 28px 16px;
  text-align: center;
}

.ddp-empty-title {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.4;
}

.ddp-empty-description {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 1.5;
}
`;

/**
 * Inject the tab stylesheet for the owning plugin lifetime.
 * @param ctx - client root whose effect owns the style tag.
 */
export function installDraftPromptStyles(ctx: ClientContext): void {
  if (typeof document === "undefined") return;
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "@exagone313/dsh-draft-prompts";
    tag.textContent = DRAFT_PROMPTS_STYLES;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, "draft-prompts: styles");
}
