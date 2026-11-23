// app.js: uses the stores from userStore.js and checks every API method.
//
// Run from the project root:
//   npm install
//   npm run demo
import { shallow } from 'uni-state-storage';
import { userStore, cartStore } from './userStore.js';

let passed = 0;
let failed = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) console.log('   expected:', expected, '\n   received:', actual);
}

console.log('\n── uni-state-storage demo ──\n');

// 1. Read the initial state
check('get() returns the initial state', userStore.get(), { name: '', age: 0, loggedIn: false });

// 2. Subscribe to every change
const changes = [];
const unsubscribe = userStore.subscribe((state, prev) => changes.push({ from: prev.name, to: state.name }));

// 3. Subscribe to just one property (fires only when `name` changes)
const nameChanges = [];
userStore.subscribe((s) => s.name, (name) => nameChanges.push(name));

// 4. Update one property
userStore.setItem('name', 'Vasanth');
check("setItem('name', 'Vasanth')", userStore.getItem('name'), 'Vasanth');

// 5. Functional update of one property
userStore.setItem('age', (age) => age + 25);
check("setItem('age', age => age + 25)", userStore.getItem('age'), 25);

// 6. Update based on the previous state
userStore.update((s) => ({ ...s, loggedIn: true }));
check('update(s => ({ ...s, loggedIn: true }))', userStore.get(), { name: 'Vasanth', age: 25, loggedIn: true });

// 7. Replace the whole state
userStore.set({ name: 'Kumar', age: 30, loggedIn: true });
check('set({...}) replaces the whole state', userStore.get(), { name: 'Kumar', age: 30, loggedIn: true });

// 8. Remove one property
userStore.removeItem('age');
check("removeItem('age')", userStore.get(), { name: 'Kumar', loggedIn: true });

// 9. Clear: back to the initial state
userStore.clear();
check('clear() restores the initial state', userStore.get(), { name: '', age: 0, loggedIn: false });

// 10. Subscribers saw every change, the selector only name changes
check('subscribe() saw 6 changes', changes.length, 6);
check('selector subscription saw only name changes', nameChanges, ['Vasanth', 'Kumar', '']);

// 11. Unsubscribe stops notifications
unsubscribe();
userStore.setItem('name', 'after-unsubscribe');
check('unsubscribe() stops notifications', changes.length, 6);

// 12. Stores are independent of each other
cartStore.update((c) => ({ items: [...c.items, 'Phone'], total: c.total + 15000 }));
check('cartStore updated', cartStore.get(), { items: ['Phone'], total: 15000 });
check('userStore untouched by cartStore', userStore.getItem('name'), 'after-unsubscribe');

// 13. shallow() helper
check('shallow() compares one level deep', shallow({ a: 1 }, { a: 1 }), true);

// 14. ready(): in-memory stores are ready immediately
await userStore.ready();
check('ready() resolves', true, true);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
