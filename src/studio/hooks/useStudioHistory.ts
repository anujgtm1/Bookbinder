import { useCallback, useEffect, useRef, useState } from 'react';

export const DEFAULT_MAX_HISTORY_ENTRIES = 50;
export const DEFAULT_COALESCE_MS = 400;

export interface StudioHistoryPushOptions {
  /** Group rapid consecutive edits (e.g., slider drags, arrow nudging) into a single undo entry */
  readonly coalesceKey?: string;
  /** Maximum time window in ms for coalescing edits with the same key (default 400 ms) */
  readonly coalesceMs?: number;
  /** Optional timestamp override (ms) for deterministic testing */
  readonly now?: number;
}

export interface StudioHistoryState<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  readonly maxEntries: number;
  readonly lastCoalesceKey: string | null;
  readonly lastPushAt: number;
}

export interface UseStudioHistoryOptions {
  readonly maxEntries?: number;
}

export interface UseStudioHistoryResult<T> {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoCount: number;
  readonly redoCount: number;
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly recordChange: (next: T, options?: StudioHistoryPushOptions) => void;
  readonly recordSnapshotBefore: (prevSnapshot: T, next: T) => void;
  readonly beginTransaction: () => void;
  readonly commitTransaction: (next: T) => void;
  readonly reset: (snapshot: T) => void;
}

const UNSET = Symbol('unset');

function normalizeMaxEntries(maxEntries?: number): number {
  if (typeof maxEntries !== 'number' || !Number.isFinite(maxEntries) || maxEntries < 1) {
    return DEFAULT_MAX_HISTORY_ENTRIES;
  }
  return Math.floor(maxEntries);
}

function clampStack<T>(stack: readonly T[], maxEntries: number): readonly T[] {
  if (stack.length <= maxEntries) return stack;
  return stack.slice(stack.length - maxEntries);
}

/**
 * Deeply clones a serializable studio snapshot using `structuredClone` when available,
 * falling back to JSON round-tripping in environments without `structuredClone`.
 */
export function cloneSnapshot<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createStudioHistory<T>(
  initial: T,
  maxEntries = DEFAULT_MAX_HISTORY_ENTRIES,
): StudioHistoryState<T> {
  return {
    past: [],
    present: cloneSnapshot(initial),
    future: [],
    maxEntries: normalizeMaxEntries(maxEntries),
    lastCoalesceKey: null,
    lastPushAt: 0,
  };
}

export function pushStudioHistory<T>(
  state: StudioHistoryState<T>,
  next: T,
  options?: StudioHistoryPushOptions,
): StudioHistoryState<T> {
  const now = options?.now ?? Date.now();
  const coalesceKey = options?.coalesceKey ?? null;
  const coalesceMs = options?.coalesceMs ?? DEFAULT_COALESCE_MS;

  const canCoalesce =
    coalesceKey !== null &&
    state.lastCoalesceKey === coalesceKey &&
    state.past.length > 0 &&
    now - state.lastPushAt <= coalesceMs;

  if (canCoalesce) {
    return {
      ...state,
      present: cloneSnapshot(next),
      future: [],
      lastCoalesceKey: coalesceKey,
      lastPushAt: now,
    };
  }

  const nextPast = clampStack([...state.past, cloneSnapshot(state.present)], state.maxEntries);

  return {
    ...state,
    past: nextPast,
    present: cloneSnapshot(next),
    future: [],
    lastCoalesceKey: coalesceKey,
    lastPushAt: now,
  };
}

export function undoStudioHistory<T>(state: StudioHistoryState<T>): StudioHistoryState<T> {
  if (state.past.length === 0) {
    return state;
  }

  const previous = state.past[state.past.length - 1];
  const nextPast = state.past.slice(0, -1);
  const nextFuture = [cloneSnapshot(state.present), ...state.future].slice(0, state.maxEntries);

  return {
    ...state,
    past: nextPast,
    present: cloneSnapshot(previous),
    future: nextFuture,
    lastCoalesceKey: null,
    lastPushAt: 0,
  };
}

export function redoStudioHistory<T>(state: StudioHistoryState<T>): StudioHistoryState<T> {
  if (state.future.length === 0) {
    return state;
  }

  const [nextPresent, ...nextFuture] = state.future;
  const nextPast = clampStack([...state.past, cloneSnapshot(state.present)], state.maxEntries);

  return {
    ...state,
    past: nextPast,
    present: cloneSnapshot(nextPresent),
    future: nextFuture,
    lastCoalesceKey: null,
    lastPushAt: 0,
  };
}

