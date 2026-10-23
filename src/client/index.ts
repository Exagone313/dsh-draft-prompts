// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// Browser half of the Draft prompts bundle: one right-Sidebar page type that
// keeps a draft prompt library for the current Session and its Workspace.
// Registration follows the public two-stage path only: the type into
// `ctx.sidebarRightTabs`, the body into the keyed `sidebar.right.pane.tab` seat
// under the definition's id. No shortcut is registered, and every registration
// is guarded so a missing optional peer cannot make activation throw.
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-api-session-controller/remote";
import type { SessionRequestId } from "@deepseek-ai/dsh-api-session-controller/types";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { draftPromptSendTarget } from "../draft-prompts.js";
import { en, NS, zh } from "../locales.js";
import {
  DraftPromptsTab,
  type DraftPromptsTabInjected,
} from "./DraftPromptsTab.js";
import {
  DRAFT_PROMPTS_TAB_ID,
  draftPromptsTabDefinition,
} from "./draft-prompts-tab.js";
import { createDraftPromptClient } from "./draft-client.js";
import { DRAFT_PROMPTS_GUIDE_ICON } from "./guide-icon-asset.js";
import { installDraftPromptStyles } from "./styles.js";

/** Required services: the slot seat, copy, its own page type, and remotes. */
export const inject = [
  "slots",
  "locale",
  "sidebarRightTabs",
  "remote",
  "remote.commands",
  "remote.session",
];

/**
 * Report one refused registration without failing the rest of activation.
 * @param label - what was being registered.
 * @param run - registration body.
 */
function guard(label: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    // A partial plugin is still usable: the remaining registrations stay.
    console.warn(`[dsh-draft-prompts] ${label} registration failed`, error);
  }
}

/**
 * Client plugin body. Activation never throws: a missing service or a refused
 * registration only drops the piece that needed it.
 * @param ctx - client root carrying Slots, locale, the right Sidebar registry,
 * and the prompt and command remotes.
 */
export function apply(ctx: ClientContext): void {
  try {
    activate(ctx);
  } catch (error) {
    console.warn("[dsh-draft-prompts] activation failed", error);
  }
}

/**
 * Register every contribution once services are in reach.
 * @param ctx - client root.
 */
function activate(ctx: ClientContext): void {
  // Capture the services this plugin calls later; a thunk or event handler can
  // run after a reload, when reading `ctx` again would fail.
  const locale = ctx.locale;
  const slots = ctx.slots;
  const tabs = ctx.sidebarRightTabs;
  const remote = ctx.remote;
  const t = locale.bind(NS);
  const client = createDraftPromptClient();

  const send = async (
    draft: Parameters<DraftPromptsTabInjected["send"]>[0],
    requestId: string,
  ): Promise<void> => {
    const target = draftPromptSendTarget(draft, requestId);
    if (target.kind === "command") {
      const result = await remote.commands.execute(
        target.sessionId as SessionId,
        target.line,
        [],
      );
      if (!result.ok) {
        throw new Error(`${result.error.code}: ${result.error.message}`);
      }
      if (result.value === undefined) {
        throw new Error(`unknown command: ${target.line.split(" ")[0]}`);
      }
      if (result.value.result.kind === "error") {
        throw new Error(
          result.value.result.text ?? "the plan command was refused",
        );
      }
      return;
    }
    const result = await remote.session.prompt({
      requestId: target.requestId as SessionRequestId,
      sessionId: target.sessionId as SessionId,
      mode: "queue",
      content: [{ type: "text", text: target.text }],
    });
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
  };

  guard("stylesheet", () => {
    installDraftPromptStyles(ctx);
  });
  guard("dictionaries", () => {
    ctx.effect(
      () => locale.register(NS, { en, zh }),
      "draft-prompts: dictionaries",
    );
  });
  guard("tab type", () => {
    ctx.effect(
      () =>
        tabs.register(draftPromptsTabDefinition(t, DRAFT_PROMPTS_GUIDE_ICON)),
      "draft-prompts: tab type",
    );
  });
  guard("tab body", () => {
    slots.inject(
      "sidebar.right.pane.tab",
      () =>
        slots.register(
          {
            name: "sidebar.right.pane.tab",
            key: DRAFT_PROMPTS_TAB_ID,
            locale: NS,
            inject: (): DraftPromptsTabInjected => ({ client, send }),
          },
          DraftPromptsTab,
        ),
    );
  });
}
