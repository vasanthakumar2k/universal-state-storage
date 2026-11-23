import { describe, expect, it, vi } from 'vitest';
import { createStore, mmkvAdapter, setDefaultStorage } from '../src';
import type { StorageAdapter } from '../src';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const adapter: StorageAdapter = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
  return { adapter, data };
}

const initial = { name: '', age: 0, loggedIn: false };
const tick = () => Promise.resolve().then(() => undefined);

describe('createStore.persist', () => {
  it('saves updates and restores them in a new store', async () => {
    const { adapter, data } = memoryStorage();
    const a = createStore.persist('user', initial, { storage: adapter });
    a.setItem('name', 'Vasanth');
    a.setItem('age', 25);
    await tick();
    await tick();
    expect(JSON.parse(data.get('user')!)).toEqual({ v: 0, state: { name: 'Vasanth', age: 25, loggedIn: false } });

    const b = createStore.persist('user', initial, { storage: adapter });
    expect(b.get()).toEqual({ name: 'Vasanth', age: 25, loggedIn: false }); // sync hydration
    expect(b.getInitialState()).toEqual(initial);
  });

  it('coalesces many updates in one tick into one write', async () => {
    const { adapter } = memoryStorage();
    const spy = vi.spyOn(adapter, 'setItem');
    const s = createStore.persist('c', { n: 0 }, { storage: adapter });
    for (let i = 1; i <= 50; i++) s.setItem('n', i);
    await tick();
    await tick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not write on creation or after hydration', async () => {
    const { adapter } = memoryStorage({ user: JSON.stringify({ v: 0, state: { name: 'X' } }) });
    const spy = vi.spyOn(adapter, 'setItem');
    const s = createStore.persist('user', initial, { storage: adapter });
    await tick();
    await tick();
    expect(s.get()).toEqual({ ...initial, name: 'X' }); // new keys keep defaults
    expect(spy).not.toHaveBeenCalled();
  });

  it('clear() restores initial state and deletes the saved entry', async () => {
    const { adapter, data } = memoryStorage();
    const s = createStore.persist('user', initial, { storage: adapter });
    s.setItem('name', 'A');
    await tick();
    await tick();
    expect(data.has('user')).toBe(true);
    s.clear();
    await tick();
    await tick();
    expect(s.get()).toEqual(initial);
    expect(data.has('user')).toBe(false);
  });

  it('partialize leaves fields out of storage', async () => {
    const { adapter, data } = memoryStorage();
    const s = createStore.persist('u', { token: '', cart: [] as string[] }, {
      storage: adapter,
      partialize: (st) => ({ cart: st.cart }),
    });
    s.setItem('token', 'secret');
    s.setItem('cart', ['a']);
    await tick();
    await tick();
    expect(JSON.parse(data.get('u')!).state).toEqual({ cart: ['a'] });
  });

  it('migrates old versions, and ignores them without migrate', () => {
    const old = JSON.stringify({ v: 1, state: { fullName: 'Old' } });
    const withMigrate = createStore.persist('u', { name: '' }, {
      storage: memoryStorage({ u: old }).adapter,
      version: 2,
      migrate: (stored) => ({ name: (stored as { fullName: string }).fullName }),
    });
    expect(withMigrate.get()).toEqual({ name: 'Old' });

    const without = createStore.persist('u', { name: '' }, { storage: memoryStorage({ u: old }).adapter, version: 2 });
    expect(without.get()).toEqual({ name: '' });
  });

  it('survives corrupt data and reports it via onError', () => {
    const onError = vi.fn();
    const s = createStore.persist('u', { name: 'init' }, {
      storage: memoryStorage({ u: '{not json' }).adapter,
      onError,
    });
    expect(s.get()).toEqual({ name: 'init' });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps working in memory when storage writes fail', async () => {
    const onError = vi.fn();
    const adapter: StorageAdapter = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    const s = createStore.persist('u', { n: 0 }, { storage: adapter, onError });
    s.setItem('n', 1);
    await tick();
    await tick();
    await tick();
    expect(s.get()).toEqual({ n: 1 });
    expect(onError).toHaveBeenCalled();
  });

  it('supports async storage; ready() resolves after hydration; early edits win', async () => {
    const data = new Map([['u', JSON.stringify({ v: 0, state: { name: 'Saved', age: 9 } })]]);
    const adapter: StorageAdapter = {
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => void data.set(k, v),
      removeItem: async (k) => void data.delete(k),
    };
    const s = createStore.persist('u', { name: '', age: 0 }, { storage: adapter });
    s.setItem('age', 30); // before hydration finishes
    await s.ready();
    expect(s.get()).toEqual({ name: 'Saved', age: 30 });
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(data.get('u')!).state).toEqual({ name: 'Saved', age: 30 });
  });

  it('falls back to memory when no storage exists (SSR)', () => {
    const s = createStore.persist('u', { n: 0 });
    s.setItem('n', 2);
    expect(s.get()).toEqual({ n: 2 });
  });

  it('uses globalThis.localStorage by default', async () => {
    const { adapter, data } = memoryStorage();
    (globalThis as { localStorage?: StorageAdapter }).localStorage = adapter;
    try {
      const s = createStore.persist('ls', { n: 0 });
      s.setItem('n', 5);
      await tick();
      await tick();
      expect(JSON.parse(data.get('ls')!).state).toEqual({ n: 5 });
      expect(createStore.persist('ls', { n: 0 }).get()).toEqual({ n: 5 });
    } finally {
      delete (globalThis as { localStorage?: StorageAdapter }).localStorage;
    }
  });

  it('setDefaultStorage supplies the storage (React Native style, async)', async () => {
    const data = new Map<string, string>();
    setDefaultStorage({
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => void data.set(k, v),
      removeItem: async (k) => void data.delete(k),
    });
    try {
      const a = createStore.persist('rn', { n: 0 });
      await a.ready();
      a.setItem('n', 7);
      await new Promise((r) => setTimeout(r, 0));
      const b = createStore.persist('rn', { n: 0 });
      await b.ready();
      expect(b.get()).toEqual({ n: 7 });
    } finally {
      setDefaultStorage(undefined);
    }
  });

  it('mmkvAdapter works as a sync adapter', async () => {
    const m = new Map<string, string>();
    const adapter = mmkvAdapter({ getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), delete: (k) => void m.delete(k) });
    const a = createStore.persist('mm', { n: 0 }, { storage: adapter });
    a.setItem('n', 3);
    await tick();
    await tick();
    expect(createStore.persist('mm', { n: 0 }, { storage: adapter }).get()).toEqual({ n: 3 });
    a.clear();
    await tick();
    await tick();
    expect(m.has('mm')).toBe(false);
  });

  it('warns on React Native when no storage is configured', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const g = globalThis as { navigator?: unknown };
    const prev = Object.getOwnPropertyDescriptor(g, 'navigator');
    Object.defineProperty(g, 'navigator', { value: { product: 'ReactNative' }, configurable: true });
    try {
      createStore.persist('warn', { n: 0 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('setDefaultStorage'));
    } finally {
      if (prev) Object.defineProperty(g, 'navigator', prev);
      else delete g.navigator;
      warn.mockRestore();
    }
  });

  it('validates arguments', () => {
    expect(() => createStore.persist('', {})).toThrow(TypeError);
    expect(() => createStore.persist('x', undefined)).toThrow(/createStore\.persist/);
    expect(() => createStore.persist('x', {}, { storage: {} as StorageAdapter })).toThrow(TypeError);
  });
});
