import type { Updater } from './types';

export type ObjectState = Record<PropertyKey, unknown>;

const hasOwn = Object.prototype.hasOwnProperty;

/** Resolves a value-or-function updater against the previous value. */
export function resolveUpdater<T>(next: Updater<T>, prev: T): T {
  return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

/** True for non-null, non-array objects: the shape `setItem` & friends operate on. */
export function isObjectState(value: unknown): value is ObjectState {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertObjectState(
  value: unknown,
  storeName: string,
  method: string,
): asserts value is ObjectState {
  if (!isObjectState(value)) {
    throw new TypeError(
      `[uni-state-storage] ${method}() on store "${storeName}" requires the state to be a plain object, ` +
        `but it is ${value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value}.`,
    );
  }
}

export function hasKey(state: ObjectState, key: PropertyKey): boolean {
  return hasOwn.call(state, key);
}

/** Returns a copy of `state` with `key` set to `value`. */
export function withKey(state: ObjectState, key: PropertyKey, value: unknown): ObjectState {
  return { ...state, [key]: value };
}

/**
 * Returns a copy of `state` without `key`. Uses rest destructuring rather than
 * copy-then-delete, which keeps the new object in V8's fast-properties mode.
 */
export function withoutKey(state: ObjectState, key: PropertyKey): ObjectState {
  const { [key]: _removed, ...rest } = state;
  return rest;
}
