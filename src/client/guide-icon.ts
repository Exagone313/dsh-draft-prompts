// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The guide card's glyph: the plugin's own `icon.svg`, inlined as a data URL by
// the client bundle build. The card passes the harness's icon slot size, so the
// image must fill exactly that square without growing the card's hit area.
import type { IconProps } from "@deepseek-ai/dsh-client-ui-primitives";
import { type ComponentType, createElement } from "react";

/** Media type the data URL must carry before it counts as the plugin's icon. */
const SVG_DATA_URL = "data:image/svg+xml";

/**
 * Build the guide entry's icon from the asset resolved through `./icon`.
 *
 * The cross-origin isolation of an `<img>` keeps the bundled SVG out of the
 * page DOM, and its ink is the artwork's own, so it reads the same on the
 * light and dark guide surfaces. Returning `undefined` makes the guide draw
 * its default cube glyph, so a bundle whose asset did not resolve still leaves
 * a glyph in the card's fixed slot.
 * @param url - data URL the bundle produced from the `./icon` export.
 * @returns the icon component, or `undefined` to keep the guide's default.
 */
export function draftPromptsGuideIcon(
  url: string | undefined,
): ComponentType<IconProps> | undefined {
  if (url === undefined || !url.startsWith(SVG_DATA_URL)) return undefined;
  return function DraftPromptsGuideIcon(
    { size = 26, className }: IconProps,
  ) {
    return createElement("img", {
      src: url,
      width: size,
      height: size,
      className,
      alt: "",
      "aria-hidden": true,
      draggable: false,
    });
  };
}
