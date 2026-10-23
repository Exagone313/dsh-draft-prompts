// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The Draft prompts tab type's identity and its two static faces: the registry
// definition (stage one) and the guide entry the right sidebar's new-tab list
// offers. The body registers under DRAFT_PROMPTS_TAB_ID, the id the type is
// registered with, while `openTab` would name DRAFT_PROMPTS_TAB_KIND. Both live
// here so the two halves cannot drift. A page type owns no shortcut: the guide
// entry is its only entry point.
import type { TranslateNS } from "@deepseek-ai/dsh-client-locale/client";
import type { IconProps } from "@deepseek-ai/dsh-client-ui-primitives";
import type { SidebarRightTabDefinition } from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type { ComponentType } from "react";
import { NS } from "../locales.js";

/** Implementation id the body registers under; unique across tab types. */
export const DRAFT_PROMPTS_TAB_ID = "@exagone313/dsh-draft-prompts#drafts";

/** Page kind this plugin owns; a page type recognizes no resource address. */
export const DRAFT_PROMPTS_TAB_KIND = "draft-prompts";

/**
 * The Draft prompts tab type's registry definition.
 *
 * A page type: it recognizes no resource address because it always shows the
 * Session it lives in, and is opened from its guide entry. One page per pane,
 * kept mounted through hiding so a toggle back is instant.
 * @param t - namespace-bound translate, read fresh on every title call.
 * @param icon - the plugin's own glyph, already resolved from its `./icon`
 * export; omitted, the guide draws its default artwork.
 * @returns the definition to register.
 */
export function draftPromptsTabDefinition(
  t: TranslateNS<typeof NS>,
  icon?: ComponentType<IconProps>,
): SidebarRightTabDefinition {
  return {
    id: DRAFT_PROMPTS_TAB_ID,
    kind: DRAFT_PROMPTS_TAB_KIND,
    multiple: false,
    keepMounted: true,
    title: () => t("tab.title"),
    // Without this entry the type would never appear in the new-tab list.
    guide: [
      {
        id: "draft-prompts",
        order: 45,
        title: () => t("guide.title"),
        description: () => t("guide.description"),
        icon,
      },
    ],
  };
}
