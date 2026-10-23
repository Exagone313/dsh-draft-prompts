// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The one resolution of the package's `./icon` export: esbuild follows the
// exports map to icon.svg and inlines it as a data URL, so the guide card and
// the plugin inventory cannot drift to different artwork.
import iconUrl from "@exagone313/dsh-draft-prompts/icon";
import { draftPromptsGuideIcon } from "./guide-icon.js";

/** The guide card's glyph, or `undefined` when the asset did not resolve. */
export const DRAFT_PROMPTS_GUIDE_ICON = draftPromptsGuideIcon(iconUrl);
