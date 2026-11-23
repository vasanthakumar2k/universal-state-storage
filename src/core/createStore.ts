import { buildStore } from './store';
import type { Store, StoreOptions } from './types';

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
export function createStore<T>(name: string, initialState: T, options: StoreOptions = {}): Store<T> {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('[uni-state-storage] createStore() expects a non-empty string name as its first argument.');
  }
  if (initialState === undefined) {
    throw new TypeError(`[uni-state-storage] createStore("${name}") requires an initial state (got undefined).`);
  }
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`[uni-state-storage] createStore("${name}") options must be an object.`);
  }
  if (options.onError !== undefined && typeof options.onError !== 'function') {
    throw new TypeError(`[uni-state-storage] createStore("${name}") options.onError must be a function.`);
  }
  return buildStore<T>(name, initialState, options);
}
