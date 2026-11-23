export { createStore } from './core/createStore';
export { shallow } from './core/selector';
export { mmkvAdapter, setDefaultStorage } from './core/persist';
export type { MMKVLike } from './core/persist';
export type {
  EqualityFn,
  Listener,
  PersistOptions,
  StorageAdapter,
  Selector,
  SelectorListener,
  Store,
  StoreOptions,
  Unsubscribe,
  Updater,
} from './core/types';
