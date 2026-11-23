import type { Listener, Unsubscribe } from './types';

interface Entry<T> {
  fn: Listener<T>;
  active: boolean;
}

/**
 * Copy-on-write listener registry.
 *
 * - `subscribe`/`unsubscribe` replace the array, so a notification pass in
 *   progress keeps iterating a stable snapshot.
 * - Unsubscribing flips `active`, so a listener removed mid-notification is
 *   not called later in the same pass.
 */
export interface ListenerRegistry<T> {
  add(fn: Listener<T>): Unsubscribe;
  /**
   * Calls every active listener with `(state, prev)`. Stops early if
   * `isStale()` becomes true, meaning a listener triggered a newer change
   * whose own notification pass has already delivered the latest state.
   */
  notify(state: T, prev: T, isStale: () => boolean, onError: ((e: unknown) => void) | undefined): void;
  readonly size: number;
}

export function createListenerRegistry<T>(): ListenerRegistry<T> {
  let entries: Entry<T>[] = [];

  return {
    add(fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('[uni-state-storage] subscribe() expects a function.');
      }
      const entry: Entry<T> = { fn, active: true };
      entries = entries.concat(entry);
      return () => {
        if (!entry.active) return;
        entry.active = false;
        entries = entries.filter((e) => e !== entry);
      };
    },

    notify(state, prev, isStale, onError) {
      const snapshot = entries;
      let failed = false;
      let firstError: unknown;
      for (let i = 0; i < snapshot.length; i++) {
        if (isStale()) break;
        const entry = snapshot[i]!;
        if (!entry.active) continue;
        try {
          entry.fn(state, prev);
        } catch (error) {
          if (onError) onError(error);
          else if (!failed) {
            failed = true;
            firstError = error;
          }
        }
      }
      if (failed) throw firstError;
    },

    get size() {
      return entries.length;
    },
  };
}
