// Packs the library, installs the tarball into a throwaway project, and
// exercises it through ESM, CommonJS and TypeScript exactly as an npm user would.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });

// Spawning `npm` directly fails on Windows (it is npm.cmd), so run npm's JS entry with node.
const npmCli = process.env.npm_execpath?.endsWith('.js')
  ? process.env.npm_execpath
  : join(dirname(process.execPath), process.platform === 'win32' ? 'node_modules' : '../lib/node_modules', 'npm/bin/npm-cli.js');
const npm = (args, cwd) => run(process.execPath, [npmCli, ...args], cwd);

const tarball = npm(['pack', '--silent', '--pack-destination', tmpdir()], root).trim().split('\n').pop();
const tarPath = join(tmpdir(), tarball);
const dir = mkdtempSync(join(tmpdir(), 'uni-state-storage-smoke-'));

try {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  npm(['install', '--silent', '--no-audit', '--no-fund', tarPath, `typescript@${readTsVersion()}`], dir);

  writeFileSync(
    join(dir, 'esm.mjs'),
    `import { createStore, shallow } from 'uni-state-storage';
const user = createStore('user', { name: '', age: 0, loggedIn: false });
const seen = [];
user.subscribe((s) => s.name, (n) => seen.push(n));
user.setItem('name', 'Vasanth');
user.update((s) => ({ ...s, age: s.age + 25 }));
user.removeItem('loggedIn');
await user.ready();
if (JSON.stringify(user.get()) !== '{"name":"Vasanth","age":25}') throw new Error('esm: bad state ' + JSON.stringify(user.get()));
if (seen.join() !== 'Vasanth') throw new Error('esm: selector');
user.clear();
if (user.getItem('name') !== '' || !shallow({ a: 1 }, { a: 1 })) throw new Error('esm: clear/shallow');
console.log('esm ok');`,
  );

  writeFileSync(
    join(dir, 'cjs.cjs'),
    `const { createStore } = require('uni-state-storage');
const c = createStore('counter', { count: 0 });
c.update((s) => ({ ...s, count: s.count + 1 }));
if (c.get().count !== 1) throw new Error('cjs');
console.log('cjs ok');`,
  );

  writeFileSync(
    join(dir, 'app.ts'),
    `import { createStore, type Store } from 'uni-state-storage';
const user: Store<{ name: string; age: number }> = createStore('user', { name: '', age: 0 });
const age: number = user.getItem('age');
user.setItem('name', (n) => n.toUpperCase());
// @ts-expect-error wrong type must be rejected
user.setItem('age', 'x');
export { age };`,
  );
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, module: 'NodeNext', moduleResolution: 'NodeNext', noEmit: true, skipLibCheck: false }, files: ['app.ts'] }),
  );

  process.stdout.write(run('node', ['esm.mjs'], dir));
  process.stdout.write(run('node', ['cjs.cjs'], dir));
  run('node', [join(dir, 'node_modules/typescript/bin/tsc'), '-p', '.'], dir);
  console.log('types ok');

  // Size of what a bundler ships for `import { createStore }` (minified + gzip).
  const out = await build({
    stdin: { contents: "import { createStore } from 'uni-state-storage'; globalThis.s = createStore;", resolveDir: dir },
    bundle: true, minify: true, write: false, format: 'esm', platform: 'neutral',
  });
  const bytes = out.outputFiles[0].contents;
  console.log(`size: createStore → ${bytes.length} B min, ${gzipSync(bytes).length} B min+gzip`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(tarPath, { force: true });
}

function readTsVersion() {
  return JSON.parse(readFileSync(join(root, 'node_modules/typescript/package.json'), 'utf8')).version;
}
