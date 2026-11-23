// userStore.js: create the store ONCE here, then import it anywhere.
import { createStore } from 'uni-state-storage';

export const userStore = createStore('user', {
  name: '',
  age: 0,
  loggedIn: false,
});

export const cartStore = createStore('cart', {
  items: [],
  total: 0,
});
