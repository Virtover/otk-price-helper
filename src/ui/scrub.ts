/**
 * Right-button drag over a value nudges it: right = more, left = less (vertical movement is ignored),
 * one step per STEP_PX pixels, ten with Shift held. A label next to the cursor shows the value being set;
 * Esc cancels and restores the state from before the drag. The context menu is suppressed only when
 * the mouse actually moved, so a plain right click still opens it (copy / paste in inputs).
 */
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

const STEP_PX = 3;

/**
 * Applies a change and keeps `el` where it was on screen: messages appearing or disappearing above it
 * would otherwise move the value being edited away from the cursor. The change is rendered synchronously,
 * then the page scrolls by however far the element moved.
 */
export function keepInPlace(el: Element | null | undefined, change: () => void): void {
  const before = el?.isConnected ? el.getBoundingClientRect().top : undefined;
  flushSync(change);
  if (before === undefined || !el!.isConnected) return;
  const moved = el!.getBoundingClientRect().top - before;
  if (Math.abs(moved) >= 1) window.scrollBy(0, moved);
}

/** Whether a drag is running, for parts of the UI that should hold still meanwhile. */
let dragging = false;
/** Number of the drag in progress (undo history merges all its changes into one step). */
let dragId = 0;
const listeners = new Set<() => void>();
function setDragging(value: boolean) {
  dragging = value;
  if (value) dragId++;
  listeners.forEach((l) => l());
}
export const currentScrub = (): number | undefined => (dragging ? dragId : undefined);
export function useScrubbing(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => dragging,
  );
}

export interface ScrubStart {
  /** Ctrl (or ⌘) held when the drag started. */
  ctrl: boolean;
}

export interface ScrubHandlers {
  /** Steps from the start (positive = more), called whenever the count changes. */
  onSteps: (steps: number, start: ScrubStart) => void;
  /** Esc pressed during the drag: put everything back as before it. */
  onCancel?: () => void;
  /** Text shown next to the cursor for the current step count. */
  label?: (steps: number, start: ScrubStart) => string;
}

/** Ends the drag in progress; only one may run, or stale ones would fight over the value. */
let finishActive: (() => void) | undefined;

/** Starts a scrub on right mouse down; returns false for other buttons. */
export function startScrub(e: React.MouseEvent, handlers: ScrubHandlers): boolean {
  if (e.button !== 2) return false;
  e.preventDefault();
  e.stopPropagation();
  finishActive?.();
  const start: ScrubStart = { ctrl: e.ctrlKey || e.metaKey };
  const target = e.currentTarget as HTMLElement | null;
  let lastX = e.clientX;
  let pending = 0;
  let steps = 0;
  let moved = false;
  let tag: HTMLElement | undefined;

  const showLabel = (x: number, y: number) => {
    if (!handlers.label) return;
    if (!tag) {
      tag = document.createElement('div');
      tag.className = 'scrub-label';
      document.body.appendChild(tag);
    }
    tag.textContent = handlers.label(steps, start);
    tag.style.left = `${x + 14}px`;
    tag.style.top = `${y + 14}px`;
  };

  const move = (ev: MouseEvent) => {
    // The release can be missed (a context menu, a release outside the window): stop as soon as
    // the right button is no longer held.
    if ((ev.buttons & 2) === 0) return finish();
    pending += ev.clientX - lastX;
    lastX = ev.clientX;
    const whole = Math.trunc(pending / STEP_PX);
    if (whole !== 0) {
      pending -= whole * STEP_PX;
      steps += whole * (ev.shiftKey ? 10 : 1);
      if (!moved) {
        moved = true;
        document.body.classList.add('scrubbing');
        target?.classList.add('scrub-target');
        setDragging(true);
      }
      keepInPlace(target, () => handlers.onSteps(steps, start));
    }
    if (moved) showLabel(ev.clientX, ev.clientY);
  };
  const blockMenu = (ev: Event) => {
    if (moved) ev.preventDefault();
  };
  /** Stops changing the value (Esc keeps the menu blocked until the button is released). */
  const stopTracking = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('keydown', key);
    document.body.classList.remove('scrubbing');
    target?.classList.remove('scrub-target');
    tag?.remove();
    // What was held still (messages) catches up now, without moving the value either.
    if (dragging) keepInPlace(target, () => setDragging(false));
  };
  const finish = () => {
    if (finishActive === finish) finishActive = undefined;
    stopTracking();
    window.removeEventListener('mouseup', up);
    window.removeEventListener('blur', finish);
    // On Windows the context menu event follows mouseup.
    setTimeout(() => window.removeEventListener('contextmenu', blockMenu, { capture: true }), 0);
  };
  const up = (ev: MouseEvent) => {
    if (ev.button === 2) finish();
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    if (handlers.onCancel) keepInPlace(target, handlers.onCancel);
    moved = true;
    stopTracking();
  };
  finishActive = finish;
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  window.addEventListener('keydown', key);
  window.addEventListener('blur', finish);
  window.addEventListener('contextmenu', blockMenu, { capture: true });
  return true;
}

/** start + steps × unit, never below `min`. */
export function nudged(start: bigint, steps: number, unit: bigint, min: bigint): bigint {
  const v = start + BigInt(steps) * unit;
  return v < min ? min : v;
}

/**
 * Step for scrubbing a value: about 0.1 % of it, rounded down to 1, 2 or 5 × 10ⁿ units,
 * and at least `min` (also a multiple of `min`, e.g. a package quantity).
 */
export function scrubStep(value: bigint, min = 1n): bigint {
  const abs = value < 0n ? -value : value;
  const target = abs / 1000n;
  let step = 1n;
  for (let p = 1n; p <= target; p *= 10n) {
    for (const m of [1n, 2n, 5n]) if (p * m <= target) step = p * m;
  }
  return step < min ? min : step - (step % min);
}

/** Row prices in the price list: live edits, restored as a whole on Esc. */
export interface RowScrub {
  /** Remember the state before a drag starts. */
  begin: () => void;
  set: (key: string, value: bigint, individually: boolean) => void;
  /** Restore the state remembered by begin. */
  cancel: () => void;
}
