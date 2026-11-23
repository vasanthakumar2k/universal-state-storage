import { expectTypeOf, test } from 'vitest';
import { createStore, shallow, type Store } from '../src/index';

test('infers state type from initial state', () => {
  const user = createStore('user', { name: '', age: 0, loggedIn: false });
  expectTypeOf(user).toEqualTypeOf<Store<{ name: string; age: number; loggedIn: boolean }>>();
  expectTypeOf(user.get().name).toBeString();
  expectTypeOf(user.getItem('age')).toBeNumber();
  expectTypeOf(user.getItem('loggedIn')).toBeBoolean();
});

test('rejects unknown keys and wrong value types', () => {
  const user = createStore('user', { name: '', age: 0 });
  // @ts-expect-error unknown key
  user.setItem('nope', 1);
  // @ts-expect-error wrong value type
  user.setItem('age', 'old');
  // @ts-expect-error missing property in full replace
  user.set({ name: 'x' });
  user.setItem('age', (a) => {
    expectTypeOf(a).toBeNumber();
    return a + 1;
  });
});

test('selective subscriptions infer the selected type', () => {
  const user = createStore('user', { name: '', age: 0 });
  user.subscribe(
    (s) => s.age,
    (next, prev) => {
      expectTypeOf(next).toBeNumber();
      expectTypeOf(prev).toBeNumber();
    },
  );
  user.subscribe(
    (s) => ({ n: s.name }),
    (next) => expectTypeOf(next).toEqualTypeOf<{ n: string }>(),
    shallow,
  );
});

test('explicit generic for optional fields', () => {
  const s = createStore<{ token?: string }>('auth', {});
  expectTypeOf(s.getItem('token')).toEqualTypeOf<string | undefined>();
  s.removeItem('token');
});

test('ready returns a promise', () => {
  expectTypeOf(createStore('x', 0).ready()).toEqualTypeOf<Promise<void>>();
});
