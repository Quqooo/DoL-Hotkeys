// 原版绑定冲突检测的单元测试
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'test-output', 'vanilla.mjs');

await mkdir(path.dirname(out), { recursive: true });
await build({
  entryPoints: [path.join(root, 'src', 'vanilla.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: out,
  logLevel: 'error',
});

globalThis.window = {
  __DoLHKEarly: {
    bindings: [{ keys: 'z n', combos: ['z', 'n'], src: '' }],
    native: [],
    mousetrapSeen: true,
  },
};

const v = await import(`file://${out}`);

let failed = 0;
function check(name, ok) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

const reserved = v.reservedBinds();
const keys = reserved.map(item => item.key);
check('static numpad back listed', keys.includes('NumpadDivide'));
check('static continue listed', keys.includes('KeyN'));
check('mod manager listed', keys.includes('@Alt|KeyM'));
check('dynamic mousetrap entries merged', keys.includes('KeyZ'));
check('duplicates merged', new Set(keys).size === keys.length);
check('clash found for vanilla continue', Boolean(v.clashOf(['KeyN'])));
check('clash found for observed mousetrap key', Boolean(v.clashOf(['KeyZ'])));
check('no clash for free key', !v.clashOf(['KeyQ']));
check('modifier family still matches', Boolean(v.clashOf(['AltRight', 'KeyM'])));
check('localized label', v.labelOfReserved(reserved.find(item => item.key === 'KeyN'), 'zh').includes('继续'));
check('english label', v.labelOfReserved(reserved.find(item => item.key === 'KeyN'), 'en').includes('continue'));

console.log(failed === 0 ? '\nvanilla: all checks passed' : `\nvanilla: ${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
