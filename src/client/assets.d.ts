// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The plugin's own artwork, resolved through package.json's `./icon` export so
// the guide card and the plugin inventory read the same file. The client bundle
// inlines it as a data URL; TypeScript only needs the default export's type.
declare module "@exagone313/dsh-draft-prompts/icon" {
  const url: string;
  export default url;
}
