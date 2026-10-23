// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { type DraftPromptsKey, en, zh } from "./locales.js";
import {
  relativeTime,
  type RelativeTimeKey,
  relativeTimeLabel,
  type RelativeTimeTranslate,
} from "./relative-time.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-06-15T12:00:00.000Z");

/** The ISO instant a given age before the shared reference time. */
function instant(ageMs: number): string {
  return new Date(NOW - ageMs).toISOString();
}

/** A translate function over one dictionary, substituting the count. */
function translator(
  dictionary: Readonly<Record<DraftPromptsKey, string>>,
): RelativeTimeTranslate {
  return (key, params) => {
    const pattern = dictionary[key];
    return params === undefined
      ? pattern
      : pattern.replace("{count}", String(params.count));
  };
}

test("relative times switch unit at a minute, an hour and a day", () => {
  assert.deepEqual(relativeTime(instant(0), NOW), { unit: "now" });
  assert.deepEqual(relativeTime(instant(59_999), NOW), { unit: "now" });
  assert.deepEqual(relativeTime(instant(MINUTE), NOW), {
    unit: "minute",
    count: 1,
  });
  assert.deepEqual(relativeTime(instant(59 * MINUTE + 59_999), NOW), {
    unit: "minute",
    count: 59,
  });
  assert.deepEqual(relativeTime(instant(HOUR), NOW), {
    unit: "hour",
    count: 1,
  });
  assert.deepEqual(relativeTime(instant(DAY - 1), NOW), {
    unit: "hour",
    count: 23,
  });
  assert.deepEqual(relativeTime(instant(DAY), NOW), { unit: "yesterday" });
  assert.deepEqual(relativeTime(instant(2 * DAY - 1), NOW), {
    unit: "yesterday",
  });
  assert.deepEqual(relativeTime(instant(2 * DAY), NOW), {
    unit: "day",
    count: 2,
  });
  assert.deepEqual(relativeTime(instant(7 * DAY), NOW), {
    unit: "day",
    count: 7,
  });
});

test("a corrupt, future or non-finite timestamp degrades to just now", () => {
  assert.deepEqual(relativeTime("not an instant", NOW), { unit: "now" });
  assert.deepEqual(relativeTime(instant(-5_000), NOW), { unit: "now" });
  assert.deepEqual(relativeTime(instant(0), Number.NaN), { unit: "now" });
  assert.deepEqual(relativeTime(instant(0), Number.POSITIVE_INFINITY), {
    unit: "now",
  });
});

test("an ISO instant with a zone offset is read as the same moment", () => {
  assert.deepEqual(relativeTime("2026-06-15T14:00:00+02:00", NOW), {
    unit: "now",
  });
});

test("English labels use just now, counted units and yesterday", () => {
  const t = translator(en);
  assert.equal(relativeTimeLabel(instant(0), NOW, t), "just now");
  assert.equal(relativeTimeLabel("not an instant", NOW, t), "just now");
  assert.equal(relativeTimeLabel(instant(MINUTE), NOW, t), "1 minute ago");
  assert.equal(
    relativeTimeLabel(instant(5 * MINUTE), NOW, t),
    "5 minutes ago",
  );
  assert.equal(relativeTimeLabel(instant(HOUR), NOW, t), "1 hour ago");
  assert.equal(relativeTimeLabel(instant(3 * HOUR), NOW, t), "3 hours ago");
  assert.equal(relativeTimeLabel(instant(DAY), NOW, t), "yesterday");
  assert.equal(relativeTimeLabel(instant(3 * DAY), NOW, t), "3 days ago");
});

test("Chinese labels localize counted units and special words", () => {
  const t = translator(zh);
  assert.equal(relativeTimeLabel(instant(0), NOW, t), "刚刚");
  assert.equal(relativeTimeLabel(instant(-5_000), NOW, t), "刚刚");
  assert.equal(relativeTimeLabel("not an instant", NOW, t), "刚刚");
  assert.equal(relativeTimeLabel(instant(MINUTE), NOW, t), "1 分钟前");
  assert.equal(relativeTimeLabel(instant(5 * MINUTE), NOW, t), "5 分钟前");
  assert.equal(relativeTimeLabel(instant(HOUR), NOW, t), "1 小时前");
  assert.equal(relativeTimeLabel(instant(3 * HOUR), NOW, t), "3 小时前");
  assert.equal(relativeTimeLabel(instant(DAY), NOW, t), "昨天");
  assert.equal(relativeTimeLabel(instant(3 * DAY), NOW, t), "3 天前");
});

test("both dictionaries carry every relative-time key", () => {
  const keys: readonly RelativeTimeKey[] = [
    "age.now",
    "age.yesterday",
    "age.minute.one",
    "age.minute.other",
    "age.hour.one",
    "age.hour.other",
    "age.day.other",
  ];
  for (const [language, dictionary] of [["en", en], ["zh", zh]] as const) {
    for (const key of keys) {
      assert.notEqual(dictionary[key].trim(), "", `${language}: ${key}`);
    }
  }
});
