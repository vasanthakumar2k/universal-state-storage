import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as lib from '../src/index';

// Every ```js block in the README must run against the real package API.
// Blocks that start with a `// file.js` comment act as files: their
// `export const` values can be imported by later blocks via './file.js'.
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const blocks = [...readme.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]!);

const files: Record<string, Record<string, unknown>> = {};

function toRunnable(code: string): string {
  const fileName = code.match(/^\/\/ ([\w.-]+\.js)\s*$/m)?.[1];
  const exported = [...code.matchAll(/^export const (\w+)/gm)].map((m) => m[1]!);
  let body = code
    .replace(/^import\s*\{([^}]*)\}\s*from\s*'uni-state-storage';?$/gm, (_, n: string) => `const {${n}} = __lib;`)
    .replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.-]+)';?$/gm, (_, n: string, f: string) => {
      if (!files[f]) throw new Error(`README imports ./${f} before defining it`);
      return `const {${n}} = __files[${JSON.stringify(f)}];`;
    })
    .replace(/^export const /gm, 'const ');
  if (fileName && exported.length) body += `\n__files[${JSON.stringify(fileName)}] = { ${exported.join(', ')} };`;
  return body;
}

describe('README examples', () => {
  it('has examples to check', () => expect(blocks.length).toBeGreaterThan(0));

  blocks.forEach((code, i) => {
    it(`block ${i + 1} runs`, async () => {
      const body = toRunnable(code);
      expect(body).not.toMatch(/^\s*(import|export) /m);
      const run = new Function('__lib', '__files', 'console', `return (async () => {\n${body}\n})();`);
      await run(lib, files, { log() {} });
    });
  });

  it('the app.js block leaves the store in the documented state', () => {
    const { userStore } = files['userStore.js'] as { userStore: lib.Store<unknown> };
    expect(userStore.get()).toEqual({ name: '', age: 0, loggedIn: false });
  });
});
