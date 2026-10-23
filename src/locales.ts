// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// The copy this plugin renders, kept as environment-free data so the host
// program can typecheck and test it without a DOM. locale/en.json and
// locale/zh.json mirror these dictionaries for the plugin inventory, which
// reads display metadata straight from the exported JSON resources.
import type {} from "@deepseek-ai/dsh-client-ui-slots";

/** Dictionary namespace owned by this plugin. */
export const NS = "draftPrompts";

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  "tab.title": "草稿提示词",
  "guide.title": "草稿提示词",
  "guide.description": "保存本会话或本工作区的提示词草稿",
  "aria.list": "草稿提示词列表",
  "composer.placeholder": "写一条提示词…",
  "composer.plan": "计划模式",
  "composer.hint": "以 /plan 发送",
  "composer.add": "添加草稿",
  "scope.session": "本会话",
  "scope.workspace": "本工作区",
  "loading": "正在加载草稿…",
  "loadError": "无法读取草稿提示词：{reason}",
  "loadErrorUnknown": "未知错误",
  "retry": "重试",
  "empty.title": "暂无草稿",
  "empty.description": "在上方写一条提示词并添加。",
  "draft.edit": "编辑",
  "draft.save": "保存",
  "draft.discard": "放弃",
  "draft.delete": "删除",
  "draft.send": "发送",
  "draft.sending": "正在发送…",
  "draft.sentAt": "发送于 {time}",
  "draft.redraft": "重新起草",
  "draft.dragHandle": "拖动以重新排序（使用上下方向键）",
  "confirm.sendTitle": "发送这条草稿？",
  "confirm.sendDescription": "草稿将立即发送到本会话。",
  "confirm.deleteDraftTitle": "删除这条草稿？",
  "confirm.deleteDraftDescription": "草稿将被永久删除。",
  "confirm.deleteSentTitle": "删除这条已发送的提示词？",
  "confirm.deleteSentDescription": "已发送的提示词将被永久删除。",
  "confirm.discardTitle": "放弃未保存的更改？",
  "confirm.discardDescription": "对此草稿的更改将被丢弃。",
  "confirm.discardedLabel": "未保存的更改",
  "confirm.storedLabel": "已保存的版本",
  "confirm.unchangedLabel": "文本（未更改）",
  "confirm.planOnly": "只有计划模式设置发生了变化。",
  "confirm.planOff": "关",
  "addError": "无法添加草稿。",
  "saveError": "无法保存草稿。",
  "deleteError": "无法删除草稿。",
  "sendError": "无法发送草稿。",
  "conflict": "草稿已被其他标签页修改，列表已刷新。",
  "age.now": "刚刚",
  "age.yesterday": "昨天",
  "age.minute.one": "{count} 分钟前",
  "age.minute.other": "{count} 分钟前",
  "age.hour.one": "{count} 小时前",
  "age.hour.other": "{count} 小时前",
  "age.day.other": "{count} 天前",
} as const;

/** Every dictionary key of the `draftPrompts` namespace. */
export type DraftPromptsKey = keyof typeof zh;

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    /** Draft prompt library copy. */
    draftPrompts: DraftPromptsKey;
  }
}

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<DraftPromptsKey, string> = {
  "tab.title": "Draft prompts",
  "guide.title": "Draft prompts",
  "guide.description": "Keep prompt drafts for this session or workspace",
  "aria.list": "Draft prompts",
  "composer.placeholder": "Write a prompt…",
  "composer.plan": "Plan mode",
  "composer.hint": "Send with /plan",
  "composer.add": "Add draft",
  "scope.session": "This session",
  "scope.workspace": "This workspace",
  "loading": "Loading drafts…",
  "loadError": "Could not read the draft prompts: {reason}",
  "loadErrorUnknown": "unknown failure",
  "retry": "Retry",
  "empty.title": "No drafts yet",
  "empty.description": "Write a prompt above and add it.",
  "draft.edit": "Edit",
  "draft.save": "Save",
  "draft.discard": "Discard",
  "draft.delete": "Delete",
  "draft.send": "Send",
  "draft.sending": "Sending…",
  "draft.sentAt": "Sent {time}",
  "draft.redraft": "Redraft",
  "draft.dragHandle": "Drag to reorder (use the up and down arrow keys)",
  "confirm.sendTitle": "Send this draft?",
  "confirm.sendDescription": "The draft will be sent to this session now.",
  "confirm.deleteDraftTitle": "Delete this draft?",
  "confirm.deleteDraftDescription": "The draft will be removed permanently.",
  "confirm.deleteSentTitle": "Delete this sent prompt?",
  "confirm.deleteSentDescription":
    "The sent prompt will be removed permanently.",
  "confirm.discardTitle": "Discard unsaved changes?",
  "confirm.discardDescription": "Your changes to this draft will be lost.",
  "confirm.discardedLabel": "Unsaved changes",
  "confirm.storedLabel": "Saved version",
  "confirm.unchangedLabel": "Text (unchanged)",
  "confirm.planOnly": "Only the plan-mode setting changed.",
  "confirm.planOff": "Off",
  "addError": "Could not add the draft.",
  "saveError": "Could not save the draft.",
  "deleteError": "Could not delete the draft.",
  "sendError": "Could not send the draft.",
  "conflict": "The draft changed in another tab; the list was refreshed.",
  "age.now": "just now",
  "age.yesterday": "yesterday",
  "age.minute.one": "{count} minute ago",
  "age.minute.other": "{count} minutes ago",
  "age.hour.one": "{count} hour ago",
  "age.hour.other": "{count} hours ago",
  "age.day.other": "{count} days ago",
};
