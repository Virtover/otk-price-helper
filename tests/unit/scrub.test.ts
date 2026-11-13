import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepInPlace, nudged, scrubStep, startScrub } from '../../src/ui/scrub';

/** Minimal window/document: startScrub listens on window and touches the body and a label element. */
let win: EventTarget;
beforeEach(() => {
  win = new EventTarget();
  vi.stubGlobal('window', win);
  const classList = { add: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('document', {
    body: { classList, appendChild: vi.fn() },
    createElement: () => ({ style: {}, remove: vi.fn(), textContent: '' }),
  });
  vi.useFakeTimers();
});
afterEach(() => {
  win.dispatchEvent(Object.assign(new Event('mouseup'), { button: 2 }));
  vi.runAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Mouse events while the right button is held (buttons = 2). */
const fire = (type: string, props: Record<string, unknown> = {}) => {
  const ev = Object.assign(new Event(type, { cancelable: true }), { button: 2, buttons: 2, shiftKey: false, clientY: 0, ...props });
  win.dispatchEvent(ev);
  return ev;
};

function down(props: Partial<{ button: number; ctrlKey: boolean; clientX: number }> = {}) {
  const e = {
    button: 2,
    ctrlKey: false,
    metaKey: false,
    clientX: 100,
    clientY: 0,
    currentTarget: null,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...props,
  };
  const calls: [number, boolean][] = [];
  const onCancel = vi.fn();
  const started = startScrub(e as unknown as React.MouseEvent, {
    onSteps: (steps, start) => calls.push([steps, start.ctrl]),
    onCancel,
  });
  return { started, calls, onCancel };
}

describe('right-button scrubbing', () => {
  it('counts one step per 3 px to the right, negative to the left, ten per step with Shift', () => {
    const { calls } = down();
    fire('mousemove', { clientX: 106 });
    fire('mousemove', { clientX: 107 }); // a partial step is kept for later
    fire('mousemove', { clientX: 108 });
    fire('mousemove', { clientX: 102 });
    fire('mousemove', { clientX: 106, shiftKey: true }); // 1 px left over + 3 px = one step × 10
    expect(calls.map((c) => c[0])).toEqual([2, 1, 11]);
  });

  it('ignores vertical movement', () => {
    const { calls } = down();
    fire('mousemove', { clientX: 101, clientY: -40 });
    fire('mousemove', { clientX: 100, clientY: 35 });
    expect(calls).toEqual([]);
  });

  it('remembers Ctrl from the start of the drag', () => {
    const { calls } = down({ ctrlKey: true });
    fire('mousemove', { clientX: 115 });
    expect(calls[0]).toEqual([5, true]);
  });

  it('ignores the left button and stops after the right button is released', () => {
    expect(down({ button: 0 }).started).toBe(false);
    const { calls } = down();
    fire('mouseup');
    fire('mousemove', { clientX: 200 });
    expect(calls).toEqual([]);
  });

  it('stops when the release was missed (button no longer held)', () => {
    const { calls } = down();
    fire('mousemove', { clientX: 200, buttons: 0 });
    fire('mousemove', { clientX: 300 });
    expect(calls).toEqual([]);
  });

  it('runs only one drag at a time: a new one ends the old one', () => {
    const first = down();
    const second = down({ clientX: 100 });
    fire('mousemove', { clientX: 106 });
    expect(first.calls).toEqual([]);
    expect(second.calls.map((c) => c[0])).toEqual([2]);
  });

  it('Esc cancels, stops tracking and still blocks the menu on release', () => {
    const { calls, onCancel } = down();
    fire('mousemove', { clientX: 109 });
    fire('keydown', { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    fire('mousemove', { clientX: 150 });
    expect(calls.map((c) => c[0])).toEqual([3]);
    fire('mouseup');
    expect(fire('contextmenu').defaultPrevented).toBe(true);
  });

  it('blocks the context menu only after a real drag', () => {
    down();
    fire('mouseup');
    expect(fire('contextmenu').defaultPrevented).toBe(false);
    vi.runAllTimers();

    down();
    fire('mousemove', { clientX: 130 });
    fire('mouseup');
    expect(fire('contextmenu').defaultPrevented).toBe(true);
    vi.runAllTimers();
    expect(fire('contextmenu').defaultPrevented).toBe(false);
  });
});

describe('scrub steps', () => {
  it('are about 0.1 % of the value, rounded to 1, 2 or 5 × 10ⁿ', () => {
    expect(scrubStep(2257n)).toBe(2n); // 22,57 zł → 2 gr
    expect(scrubStep(50_000n)).toBe(50n); // 500 zł → 50 gr
    expect(scrubStep(130_000n)).toBe(100n);
    expect(scrubStep(300n)).toBe(1n);
    expect(scrubStep(0n)).toBe(1n);
  });

  it('are a multiple of the minimum (package quantity)', () => {
    expect(scrubStep(75_000n, 50n)).toBe(50n);
    expect(scrubStep(1_500_000n, 300n)).toBe(900n);
  });

  it('never go below the minimum value', () => {
    expect(nudged(1000n, 5, 2n, 1n)).toBe(1010n);
    expect(nudged(1000n, -3, 100n, 100n)).toBe(700n);
    expect(nudged(3n, -10, 1n, 1n)).toBe(1n);
  });
});

describe('keepInPlace', () => {
  it('scrolls by however far the element moved during the change', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('window', Object.assign(win, { scrollBy }));
    let top = 300;
    const el = { isConnected: true, getBoundingClientRect: () => ({ top }) } as unknown as Element;
    keepInPlace(el, () => (top = 340)); // a message appeared above it
    expect(scrollBy).toHaveBeenCalledWith(0, 40);
    keepInPlace(el, () => {}); // nothing moved
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it('just applies the change without an element', () => {
    const change = vi.fn();
    keepInPlace(null, change);
    expect(change).toHaveBeenCalledOnce();
  });
});
