// esbuild turns `require('x')` into an `__require('x')` shim in the ESM build.
// Metro (React Native) only detects plain `require('literal')` calls, so we put
// the plain call back. That lets Metro treat AsyncStorage as an optional
// dependency: bundled if the app installed it, skipped (inside try/catch) if not.
import { readFileSync, writeFileSync } from 'node:fs';

const MODULE = '@react-native-async-storage/async-storage';

for (const file of ['dist/index.js', 'dist/index.cjs']) {
  let code = readFileSync(file, 'utf8');
  code = code.replace(`__require("${MODULE}")`, `require("${MODULE}")`);
  // drop the now-unused shim (a multi-line `var __require = ...;` block)
  code = code.replace(/var __require = [\s\S]*?\n\}\);\n/, '');
  if (!code.includes(`require("${MODULE}")`) || code.includes('__require')) {
    throw new Error(`post-build: unexpected output in ${file}`);
  }
  writeFileSync(file, code);
}
console.log('post-build: restored plain require() for Metro');
