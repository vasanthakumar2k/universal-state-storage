/**
 * Public types for the uni-state-storage core engine.
 *
 * The core is platform-independent: nothing in `src/core` may reference
 * browser globals, React, or React Native APIs.
 */

/** A next value, or a function that derives the next value from the previous one. */
export type Updater<T> = T | ((prev: T) => T);

/** Called after every state change with the new and previous state. */
export type Listener<T> = (state: T, prevState: T) => void;

/** Called when a selected slice of state changes. */
export type SelectorListener<S> = (selected: S, prevSelected: S) => void;

/** Derives a value from the store state. Should be pure. */
export type Selector<T, S> = (state: T) => S;

/** Returns `true` when two values should be considered equal (no notification). */
export type EqualityFn<S> = (a: S, b: S) => boolean;

/** Removes a subscription. Safe to call more than once. */
export type Unsubscribe = () => void;

export interface StoreOptions {
  /**
   * Receives errors thrown by subscribers. When omitted, the first subscriber
   * error is re-thrown from the call that changed state (`set`, `setItem`, ...)
   * *after* the state is committed and every other subscriber has run.
   */
  onError?: (error: unknown) => void;
}

/**
 * Where persisted state lives. `localStorage` already satisfies this, and so do
 * async stores such as React Native's AsyncStorage.
 */
export interface StorageAdapter {
  getItem(key: string): string | null | undefined | PromiseLike<string | null | undefined>;
  setItem(key: string, value: string): void | PromiseLike<unknown>;
  removeItem(key: string): void | PromiseLike<unknown>;
}

export interface PersistOptions<T = unknown> extends StoreOptions {
  /** Storage to use. Defaults to `localStorage`; falls back to memory-only when unavailable (SSR, blocked storage). */
  storage?: StorageAdapter;
  /** Storage key. Defaults to the store name. */
  key?: string;
  /** Bump when the shape of the saved state changes. Default `0`. */
  version?: number;
  /** Converts state saved under an older `version`. Without it, old saved data is ignored. */
  migrate?: (stored: unknown, storedVersion: number) => unknown;
  /** Chooses what gets saved, e.g. leave out a token: `s => ({ cart: s.cart })`. */
  partialize?: (state: T) => unknown;
}

export interface Store<T> {
  /** The name the store was created with. Used as the storage key when persistence is enabled. */
  readonly name: string;

  /** Returns the current state. Treat it as immutable. */
  get(): T;

  /** Replaces the whole state. Accepts a value or `prev => next`. */
  set(next: Updater<T>): void;

  /** Replaces the whole state with the result of `updater(prev)`. */
  update(updater: (prev: T) => T): void;

  /** Returns one property of an object state. */
  getItem<K extends keyof T>(key: K): T[K];

  /** Sets one property of an object state. Accepts a value or `prev => next`. */
  setItem<K extends keyof T>(key: K, value: Updater<T[K]>): void;

  /** Deletes one property from an object state. No-op if the key is absent. */
  removeItem<K extends keyof T>(key: K): void;

  /** Restores the initial state. */
  clear(): void;

  /** Returns the initial state the store was created with. */
  getInitialState(): T;

  /** Subscribes to every state change. */
  subscribe(listener: Listener<T>): Unsubscribe;

  /**
   * Subscribes to a selected slice of state. `listener` runs only when the
   * selected value changes according to `equalityFn` (default `Object.is`).
   */
  subscribe<S>(
    selector: Selector<T, S>,
    listener: SelectorListener<S>,
    equalityFn?: EqualityFn<S>,
  ): Unsubscribe;

  /**
   * Resolves once the store is ready to use. In-memory stores are ready
   * immediately. Persisted stores resolve once saved data has been loaded
   * (with localStorage it is already loaded when `createStore.persist` returns).
   */
  ready(): Promise<void>;
}
