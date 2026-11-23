import type { EqualityFn, Listener, Selector, SelectorListener } from './types';

/**
 * Shallow equality for plain objects and arrays: equal when both have the same
 * own enumerable keys (or indices) with `Object.is`-equal values.
 */
export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]!;
    if (!Object.prototype.hasOwnProperty.call(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Wraps a selector + listener into a plain store listener that only fires
 * when the selected value changes.
 */
export function createSelectorListener<T, S>(
  initialState: T,
  selector: Selector<T, S>,
  listener: SelectorListener<S>,
  equalityFn: EqualityFn<S> = Object.is,
): Listener<T> {
  if (typeof selector !== 'function' || typeof listener !== 'function') {
    throw new TypeError('[uni-state-storage] subscribe(selector, listener) expects two functions.');
  }
  let current = selector(initialState);
  return (state) => {
    const next = selector(state);
    if (equalityFn(current, next)) return;
    const prev = current;
    current = next;
    listener(next, prev);
  };
}
