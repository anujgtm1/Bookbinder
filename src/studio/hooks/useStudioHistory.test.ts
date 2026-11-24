import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_COALESCE_MS,
  DEFAULT_MAX_HISTORY_ENTRIES,
  cloneSnapshot,
  createStudioHistory,
  pushStudioHistory,
  redoStudioHistory,
  resetStudioHistory,
  undoStudioHistory,
  useStudioHistory,
} from './useStudioHistory';

interface TestDoc {
  title: string;
  items: { id: string; x: number }[];
}

function makeDoc(title: string, x = 0): TestDoc {
  return { title, items: [{ id: 'a', x }] };
}

describe('cloneSnapshot', () => {
  it('deeply clones nested structures so mutations never leak', () => {
    const original = makeDoc('Cover', 10);
    const cloned = cloneSnapshot(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.items).not.toBe(original.items);
    expect(cloned.items[0]).not.toBe(original.items[0]);

    cloned.items[0].x = 999;
    expect(original.items[0].x).toBe(10);
  });

  it('falls back to JSON round-tripping when structuredClone is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
    Object.defineProperty(globalThis, 'structuredClone', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      const original = makeDoc('Fallback', 42);
      const cloned = cloneSnapshot(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.items[0]).not.toBe(original.items[0]);
      expect(cloneSnapshot(undefined)).toBeUndefined();
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'structuredClone', descriptor);
      }
    }
  });
});

