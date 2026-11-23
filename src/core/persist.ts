import { buildStore } from './store';
import type { PersistOptions, StorageAdapter, Store } from './types';
import { isObjectState } from './update';

type MaybePromise<V> = V | PromiseLike<V>;

function isThenable<V>(value: MaybePromise<V>): value is PromiseLike<V> {
  return value !== null && typeof value === 'object' && typeof (value as PromiseLike<V>).then === 'function';
}

let defaultStorage: StorageAdapter | undefined;

/**
 * Sets the storage every `createStore.persist` uses when it isn't given one.
 * React Native has no `localStorage`, so call this once at app start, before
 * any store is created:
 *
 * @example
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * setDefaultStorage(AsyncStorage);
 */
export function setDefaultStorage(storage: StorageAdapter | undefined): void {
  if (storage !== undefined && (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function')) {
    throw new TypeError('[uni-state-storage] setDefaultStorage() expects an object with getItem, setItem and removeItem.');
  }
  defaultStorage = storage;
}

/** Minimal shape of a `react-native-mmkv` instance. */
export interface MMKVLike {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete?(key: string): void;
  remove?(key: string): boolean | void; // react-native-mmkv v3+
}

/**
 * Wraps a `react-native-mmkv` instance as a (synchronous) storage adapter.
 *
 * @example
 * setDefaultStorage(mmkvAdapter(new MMKV()));
 */
export function mmkvAdapter(mmkv: MMKVLike): StorageAdapter {
  return {
    getItem: (key) => mmkv.getString(key) ?? null,
    setItem: (key, value) => mmkv.set(key, value),
    removeItem: (key) => {
      if (typeof mmkv.remove === 'function') mmkv.remove(key);
      else mmkv.delete?.(key);
    },
  };
}

function isReactNative(): boolean {
  return (globalThis as { navigator?: { product?: string } }).navigator?.product === 'ReactNative';
}

/** `globalThis.localStorage` if it exists and works (not SSR, not blocked by privacy mode), else `undefined`. */
function resolveDefaultStorage(): StorageAdapter | undefined {
  try {
    const ls = (globalThis as { localStorage?: StorageAdapter }).localStorage;
    if (!ls) return undefined;
    ls.setItem('__uni_state_storage_probe__', '1');
    ls.removeItem('__uni_state_storage_probe__');
    return ls;
  } catch {
    return undefined;
  }
}

declare const require: ((id: string) => unknown) | undefined;

/**
 * React Native only: use AsyncStorage if the app has installed it.
 * It is NOT a dependency of this package; nothing is added to the app. The
 * require is a plain string literal inside try/catch so Metro treats it as
 * optional and the bundle still builds when AsyncStorage is not installed.
 */
function resolveReactNativeStorage(): StorageAdapter | undefined {
  if (!isReactNative()) return undefined;
  try {
    const mod = require!('@react-native-async-storage/async-storage') as ({ default?: StorageAdapter } & Partial<StorageAdapter>) | undefined;
    const storage = (mod?.default ?? mod) as StorageAdapter | undefined;
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' && typeof storage.removeItem === 'function') {
      return storage;
    }
  } catch {
    // AsyncStorage is not installed in this app
  }
  return undefined;
}

interface Envelope {
  v: number;
  state: unknown;
}

/**
 * Builds a store whose state is saved to a storage adapter (localStorage by default).
 *
 * - Hydration is synchronous when the adapter is synchronous (localStorage), so
 *   `get()` already returns the saved data right after creation.
 * - Writes are coalesced into one write per tick and never block `set`/`setItem`.
 * - Storage failures go to `onError` and never corrupt the in-memory state.
 */
