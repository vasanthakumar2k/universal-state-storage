import { describe, expect, it, vi } from 'vitest';
import { createStore, shallow } from '../src/index';

const makeUser = () => createStore('user', { name: '', age: 0, loggedIn: false });

describe('createStore', () => {
  it('creates a store with the given name and initial state', () => {
    const user = makeUser();
    expect(user.name).toBe('user');
    expect(user.get()).toEqual({ name: '', age: 0, loggedIn: false });
  });

  it('validates its arguments', () => {
    // @ts-expect-error missing name
    expect(() => createStore()).toThrow(TypeError);
    expect(() => createStore('', {})).toThrow(/non-empty string/);
    expect(() => createStore('x', undefined)).toThrow(/initial state/);
    // @ts-expect-error bad options
    expect(() => createStore('x', {}, null)).toThrow(/options/);
    // @ts-expect-error bad onError
    expect(() => createStore('x', {}, { onError: 1 })).toThrow(/onError/);
  });

  it('accepts primitive, null and array states', () => {
    expect(createStore('n', 0).get()).toBe(0);
    expect(createStore('z', null).get()).toBeNull();
    expect(createStore('a', [1, 2]).get()).toEqual([1, 2]);
  });

  it('does not share or mutate the caller’s initial object', () => {
    const init = { count: 0 };
    const a = createStore('a', init);
    const b = createStore('b', init);
    a.setItem('count', 5);
    init.count = 99;
    expect(a.get().count).toBe(5);
    expect(b.get().count).toBe(0);
    expect(a.getInitialState().count).toBe(0);
  });
});

describe('get / set / update', () => {
  it('replaces the whole state with set(value)', () => {
    const user = makeUser();
    user.set({ name: 'Vasanth', age: 25, loggedIn: true });
    expect(user.get()).toEqual({ name: 'Vasanth', age: 25, loggedIn: true });
  });

  it('set() replaces, it does not merge', () => {
    const s = createStore<{ a?: number; b?: number }>('s', { a: 1, b: 2 });
    s.set({ a: 3 });
    expect(s.get()).toEqual({ a: 3 });
  });

  it('supports functional set()', () => {
    const counter = createStore('counter', { count: 1 });
    counter.set((prev) => ({ ...prev, count: prev.count + 1 }));
    expect(counter.get().count).toBe(2);
  });

  it('update() derives from the previous state', () => {
    const counter = createStore('counter', { count: 0 });
    counter.update((s) => ({ ...s, count: s.count + 1 }));
    counter.update((s) => ({ ...s, count: s.count + 1 }));
    expect(counter.get()).toEqual({ count: 2 });
  });

  it('update() requires a function', () => {
    const counter = createStore('counter', { count: 0 });
    // @ts-expect-error not a function
    expect(() => counter.update({ count: 1 })).toThrow(TypeError);
  });

  it('rejects undefined as next state and keeps the old state', () => {
    const counter = createStore('counter', { count: 0 });
    // @ts-expect-error updater that forgets to return
    expect(() => counter.update(() => {})).toThrow(/undefined/);
    // @ts-expect-error explicit undefined
    expect(() => counter.set(undefined)).toThrow(/undefined/);
    expect(counter.get()).toEqual({ count: 0 });
  });

  it('updates are synchronous', () => {
    const n = createStore('n', 0);
    n.set(1);
    expect(n.get()).toBe(1);
    n.set((x) => x + 1);
    expect(n.get()).toBe(2);
  });

  it('returns a new reference on change and the same reference otherwise', () => {
    const user = makeUser();
    const before = user.get();
    expect(user.get()).toBe(before);
    user.setItem('age', 1);
    expect(user.get()).not.toBe(before);
    expect(before.age).toBe(0); // previous snapshot untouched
  });
});