describe('pure studio history helpers', () => {
  it('creates isolated initial history with default or custom maxEntries', () => {
    const initial = makeDoc('Start', 1);
    const history = createStudioHistory(initial);
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
    expect(history.present).toEqual(initial);
    expect(history.maxEntries).toBe(DEFAULT_MAX_HISTORY_ENTRIES);

    // Mutating original input does not mutate stored snapshot
    initial.items[0].x = 999;
    expect(history.present.items[0].x).toBe(1);

    expect(createStudioHistory(makeDoc('A'), 10).maxEntries).toBe(10);
    expect(createStudioHistory(makeDoc('A'), 0).maxEntries).toBe(DEFAULT_MAX_HISTORY_ENTRIES);
    expect(createStudioHistory(makeDoc('A'), -5).maxEntries).toBe(DEFAULT_MAX_HISTORY_ENTRIES);
  });

  it('pushes, undoes, redoes, and clears future on branching edits without mutating prior states', () => {
    const s0 = createStudioHistory(makeDoc('v0', 0));
    const s1 = pushStudioHistory(s0, makeDoc('v1', 1), { now: 1000 });
    const s2 = pushStudioHistory(s1, makeDoc('v2', 2), { now: 2000 });

    // Original states remain untouched
    expect(s0.past).toHaveLength(0);
    expect(s1.past).toHaveLength(1);
    expect(s2.past.map((d) => d.title)).toEqual(['v0', 'v1']);
    expect(s2.present.title).toBe('v2');

    // Undo twice
    const u1 = undoStudioHistory(s2);
    expect(u1.present.title).toBe('v1');
    expect(u1.past.map((d) => d.title)).toEqual(['v0']);
    expect(u1.future.map((d) => d.title)).toEqual(['v2']);

    const u2 = undoStudioHistory(u1);
    expect(u2.present.title).toBe('v0');
    expect(u2.past).toEqual([]);
    expect(u2.future.map((d) => d.title)).toEqual(['v1', 'v2']);

    // Further undo is a no-op returning the exact same reference
    expect(undoStudioHistory(u2)).toBe(u2);

    // Redo once
    const r1 = redoStudioHistory(u2);
    expect(r1.present.title).toBe('v1');
    expect(r1.past.map((d) => d.title)).toEqual(['v0']);
    expect(r1.future.map((d) => d.title)).toEqual(['v2']);

    // Branching push clears future
    const branched = pushStudioHistory(r1, makeDoc('v1-branch', 5), { now: 3000 });
    expect(branched.present.title).toBe('v1-branch');
    expect(branched.past.map((d) => d.title)).toEqual(['v0', 'v1']);
    expect(branched.future).toEqual([]);
    expect(redoStudioHistory(branched)).toBe(branched);
  });

  it('enforces maxEntries cap by evicting oldest past snapshots', () => {
    let state = createStudioHistory(makeDoc('v0', 0), 3);
    for (let i = 1; i <= 6; i++) {
      state = pushStudioHistory(state, makeDoc(`v${i}`, i), { now: i * 1000 });
    }

    expect(state.present.title).toBe('v6');
    expect(state.past.map((d) => d.title)).toEqual(['v3', 'v4', 'v5']);
    expect(state.past).toHaveLength(3);
  });

  it('coalesces rapid consecutive pushes with matching coalesceKey within coalesceMs', () => {
    const s0 = createStudioHistory(makeDoc('nudge-0', 0));
    const s1 = pushStudioHistory(s0, makeDoc('nudge-1', 1), {
      coalesceKey: 'nudge:img-1',
      now: 1000,
    });
    const s2 = pushStudioHistory(s1, makeDoc('nudge-2', 2), {
      coalesceKey: 'nudge:img-1',
      now: 1000 + DEFAULT_COALESCE_MS - 100,
    });
    const s3 = pushStudioHistory(s2, makeDoc('nudge-3', 3), {
      coalesceKey: 'nudge:img-1',
      now: 1000 + DEFAULT_COALESCE_MS - 50,
    });

    // Only one undo entry recorded (the original pre-nudge snapshot)
    expect(s3.past.map((d) => d.title)).toEqual(['nudge-0']);
    expect(s3.present.title).toBe('nudge-3');

    // After coalesceMs window expires, same key starts a new undo entry
    const s4 = pushStudioHistory(s3, makeDoc('nudge-4', 4), {
      coalesceKey: 'nudge:img-1',
      coalesceMs: 300,
      now: 2000,
    });
    expect(s4.past.map((d) => d.title)).toEqual(['nudge-0', 'nudge-3']);

    // Different coalesceKey immediately starts a new undo entry even within window
    const s5 = pushStudioHistory(s4, makeDoc('color-1', 4), {
      coalesceKey: 'color:front',
      coalesceMs: 1000,
      now: 2050,
    });
    expect(s5.past.map((d) => d.title)).toEqual(['nudge-0', 'nudge-3', 'nudge-4']);

    // Undo resets coalesce metadata so pushing the same key does not coalesce
    const undone = undoStudioHistory(s5);
    const afterUndo = pushStudioHistory(undone, makeDoc('color-2', 5), {
      coalesceKey: 'color:front',
      now: 2060,
    });
    expect(afterUndo.past.map((d) => d.title)).toEqual(['nudge-0', 'nudge-3', 'nudge-4']);
    expect(afterUndo.present.title).toBe('color-2');
  });

  it('resets past and future stacks cleanly', () => {
    let state = createStudioHistory(makeDoc('v0', 0));
    state = pushStudioHistory(state, makeDoc('v1', 1), { now: 100 });
    state = pushStudioHistory(state, makeDoc('v2', 2), { now: 200 });
    state = undoStudioHistory(state);

    const reset = resetStudioHistory(state, makeDoc('imported', 77));
    expect(reset.past).toEqual([]);
    expect(reset.future).toEqual([]);
    expect(reset.present.title).toBe('imported');
    expect(reset.lastCoalesceKey).toBeNull();
  });
});

