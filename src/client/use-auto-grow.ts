// SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
//
// SPDX-License-Identifier: MIT

// Shared auto-growing behavior for the tab's two draft textareas: the composer
// at the top and the inline editor of an existing draft. The size is fitted
// from the measured content in a layout effect, so the browser never paints an
// intermediate height between a keystroke and the resize, and the clamp itself
// lives in the pure rule in ../draft-input-height.ts. A cleared field starts
// again at the minimum, because the fit runs for every value, and the inline
// editor remounts its textarea when it reopens.
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  DRAFT_INPUT_MIN_LINES,
  draftInputHeight,
  draftInputLineCount,
} from "../draft-input-height.js";

/** Border-box height an empty draft textarea starts at. */
const MIN_HEIGHT = draftInputHeight(DRAFT_INPUT_MIN_LINES);

/**
 * Attach auto-growing to a draft textarea.
 * @param value - the field's current text, refitted on every change.
 * @param active - whether the field is mounted; the inline editor is closed
 * between edits, so its row passes its editing state here.
 * @returns the ref to put on the textarea.
 */
export function useAutoGrowTextarea(
  value: string,
  active = true,
): RefObject<HTMLTextAreaElement> {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const element = ref.current;
    if (element === null) return;
    // Collapse to the minimum before measuring: scrollHeight never reports
    // less than the current client height, so a shrinking draft would
    // otherwise keep the height it grew to and never come back down.
    element.style.height = `${MIN_HEIGHT}px`;
    const lines = draftInputLineCount(element.scrollHeight);
    element.style.height = `${draftInputHeight(lines)}px`;
  }, []);

  useLayoutEffect(() => {
    if (active) fit();
  }, [active, fit, value]);

  // The sidebar can be resized without the window resizing, and every width
  // change rewraps the text, so keep the fit in step. Only a width change is
  // handled: the height this hook sets must not feed back into another fit.
  useEffect(() => {
    if (!active) return;
    const element = ref.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (!element.isConnected || element.clientWidth === width) return;
      width = element.clientWidth;
      fit();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [active, fit]);

  return ref;
}
