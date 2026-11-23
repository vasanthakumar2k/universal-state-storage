import { createSelectorListener } from './selector';
import { createListenerRegistry } from './subscribe';
import type {
  EqualityFn,
  Listener,
  Selector,
  SelectorListener,
  Store,
  StoreOptions,
  Unsubscribe,
  Updater,
} from './types';
import {
  assertObjectState,
  hasKey,
  isObjectState,
  resolveUpdater,
  withKey,
  withoutKey,
  type ObjectState,
} from './update';

/**
 * Builds a store instance. All methods are closures, so they can be
 * destructured (`const { setItem } = store`) without losing `this`.
 *
 * Invariants:
 * - State updates are synchronous; `get()` reflects a change immediately.
 * - Subscribers are notified synchronously after each committed change.
 * - A change whose result is `Object.is`-equal to the current state is a no-op.
 * - State is never `undefined`.
 */
export function buildStore<T>(name: string, initialState: T, options: StoreOptions): Store<T> {
  // Own a shallow copy so a caller mutating their initial object can't leak
  // into this store, and two stores built from one object stay independent.
  const initial: T = isObjectState(initialState) ? ({ ...initialState } as T) : initialState;
  const onError = options.onError;
  const registry = createListenerRegistry<T>();

  let state: T = initial;
  let version = 0;

  function commit(next: T, method: string): void {
    if (next === undefined) {
      throw new TypeError(
        `[uni-state-storage] ${method}() on store "${name}" produced undefined. ` +
          'State can never be undefined; did an updater forget to return the next state?',
      );
    }
    if (Object.is(next, state)) return;
    const prev = state;
    state = next;
    const committed = ++version;
    if (registry.size === 0) return;
    registry.notify(next, prev, () => version !== committed, onError);
  }

  const store: Store<T> = {
    name,

    get: () => state,

    set(next: Updater<T>) {
      commit(resolveUpdater(next, state), 'set');
    },

    update(updater: (prev: T) => T) {
      if (typeof updater !== 'function') {
        throw new TypeError(`[uni-state-storage] update() on store "${name}" expects a function.`);
      }
      commit(updater(state), 'update');
    },

    getItem<K extends keyof T>(key: K): T[K] {
      assertObjectState(state, name, 'getItem');
      return (state as ObjectState)[key as PropertyKey] as T[K];
    },

    setItem<K extends keyof T>(key: K, value: Updater<T[K]>) {
      const current = state;
      assertObjectState(current, name, 'setItem');
      const k = key as PropertyKey;
      const prevValue = current[k] as T[K];
      const nextValue = resolveUpdater(value, prevValue);
      if (Object.is(prevValue, nextValue) && hasKey(current, k)) return;
      commit(withKey(current, k, nextValue) as T, 'setItem');
    },

    removeItem<K extends keyof T>(key: K) {
      const current = state;
      assertObjectState(current, name, 'removeItem');
      const k = key as PropertyKey;
      if (!hasKey(current, k)) return;
      commit(withoutKey(current, k) as T, 'removeItem');
    },

    clear() {
      commit(initial, 'clear');
    },

    getInitialState: () => initial,

    subscribe<S>(
      selectorOrListener: Listener<T> | Selector<T, S>,
      listener?: SelectorListener<S>,
      equalityFn?: EqualityFn<S>,
    ): Unsubscribe {
      if (listener === undefined) {
        return registry.add(selectorOrListener as Listener<T>);
      }
      return registry.add(
        createSelectorListener(state, selectorOrListener as Selector<T, S>, listener, equalityFn),
      );
    },

    ready: () => Promise.resolve(),
  };

  return store;
}