describe('useStudioHistory hook', () => {
  it('tracks undo/redo stacks and invokes onApply with restored snapshots', () => {
    const { result } = renderHook(() => {
      const [doc, setDoc] = useState(() => makeDoc('v0', 0));
      const history = useStudioHistory(doc, setDoc);
      return { doc, setDoc, history };
    });

    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.history.canRedo).toBe(false);
    expect(result.current.history.undoCount).toBe(0);
    expect(result.current.history.redoCount).toBe(0);

    // No-op undo/redo return false
    let didUndo = true;
    let didRedo = true;
    act(() => {
      didUndo = result.current.history.undo();
      didRedo = result.current.history.redo();
    });
    expect(didUndo).toBe(false);
    expect(didRedo).toBe(false);

    // Record two changes
    act(() => {
      result.current.history.recordChange(makeDoc('v1', 10));
    });
    act(() => {
      result.current.history.recordChange(makeDoc('v2', 20));
    });

    expect(result.current.doc.title).toBe('v2');
    expect(result.current.history.canUndo).toBe(true);
    expect(result.current.history.canRedo).toBe(false);
    expect(result.current.history.undoCount).toBe(2);

    // Undo once
    act(() => {
      didUndo = result.current.history.undo();
    });
    expect(didUndo).toBe(true);
    expect(result.current.doc.title).toBe('v1');
    expect(result.current.history.undoCount).toBe(1);
    expect(result.current.history.redoCount).toBe(1);
    expect(result.current.history.canRedo).toBe(true);

    // Redo once
    act(() => {
      didRedo = result.current.history.redo();
    });
    expect(didRedo).toBe(true);
    expect(result.current.doc.title).toBe('v2');
    expect(result.current.history.undoCount).toBe(2);
    expect(result.current.history.redoCount).toBe(0);
  });

  it('caps undo history according to options.maxEntries', () => {
    const onApply = vi.fn();
    const { result } = renderHook(() =>
      useStudioHistory(makeDoc('v0', 0), onApply, { maxEntries: 2 }),
    );

    act(() => {
      result.current.recordChange(makeDoc('v1', 1));
      result.current.recordChange(makeDoc('v2', 2));
      result.current.recordChange(makeDoc('v3', 3));
    });

    expect(result.current.undoCount).toBe(2);

    act(() => {
      expect(result.current.undo()).toBe(true);
    });
    expect(onApply).toHaveBeenLastCalledWith(makeDoc('v2', 2));

    act(() => {
      expect(result.current.undo()).toBe(true);
    });
    expect(onApply).toHaveBeenLastCalledWith(makeDoc('v1', 1));

    act(() => {
      expect(result.current.undo()).toBe(false);
    });
  });

  it('coalesces rapid recordChange calls with matching coalesceKey', () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useStudioHistory(makeDoc('start', 0), onApply));

    act(() => {
      result.current.recordChange(makeDoc('step-1', 1), {
        coalesceKey: 'slider:font',
        coalesceMs: 400,
        now: 1000,
      });
      result.current.recordChange(makeDoc('step-2', 2), {
        coalesceKey: 'slider:font',
        coalesceMs: 400,
        now: 1100,
      });
      result.current.recordChange(makeDoc('step-3', 3), {
        coalesceKey: 'slider:font',
        coalesceMs: 400,
        now: 1200,
      });
    });

    expect(result.current.undoCount).toBe(1);

    act(() => {
      expect(result.current.undo()).toBe(true);
    });
    expect(onApply).toHaveBeenLastCalledWith(makeDoc('start', 0));
  });

  it('records a single undo step for drag gestures via recordSnapshotBefore and begin/commitTransaction', () => {
    const { result } = renderHook(() => {
      const [doc, setDoc] = useState(() => makeDoc('initial', 0));
      const history = useStudioHistory(doc, setDoc);
      return { doc, setDoc, history };
    });

    // Pattern 1: recordSnapshotBefore after live pointermove updates
    const beforeDrag = result.current.doc;
    act(() => {
      result.current.setDoc(makeDoc('drag-mid-1', 5));
    });
    act(() => {
      result.current.setDoc(makeDoc('drag-mid-2', 12));
    });
    act(() => {
      result.current.history.recordSnapshotBefore(beforeDrag, makeDoc('drag-end', 20));
    });

    expect(result.current.doc.title).toBe('drag-end');
    expect(result.current.history.undoCount).toBe(1);

    // Pattern 2: beginTransaction / commitTransaction
    act(() => {
      result.current.history.beginTransaction();
    });
    act(() => {
      result.current.setDoc(makeDoc('resize-mid', 25));
    });
    act(() => {
      result.current.history.commitTransaction(makeDoc('resize-end', 40));
    });

    expect(result.current.doc.title).toBe('resize-end');
    expect(result.current.history.undoCount).toBe(2);

    // Undoing steps straight back to drag-end, then initial
    act(() => {
      result.current.history.undo();
    });
    expect(result.current.doc.title).toBe('drag-end');

    act(() => {
      result.current.history.undo();
    });
    expect(result.current.doc.title).toBe('initial');
  });

  it('clears undo and redo stacks on reset without triggering onApply', () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useStudioHistory(makeDoc('v0', 0), onApply));

    act(() => {
      result.current.recordChange(makeDoc('v1', 1));
      result.current.recordChange(makeDoc('v2', 2));
      result.current.undo();
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
    onApply.mockClear();

    act(() => {
      result.current.reset(makeDoc('sample-project', 100));
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.undoCount).toBe(0);
    expect(result.current.redoCount).toBe(0);
    expect(onApply).not.toHaveBeenCalled();
  });
});