describe('getItem / setItem / removeItem / clear', () => {
  it('reads and writes individual properties', () => {
    const user = makeUser();
    user.setItem('name', 'Vasanth');
    expect(user.getItem('name')).toBe('Vasanth');
    expect(user.get()).toEqual({ name: 'Vasanth', age: 0, loggedIn: false });
  });

  it('supports functional setItem()', () => {
    const user = makeUser();
    user.setItem('age', (a) => a + 1);
    user.setItem('age', (a) => a + 1);
    expect(user.getItem('age')).toBe(2);
  });

  it('removes a property', () => {
    const user = makeUser();
    user.removeItem('name');
    expect(user.get()).toEqual({ age: 0, loggedIn: false });
    expect('name' in user.get()).toBe(false);
    expect(user.getItem('name')).toBeUndefined();
  });

  it('removeItem() of a missing key is a no-op', () => {
    const user = makeUser();
    const listener = vi.fn();
    user.removeItem('name');
    user.subscribe(listener);
    const ref = user.get();
    user.removeItem('name');
    expect(user.get()).toBe(ref);
    expect(listener).not.toHaveBeenCalled();
  });

  it('setItem() can re-add a removed key', () => {
    const user = makeUser();
    user.removeItem('name');
    user.setItem('name', 'back');
    expect(user.getItem('name')).toBe('back');
  });

  it('setItem() with an undefined value on a missing key adds the key', () => {
    const s = createStore<{ a?: number }>('s', {});
    s.setItem('a', undefined);
    expect(Object.keys(s.get())).toEqual(['a']);
  });

  it('clear() restores the initial state', () => {
    const user = makeUser();
    user.set({ name: 'V', age: 3, loggedIn: true });
    user.removeItem('age');
    user.clear();
    expect(user.get()).toEqual({ name: '', age: 0, loggedIn: false });
    expect(user.get()).toBe(user.getInitialState());
  });

  it('item methods throw a clear error on non-object state', () => {
    const n = createStore('n', 5);
    const arr = createStore('arr', [1]);
    const nul = createStore<Record<string, number> | null>('nul', null);
    // @ts-expect-error number has no keys we accept
    expect(() => n.setItem('x', 1)).toThrow(/plain object.*number/);
    expect(() => arr.getItem(0)).toThrow(/an array/);
    expect(() => nul.removeItem('a' as never)).toThrow(/null/);
  });

  it('methods work when destructured', () => {
    const { setItem, getItem, get, clear } = makeUser();
    setItem('name', 'detached');
    expect(getItem('name')).toBe('detached');
    clear();
    expect(get().name).toBe('');
  });
});

