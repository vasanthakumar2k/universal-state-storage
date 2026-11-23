# uni-state-storage: audit, implementation plan, and design decisions

## Phase 1: Repository audit (2026-11-23)

| Item | Finding |
| --- | --- |
| Existing source | None. The workspace was empty and no GitHub repository was connected, so there was no existing code to reuse or migrate. This is a greenfield build. |
| `package.json` / deps | None existed. Created from scratch with **zero runtime dependencies**. |
| npm name | Renamed from `swiftstate` to **`uni-state-storage`** on 2026-11-23. The name was free on npm then, and so was `unistatestorage`, so npm's similar-name check won't block it. Re-check before publishing. |
| Architectural risks identified up front | (1) Calling `store.use()` without importing React into core. (2) Keeping core free of `window`/`localStorage`/RN globals. (3) Persistence must never block memory updates. (4) Shared bundles so `uni-state-storage/react` and `uni-state-storage` see the same store instances. |

> If an existing uni-state-storage codebase lives elsewhere, attach it or connect GitHub. It should be audited against this plan before Phase 3.

## Tooling

- TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- `src/` compiles with `lib: ES2020` and **no ambient types**, so any accidental use of a browser or Node global in the core is a type error.
- tsup → ESM (`dist/index.js`) + CJS (`dist/index.cjs`) + `.d.ts`/`.d.cts`.
- Vitest for runtime tests and type tests (`*.test-d.ts`).
- `scripts/smoke.mjs` packs the tarball, installs it into a throwaway project, and runs it through ESM, CJS and strict TS. It also reports bundled size.
- CI: typecheck, test, build and smoke on Node 22/24; tarball smoke on Node 18/20.
- Dev tooling needs Node ≥ 22. The published package supports Node ≥ 18 and any ES2020 runtime.

## Phase status

| Phase | Status | Gate |
| --- | --- | --- |
| 1. Audit + scaffold | ✅ Done | — |
| 2. Core engine | ✅ Done | 54 tests (core + README snippets) and type tests pass; 100% line coverage of `src/core` |
| 3. Persistence | ⏳ Next | |
| 4. React + RN adapters | Planned | |
| 5. Optimization + benchmarks | Planned | |
| 6. Documentation | Planned (interim README only) | |
| 7. Release prep | Planned | |

## Core semantics (Phase 2, implemented)

- **Synchronous.** Every mutation commits immediately; `get()` reflects it on the next line; subscribers run synchronously before the mutating call returns.
- **Immutable snapshots.** Every change produces a new top-level object; previous snapshots are never mutated. Users must not mutate what `get()` returns.
- **No-op detection.** A change whose result is `Object.is`-equal to the current state (or, for `setItem`, an `Object.is`-equal value on an existing key) does nothing and notifies no one.
- **`set` replaces; it does not merge.** This follows the spec ("update complete state"). Use `setItem` for one key, or `update(s => ({ ...s, ...patch }))` to merge.
- **`clear()` restores the initial state.** The other option, an empty `{}`, would break typed consumers (`state.name.length` would crash) and wouldn't match what an app sees after restart once persistence lands, because clearing storage means the next launch starts from the initial state. In Phase 3, `clear()` also deletes the persisted entry.
- **`removeItem(key)` deletes the key** from the state object (AsyncStorage semantics). *Type caveat:* `get()` is still typed as `T`; removing a required key leaves it `undefined` at runtime. Declare such keys optional (`createStore<{ token?: string }>(...)`) for accurate types.
- **Functional updates.** `set` and `setItem` accept `prev => next`. To store a function *as a value*, wrap it: `setItem('cb', () => myFn)`.
- **State is never `undefined`.** `createStore` rejects an undefined initial state; `set`/`update` reject an `undefined` result. This catches the common "updater forgot to return" bug.
- **Item methods need object state.** `getItem`/`setItem`/`removeItem` throw a descriptive `TypeError` if the state is a primitive, `null`, or an array.
- **Subscriber errors.** One throwing subscriber doesn't stop the others. Without `onError`, the first error is re-thrown from the mutating call *after* the state is committed and every subscriber has run. With `onError`, errors go there and nothing is thrown.
- **Re-entrancy.** If a subscriber triggers another update, the inner notification runs at once and the outer pass stops. Every subscriber ends on the latest state and none receives a stale one afterwards.
- **Subscribe/unsubscribe during notification.** Copy-on-write listener list: listeners added mid-pass start from the next change; listeners removed mid-pass are not called again.
- **Store isolation.** Each store shallow-copies its initial object, so two stores built from the same object, or with the same name, are fully independent.
- **Detachable methods.** All methods are closures, so `const { setItem } = user` works.
- **`ready()`** resolves immediately for in-memory stores. Phase 3 makes it resolve after hydration.

## Plan for remaining phases

### Phase 3: Persistence
- `StorageAdapter` interface: `getItem(key)`, `setItem(key, value)`, `removeItem(key)`, each returning a value or a `Promise`, so sync (localStorage, MMKV) and async (AsyncStorage, IndexedDB) adapters share one contract.
- `createStore(name, init, { persist: true | { storage, key?, version?, migrate?, serialize?, deserialize?, throttleMs?, partialize? } })`.
- `persist: true` resolves a default adapter lazily and safely: `globalThis.localStorage` if usable, else the memory adapter with a one-time dev warning. The core never imports it.
- Writes are coalesced: many synchronous updates in one tick → one serialize + one write (microtask/`throttleMs`). Writes never block `set`.
- Hydration: async read → merge onto the initial state → commit → resolve `ready()`. Updates made *before* hydration finishes win over stored values for the keys they touched (tracked per key).
- Storage failures (quota, JSON parse, adapter rejection) are routed to `onError` and never corrupt in-memory state.
- Versioned envelope `{ v, state }` with `migrate`.
- `clear()` deletes the persisted key.
- Adapters: `uni-state-storage/adapters/memory`, `uni-state-storage/adapters/local-storage`, plus a custom adapter interface.

### Phase 4: React and React Native
- `uni-state-storage/react` exports `useStore(store, selector?, equalityFn?)` built on `useSyncExternalStore`, with `getServerSnapshot` = initial state for SSR and hydration safety.
- `store.use(selector?, equalityFn?)`. **Open decision:** the core can't import React, so `use()` will delegate to a binding that `uni-state-storage/react` registers on import (`import 'uni-state-storage/react'` once at the app entry). Calling `use()` without it throws a clear error. Alternatives are documented in the Phase 4 PR.
- Shared registry via `Symbol.for(...)` on `globalThis` so the core and the React entry agree even when bundled as separate chunks.
- Adapters: `uni-state-storage/adapters/async-storage` (peer: `@react-native-async-storage/async-storage`), `uni-state-storage/adapters/mmkv` (peer: `react-native-mmkv`), `uni-state-storage/adapters/indexeddb`. All are optional peers.

### Phase 5: Benchmarks and optimization
- `benchmarks/` with tinybench comparing uni-state-storage, Redux Toolkit and Zustand on identical workloads: single-key updates, full replaces, N subscribers, selective subscribers, React render counts. Results are committed with machine and version details, and no claims go in the README beyond what the run shows.
- Size budget enforced in CI (`createStore` currently ≈ 1.1 KB min+gzip).

### Phase 6: Documentation
- Full README (all 19 sections). Every snippet is extracted and executed by a test.
- `examples/`: vanilla, React (Vite), React Native, Next.js, TypeScript.

### Phase 7: Release
- `publint` and `@arethetypeswrong/cli` on the tarball, a clean external sample project, `npm publish --provenance`.
