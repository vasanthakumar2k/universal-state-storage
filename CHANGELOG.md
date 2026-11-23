# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Package renamed from `swiftstate` to `uni-state-storage`.

### Added
- `createStore.persist(name, initialState, options?)`: stores saved to `localStorage`
  (web), AsyncStorage (React Native) or MMKV and restored on the next start.
  Options: `storage`, `key`, `partialize`, `version`, `migrate`, `onError`.
  Synchronous hydration for sync storage, coalesced writes, `clear()` deletes the saved entry.
- `setDefaultStorage()` and `mmkvAdapter()`; `StorageAdapter` and `PersistOptions` types.
- `examples/vanilla-js` demo (`userStore.js` + `app.js`), run with `npm run demo`.
- README diagrams in `docs/images/`.
- Core engine (Phase 2): `createStore(name, initialState, options?)` with
  `get`, `set`, `update`, `getItem`, `setItem`, `removeItem`, `clear`,
  `getInitialState`, `subscribe` (full and selective), and `ready`.
- `shallow` equality helper for selective subscriptions.
- `options.onError` for subscriber errors.
- ESM + CommonJS builds with type declarations.