export function resetStudioHistory<T>(
  state: StudioHistoryState<T>,
  snapshot: T,
): StudioHistoryState<T> {
  return {
    ...state,
    past: [],
    present: cloneSnapshot(snapshot),
    future: [],
    lastCoalesceKey: null,
    lastPushAt: 0,
  };
}

export function useStudioHistory<T>(
  current: T,
  onApply: (next: T) => void,
  options?: UseStudioHistoryOptions,
): UseStudioHistoryResult<T> {
  const maxEntries = normalizeMaxEntries(options?.maxEntries);

  const [history, setHistory] = useState<StudioHistoryState<T>>(() =>
    createStudioHistory(current, maxEntries),
  );

  const historyRef = useRef<StudioHistoryState<T>>(history);
  const onApplyRef = useRef(onApply);
  const lastExternalCurrentRef = useRef<T>(current);
  const lastAppliedRef = useRef<T | typeof UNSET>(UNSET);
  const transactionSnapshotRef = useRef<T | null>(null);

  useEffect(() => {
    onApplyRef.current = onApply;
  }, [onApply]);

  useEffect(() => {
    if (historyRef.current.maxEntries !== maxEntries) {
      const resized: StudioHistoryState<T> = {
        ...historyRef.current,
        maxEntries,
        past: clampStack(historyRef.current.past, maxEntries),
        future: historyRef.current.future.slice(0, maxEntries),
      };
      historyRef.current = resized;
      setHistory(resized);
    }
  }, [maxEntries]);

  useEffect(() => {
    if (current !== lastExternalCurrentRef.current) {
      lastExternalCurrentRef.current = current;
      if (current !== lastAppliedRef.current) {
        const synced: StudioHistoryState<T> = {
          ...historyRef.current,
          present: cloneSnapshot(current),
        };
        historyRef.current = synced;
      }
      lastAppliedRef.current = UNSET;
    }
  }, [current]);

  const recordChange = useCallback((next: T, pushOptions?: StudioHistoryPushOptions) => {
    const updated = pushStudioHistory(historyRef.current, next, pushOptions);
    historyRef.current = updated;
    lastAppliedRef.current = next;
    setHistory(updated);
    onApplyRef.current(next);
  }, []);

  const recordSnapshotBefore = useCallback((prevSnapshot: T, next: T) => {
    const withBaseline: StudioHistoryState<T> = {
      ...historyRef.current,
      present: cloneSnapshot(prevSnapshot),
      lastCoalesceKey: null,
      lastPushAt: 0,
    };
    const updated = pushStudioHistory(withBaseline, next);
    transactionSnapshotRef.current = null;
    historyRef.current = updated;
    lastAppliedRef.current = next;
    setHistory(updated);
    onApplyRef.current(next);
  }, []);

  const beginTransaction = useCallback(() => {
    transactionSnapshotRef.current = cloneSnapshot(historyRef.current.present);
  }, []);

  const commitTransaction = useCallback(
    (next: T) => {
      const prevSnapshot = transactionSnapshotRef.current ?? historyRef.current.present;
      recordSnapshotBefore(prevSnapshot, next);
    },
    [recordSnapshotBefore],
  );

  const undo = useCallback((): boolean => {
    const updated = undoStudioHistory(historyRef.current);
    if (updated === historyRef.current) {
      return false;
    }
    const restored = cloneSnapshot(updated.present);
    transactionSnapshotRef.current = null;
    historyRef.current = updated;
    lastAppliedRef.current = restored;
    setHistory(updated);
    onApplyRef.current(restored);
    return true;
  }, []);

  const redo = useCallback((): boolean => {
    const updated = redoStudioHistory(historyRef.current);
    if (updated === historyRef.current) {
      return false;
    }
    const restored = cloneSnapshot(updated.present);
    transactionSnapshotRef.current = null;
    historyRef.current = updated;
    lastAppliedRef.current = restored;
    setHistory(updated);
    onApplyRef.current(restored);
    return true;
  }, []);

  const reset = useCallback((snapshot: T) => {
    const updated = resetStudioHistory(historyRef.current, snapshot);
    transactionSnapshotRef.current = null;
    historyRef.current = updated;
    lastExternalCurrentRef.current = snapshot;
    lastAppliedRef.current = UNSET;
    setHistory(updated);
  }, []);

  return {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoCount: history.past.length,
    redoCount: history.future.length,
    undo,
    redo,
    recordChange,
    recordSnapshotBefore,
    beginTransaction,
    commitTransaction,
    reset,
  };
}
