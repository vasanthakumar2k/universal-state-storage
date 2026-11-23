import { buildPersistedStore } from './persist';
import { buildStore } from './store';
import type { PersistOptions, Store, StoreOptions } from './types';

function validate(fn: string, name: string, initialState: unknown, options: unknown): void {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError(`[uni-state-storage] ${fn}() expects a non-empty string name as its first argument.`);
  }
  if (initialState === undefined) {
    throw new TypeError(`[uni-state-storage] ${fn}("${name}") requires an initial state (got undefined).`);
  }
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`[uni-state-storage] ${fn}("${name}") options must be an object.`);
  }
  const o = options as PersistOptions;
  if (o.onError !== undefined && typeof o.onError !== 'function') {
    throw new TypeError(`[uni-state-storage] ${fn}("${name}") options.onError must be a function.`);
  }
  if (o.storage !== undefined) {
    const s = o.storage;
    if (s === null || typeof s.getItem !== 'function' || typeof s.setItem !== 'function' || typeof s.removeItem !== 'function') {
      throw new TypeError(`[uni-state-storage] ${fn}("${name}") options.storage must have getItem, setItem and removeItem.`);
    }
  }
  if (o.migrate !== undefined && typeof o.migrate !== 'function') {
    throw new TypeError(`[uni-state-storage] ${fn}("${name}") options.migrate must be a function.`);
  }
  if (o.partialize !== undefined && typeof o.partialize !== 'function') {
    throw new TypeError(`[uni-state-storage] ${fn}("${name}") options.partialize must be a function.`);
  }
}

/**
 * Creates a store.
 *
 * @param name - Identifies the store. Must be a non-empty string.
 * @param initialState - Any value except `undefined`. Object states unlock
 *   `getItem` / `setItem` / `removeItem`.
 * @param options - Optional settings.
 *
 * @example
 * const user = createStore('user', { name: '', age: 0, loggedIn: false });
 * user.setItem('name', 'Vasanth');
 * user.getItem('name'); // 'Vasanth'
 */
function createStoreImpl<T>(name: string, initialState: T, options: StoreOptions = {}): Store<T> {
  validate('createStore', name, initialState, options);
  return buildStore<T>(name, initialState, options);
}

/**
 * Same as `createStore`, but the state is saved to `localStorage` (or
 * `options.storage`) and restored the next time the store is created.
 *
 * @example
 * const userStore = createStore.persist('user', { name: '', age: 0, loggedIn: false });
 */
function persist<T>(name: string, initialState: T, options: PersistOptions<T> = {}): Store<T> {
  validate('createStore.persist', name, initialState, options);
  return buildPersistedStore<T>(name, initialState, options);
}

export const createStore: typeof createStoreImpl & { persist: typeof persist } = Object.assign(createStoreImpl, {
  persist,
});
