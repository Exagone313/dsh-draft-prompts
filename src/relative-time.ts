// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// Relative draft times, as a person would say them. Minutes are the smallest
// unit a row prints, so a freshly written draft reads "just now" instead of a
// countdown, and the one-day step keeps "yesterday" for a moment that already
// reads better that way. The formatter is pure: the caller injects both the
// reference instant and the translate function, so every branch is testable
// outside a browser.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A relative age split into the unit its label prints. */
export type RelativeTime =
  | { readonly unit: "now" }
  | { readonly unit: "yesterday" }
  | { readonly unit: "minute" | "hour" | "day"; readonly count: number };

/** The relative-time keys both dictionaries must carry. */
export type RelativeTimeKey =
  | "age.now"
  | "age.yesterday"
  | "age.minute.one"
  | "age.minute.other"
  | "age.hour.one"
  | "age.hour.other"
  | "age.day.other";

/** The slice of the locale translate function a relative label needs. */
export type RelativeTimeTranslate = (
  key: RelativeTimeKey,
  params?: { readonly count: number },
) => string;

/**
 * Split the time since an instant into the unit a draft row prints.
 *
 * Minutes are the smallest unit: a just-created draft reads "just now" until
 * a full minute has passed, which avoids a flickering countdown on the first
 * frame. The second day is "yesterday" rather than "1 day ago". A corrupt
 * timestamp, a non-finite reference time, and a clock slightly ahead of this
 * browser all degrade to "just now" instead of a negative or NaN age.
 * @param instant - the draft timestamp, as the store reported it.
 * @param now - current time in epoch milliseconds.
 * @returns the relative age.
 */
export function relativeTime(instant: string, now: number): RelativeTime {
  const at = Date.parse(instant);
  if (Number.isNaN(at) || !Number.isFinite(now)) return { unit: "now" };
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return { unit: "now" };
  if (elapsed < HOUR) {
    return { unit: "minute", count: Math.floor(elapsed / MINUTE) };
  }
  if (elapsed < DAY) {
    return { unit: "hour", count: Math.floor(elapsed / HOUR) };
  }
  if (elapsed < 2 * DAY) return { unit: "yesterday" };
  return { unit: "day", count: Math.floor(elapsed / DAY) };
}

/**
 * Format one draft timestamp through the active locale.
 * @param instant - the draft timestamp, as the store reported it.
 * @param now - current time in epoch milliseconds.
 * @param translate - the active locale dictionary lookup.
 * @returns the localized relative label.
 */
export function relativeTimeLabel(
  instant: string,
  now: number,
  translate: RelativeTimeTranslate,
): string {
  const age = relativeTime(instant, now);
  switch (age.unit) {
    case "now":
      return translate("age.now");
    case "yesterday":
      return translate("age.yesterday");
    case "minute":
    case "hour": {
      const unit = age.unit;
      return translate(
        age.count === 1 ? `age.${unit}.one` : `age.${unit}.other`,
        { count: age.count },
      );
    }
    case "day":
      // "yesterday" takes the one-day step, so a counted day is always plural.
      return translate("age.day.other", { count: age.count });
  }
}