export function buildPersistedStore<T>(name: string, initialState: T, options: PersistOptions<T>): Store<T> {
  const base = buildStore<T>(name, initialState, options);
  const initial = base.getInitialState();
  const onError = options.onError;
  const key = options.key ?? name;
  const version = options.version ?? 0;
  const partialize = options.partialize as ((state: T) => unknown) | undefined;

  const warn = (...args: unknown[]): void => {
    (globalThis as { console?: { warn?: (...a: unknown[]) => void } }).console?.warn?.(...args);
  };
  const report = (error: unknown): void => {
    if (onError) onError(error);
    else warn(`[uni-state-storage] persistence error in store "${name}":`, error);
  };

  const storage = options.storage ?? defaultStorage ?? resolveDefaultStorage() ?? resolveReactNativeStorage();
  if (!storage) {
    // No storage available (SSR, blocked storage): behave as a normal in-memory store.
    if (isReactNative()) {
      warn(
        `[uni-state-storage] store "${name}" is NOT being saved: React Native has no localStorage. ` +
          'Install @react-native-async-storage/async-storage (it is picked up automatically), or call setDefaultStorage(...) once at app start, or pass { storage }.',
      );
    }
    return base;
  }

  // ---- writing ---------------------------------------------------------
  let hydrated = false;
  let hydrating = false; // true while hydration itself is committing; skip echo writes
  let changedBeforeHydration = false;
  let scheduled = false;
  let writeChain: Promise<void> = Promise.resolve();

  const safe = (fn: () => MaybePromise<unknown>): void => {
    writeChain = writeChain.then(fn).then(
      () => undefined,
      (error) => report(error),
    );
  };

  const flush = (): void => {
    if (!scheduled) return; // cancelled by clear()
    scheduled = false;
    let serialized: string;
    try {
      const state = partialize ? partialize(base.get()) : base.get();
      serialized = JSON.stringify({ v: version, state } satisfies Envelope);
    } catch (error) {
      report(error);
      return;
    }
    safe(() => storage.setItem(key, serialized));
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    void Promise.resolve().then(flush);
  };

  // ---- reading ---------------------------------------------------------
  /** Parses the stored string into a state to merge, or `undefined` when there is nothing usable. */
  const parse = (raw: string | null | undefined): { value: unknown } | undefined => {
    if (raw === null || raw === undefined) return undefined;
    try {
      const env = JSON.parse(raw) as Envelope;
      if (env === null || typeof env !== 'object' || !('state' in env)) {
        throw new TypeError(`Stored value for "${key}" is not a uni-state-storage entry.`);
      }
      let stored = env.state;
      if (env.v !== version) {
        if (!options.migrate) return undefined; // unknown shape: ignore it, start from initial
        stored = options.migrate(stored, env.v);
      }
      return { value: stored };
    } catch (error) {
      report(error);
      return undefined;
    }
  };

  const applyHydration = (stored: unknown): void => {
    const current = base.get();
    let next: T;
    if (isObjectState(initial) && isObjectState(stored)) {
      // initial defaults < stored values < anything the app changed before hydration finished
      const edits: Record<PropertyKey, unknown> = {};
      if (changedBeforeHydration && isObjectState(current)) {
        for (const k of Reflect.ownKeys(current)) {
          if (!Object.is(current[k], (initial as Record<PropertyKey, unknown>)[k])) edits[k] = current[k];
        }
      }
      next = { ...initial, ...stored, ...edits } as T;
    } else if (changedBeforeHydration) {
      return; // primitive/array state already changed by the app: its value wins
    } else {
      next = stored as T;
    }
    hydrating = true;
    try {
      base.set(() => next);
    } finally {
      hydrating = false;
    }
  };

  const finishHydration = (): void => {
    hydrated = true;
    if (changedBeforeHydration) schedule(); // persist what the app changed meanwhile
  };

  // Subscribe first so changes during async hydration are noticed.
  base.subscribe(() => {
    if (hydrating) return;
    if (!hydrated) {
      changedBeforeHydration = true;
      return;
    }
    schedule();
  });

  let readyPromise: Promise<void> = Promise.resolve();
  try {
    const result = storage.getItem(key);
    if (isThenable(result)) {
      readyPromise = Promise.resolve(result).then(
        (raw) => {
          const parsed = parse(raw);
          if (parsed) applyHydration(parsed.value);
          finishHydration();
        },
        (error) => {
          report(error);
          finishHydration();
        },
      );
    } else {
      const parsed = parse(result);
      if (parsed) applyHydration(parsed.value);
      finishHydration();
    }
  } catch (error) {
    report(error);
    finishHydration();
  }

  return {
    ...base,
    clear() {
      base.clear();
      // Drop the saved copy too, and cancel any write queued by the clear itself.
      scheduled = false;
      safe(() => storage.removeItem(key));
    },
    ready: () => readyPromise,
  };
}