describe('subscribe', () => {
  it('notifies synchronously with (state, prevState)', () => {
    const user = makeUser();
    const calls: unknown[] = [];
    user.subscribe((state, prev) => calls.push([state.name, prev.name]));
    user.setItem('name', 'A');
    expect(calls).toEqual([['A', '']]);
    user.set((s) => ({ ...s, name: 'B' }));
    expect(calls).toEqual([
      ['A', ''],
      ['B', 'A'],
    ]);
  });

  it('notifies for every mutating method', () => {
    const user = makeUser();
    const listener = vi.fn();
    user.subscribe(listener);
    user.set({ name: 'x', age: 1, loggedIn: true });
    user.update((s) => ({ ...s, age: 2 }));
    user.setItem('age', 3);
    user.removeItem('age');
    user.clear();
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('skips notification when nothing changed', () => {
    const user = makeUser();
    const listener = vi.fn();
    user.subscribe(listener);
    user.set(user.get());
    user.update((s) => s);
    user.setItem('name', '');
    user.clear(); // already initial
    expect(listener).not.toHaveBeenCalled();
  });

  it('treats NaN as equal to NaN and +0 / -0 as different (Object.is)', () => {
    const s = createStore('s', { v: NaN });
    const listener = vi.fn();
    s.subscribe(listener);
    s.setItem('v', NaN);
    expect(listener).not.toHaveBeenCalled();
    s.setItem('v', 0);
    s.setItem('v', -0);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes, and unsubscribe is idempotent', () => {
    const user = makeUser();
    const listener = vi.fn();
    const off = user.subscribe(listener);
    user.setItem('age', 1);
    off();
    off();
    user.setItem('age', 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a listener removed during notification is not called in that pass', () => {
    const s = createStore('s', 0);
    const second = vi.fn();
    let offSecond = () => {};
    s.subscribe(() => offSecond());
    offSecond = s.subscribe(second);
    s.set(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('a listener added during notification is not called in that pass', () => {
    const s = createStore('s', 0);
    const late = vi.fn();
    let added = false;
    s.subscribe(() => {
      if (!added) {
        added = true;
        s.subscribe(late);
      }
    });
    s.set(1);
    expect(late).not.toHaveBeenCalled();
    s.set(2);
    expect(late).toHaveBeenCalledWith(2, 1);
  });

  it('re-entrant updates: every listener ends on the latest state', () => {
    const s = createStore('s', 0);
    const seenByA: number[] = [];
    const seenByB: number[] = [];
    s.subscribe((v) => {
      seenByA.push(v);
      if (v === 1) s.set(2); // update from inside a listener
    });
    s.subscribe((v) => seenByB.push(v));
    s.set(1);
    expect(s.get()).toBe(2);
    expect(seenByA).toEqual([1, 2]);
    // B skips the stale intermediate value and only sees the latest.
    expect(seenByB).toEqual([2]);
  });

  it('a throwing listener does not stop others; error is rethrown after commit', () => {
    const s = createStore('s', 0);
    const after = vi.fn();
    s.subscribe(() => {
      throw new Error('boom');
    });
    s.subscribe(after);
    expect(() => s.set(1)).toThrow('boom');
    expect(s.get()).toBe(1);
    expect(after).toHaveBeenCalledWith(1, 0);
  });

  it('routes listener errors to options.onError instead of throwing', () => {
    const onError = vi.fn();
    const s = createStore('s', 0, { onError });
    const after = vi.fn();
    s.subscribe(() => {
      throw new Error('one');
    });
    s.subscribe(() => {
      throw new Error('two');
    });
    s.subscribe(after);
    expect(() => s.set(1)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(after).toHaveBeenCalledOnce();
  });

  it('rejects non-function listeners', () => {
    const s = createStore('s', 0);
    // @ts-expect-error not a function
    expect(() => s.subscribe(42)).toThrow(TypeError);
  });
});

describe('selective subscriptions', () => {
  it('fires only when the selected value changes', () => {
    const user = makeUser();
    const onName = vi.fn();
    user.subscribe((s) => s.name, onName);
    user.setItem('age', 10);
    user.setItem('loggedIn', true);
    expect(onName).not.toHaveBeenCalled();
    user.setItem('name', 'V');
    expect(onName).toHaveBeenCalledWith('V', '');
  });

  it('tracks the previous selected value across changes', () => {
    const user = makeUser();
    const onAge = vi.fn();
    user.subscribe((s) => s.age, onAge);
    user.setItem('age', 1);
    user.setItem('name', 'ignored');
    user.setItem('age', 2);
    expect(onAge.mock.calls).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  it('selects relative to the state at subscribe time', () => {
    const user = makeUser();
    user.setItem('age', 5);
    const onAge = vi.fn();
    user.subscribe((s) => s.age, onAge);
    user.setItem('age', 5);
    expect(onAge).not.toHaveBeenCalled();
  });

  it('uses a custom equality function such as shallow', () => {
    const user = makeUser();
    const withDefault = vi.fn();
    const withShallow = vi.fn();
    const pick = (s: { name: string; age: number }) => ({ name: s.name, age: s.age });
    user.subscribe(pick, withDefault);
    user.subscribe(pick, withShallow, shallow);
    user.setItem('loggedIn', true);
    expect(withDefault).toHaveBeenCalledTimes(1); // new object every time
    expect(withShallow).not.toHaveBeenCalled();
    user.setItem('age', 1);
    expect(withShallow).toHaveBeenCalledTimes(1);
  });

  it('can be unsubscribed', () => {
    const user = makeUser();
    const onName = vi.fn();
    const off = user.subscribe((s) => s.name, onName);
    off();
    user.setItem('name', 'x');
    expect(onName).not.toHaveBeenCalled();
  });

  it('rejects a non-function selector', () => {
    const user = makeUser();
    // @ts-expect-error bad selector
    expect(() => user.subscribe('name', () => {})).toThrow(TypeError);
  });
});

describe('ready()', () => {
  it('resolves immediately for in-memory stores', async () => {
    const user = makeUser();
    await expect(user.ready()).resolves.toBeUndefined();
  });
});

describe('store isolation', () => {
  it('updating one store never touches another, even with the same name', () => {
    const a = createStore('same', { v: 0 });
    const b = createStore('same', { v: 0 });
    const onB = vi.fn();
    b.subscribe(onB);
    a.setItem('v', 1);
    a.clear();
    a.setItem('v', 2);
    expect(b.get()).toEqual({ v: 0 });
    expect(onB).not.toHaveBeenCalled();
  });
});

describe('concurrent-style updates', () => {
  it('applies many interleaved synchronous updates without losing any', () => {
    const counter = createStore('counter', { a: 0, b: 0 });
    for (let i = 0; i < 1000; i++) {
      counter.setItem('a', (x) => x + 1);
      counter.update((s) => ({ ...s, b: s.b + 2 }));
    }
    expect(counter.get()).toEqual({ a: 1000, b: 2000 });
  });

  it('updates queued from async tasks all land', async () => {
    const counter = createStore('counter', 0);
    await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        await new Promise((r) => setTimeout(r, i % 5));
        counter.set((c) => c + 1);
      }),
    );
    expect(counter.get()).toBe(100);
  });
});

describe('shallow()', () => {
  it('compares objects and arrays one level deep', () => {
    expect(shallow({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    expect(shallow({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallow({ a: 1 }, { a: 1, b: 1 })).toBe(false);
    expect(shallow({ a: 1, b: undefined }, { a: 1, c: undefined } as never)).toBe(false);
    expect(shallow([1, 2], [1, 2])).toBe(true);
    expect(shallow([1, 2], [1, 3])).toBe(false);
    expect(shallow([1], { 0: 1 } as never)).toBe(false);
    expect(shallow({ a: {} }, { a: {} })).toBe(false); // one level only
    expect(shallow(NaN, NaN)).toBe(true);
    expect(shallow(null, null)).toBe(true);
    expect(shallow(null as unknown, {})).toBe(false);
    expect(shallow(new Date(0), {} as never)).toBe(false);
  });
});
