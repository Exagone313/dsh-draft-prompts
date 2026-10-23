// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { TranslateNS } from "@deepseek-ai/dsh-client-locale/client";
import { draftPromptsTabDefinition } from "./client/draft-prompts-tab.js";
import { draftPromptsGuideIcon } from "./client/guide-icon.js";
import { NS } from "./locales.js";

// The guide card's glyph is resolved once at bundle time, from the same
// `./icon` export the plugin inventory reads. These checks cover the mapping
// into the harness's icon slot, the fallback that keeps the slot occupied, and
// the bundle actually carrying the exported artwork.

const SVG_URL =
  "data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2064%2064%22%2F%3E";

/** A translate stub: the definition must not call it to expose its icon. */
const t = ((key: string) => key) as unknown as TranslateNS<typeof NS>;

test("the resolved icon fills the guide's icon slot and keeps its artwork", () => {
  const icon = draftPromptsGuideIcon(SVG_URL);
  assert.ok(icon, "a data URL must produce an icon");
  const element = (icon as (props: { size: number }) => unknown)({
    size: 22,
  }) as {
    readonly type: unknown;
    readonly props: Readonly<Record<string, unknown>>;
  };

  assert.equal(element.type, "img");
  assert.equal(element.props.src, SVG_URL);
  assert.equal(element.props.width, 22);
  assert.equal(element.props.height, 22);
  assert.equal(element.props.alt, "");
  assert.equal(element.props["aria-hidden"], true);
  assert.equal(element.props.draggable, false);
});

test("the guide entry carries the icon and falls back without one", () => {
  const icon = draftPromptsGuideIcon(SVG_URL);
  assert.ok(icon);
  assert.equal(draftPromptsTabDefinition(t, icon).guide?.[0]?.icon, icon);
  assert.equal(
    draftPromptsTabDefinition(t).guide?.[0]?.icon,
    undefined,
    "an unresolved asset must leave the harness's default artwork in place",
  );
});

test("an unusable icon URL resolves to the harness default", () => {
  for (
    const url of [
      undefined,
      "",
      "https://example.com/icon.svg",
      "data:image/png;base64,AAAA",
    ]
  ) {
    assert.equal(draftPromptsGuideIcon(url), undefined, String(url));
  }
});

test("the client bundle inlines the artwork exported as ./icon", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { exports: Readonly<Record<string, string>> };
  const exported = pkg.exports["./icon"];
  assert.ok(exported, "package.json must export ./icon");
  const icon = readFileSync(
    new URL(exported, new URL("../", import.meta.url)),
    "utf8",
  );
  const label = /aria-label="([^"]+)"/u.exec(icon)?.[1];
  assert.ok(label, "icon.svg must name itself for assistive technology");

  const bundle = readFileSync(
    new URL("../dist/client/index.js", import.meta.url),
    "utf8",
  );
  assert.match(bundle, /data:image\/svg\+xml/u);
  assert.ok(
    bundle.includes(`aria-label="${label}"`),
    "the bundled icon must be the file ./icon points at",
  );
  assert.ok(
    !bundle.includes("@exagone313/dsh-draft-prompts/icon"),
    "the export must be inlined, not left as a module reference",
  );
});
