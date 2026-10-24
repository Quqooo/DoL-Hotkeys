// 键位编码与旧配置迁移的单元测试（M0 契约）
// 运行：npm test
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'test-output', 'keys.mjs');

await mkdir(path.dirname(out), { recursive: true });
await build({
  entryPoints: [path.join(root, 'src', 'keys.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: out,
  logLevel: 'error',
});

const k = await import(`file://${out}`);

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n  got ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`}`);
}
function ok(name, value) {
  const passed = value === true;
  if (!passed) failed++;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
}

// 旧 step 编码 → 结构化 Bind
eq('legacy Ctrl+KeyZ', k.legacyStepToBind('Ctrl+KeyZ'), ['ControlLeft', 'KeyZ']);
eq('legacy Alt+KeyC', k.legacyStepToBind('Alt+KeyC'), ['AltLeft', 'KeyC']);
eq('legacy modifier order', k.legacyStepToBind('Shift+Ctrl+KeyA'), ['ControlLeft', 'ShiftLeft', 'KeyA']);
eq('legacy combo', k.legacyStepToBind('Ctrl+KeyA,KeyB'), ['ControlLeft', 'KeyA', 'KeyB']);
eq('legacy mouse', k.legacyStepToBind('Mouse3'), ['Mouse3']);
eq('legacy invalid empty', k.legacyStepToBind(''), null);
eq('legacy invalid tail', k.legacyStepToBind('Ctrl+'), null);
eq('legacy invalid key', k.legacyStepToBind('Ctrl+Nope'), null);

// 多段序列在 v3 里不存在，按按下顺序拍平并去重
eq('legacy sequence flatten', k.bindFromLegacySteps(['Alt+KeyK', 'Alt+KeyJ']), ['AltLeft', 'KeyK', 'KeyJ']);
eq('legacy single step array', k.bindFromLegacySteps(['Ctrl+KeyZ']), ['ControlLeft', 'KeyZ']);

// Mousetrap 有损适配：只接受单个 chord
eq('mousetrap alt+o', k.parseMousetrap('alt+o'), ['AltLeft', 'KeyO']);
eq('mousetrap ctrl+shift+k', k.parseMousetrap('ctrl+shift+k'), ['ControlLeft', 'ShiftLeft', 'KeyK']);
eq('mousetrap esc', k.parseMousetrap('esc'), ['Escape']);
eq('mousetrap comma sequence rejected', k.parseMousetrap('alt+o,alt+p'), null);
eq('mousetrap unknown rejected', k.parseMousetrap('alt+?'), null);

// 结构化校验
eq('normalize ok', k.normalizeBind(['ControlLeft', 'KeyA']), ['ControlLeft', 'KeyA']);
eq('normalize duplicate rejected', k.normalizeBind(['KeyA', 'KeyA']), null);
eq('normalize unknown atom rejected', k.normalizeBind(['Nope']), null);
eq('normalize bare modifier rejected', k.normalizeBind(['Control']), null);
eq('normalize empty rejected', k.normalizeBind([]), null);
eq('normalize too long rejected', k.normalizeBind(new Array(9).fill('KeyA').map((v, i) => `${v}${i}`)), null);
eq('normalize mouse ok', k.normalizeBind(['ControlLeft', 'Mouse3']), ['ControlLeft', 'Mouse3']);

// 匹配语义
ok('modifier family equal', k.sameBind(['ControlLeft', 'KeyA'], ['ControlRight', 'KeyA']));
ok('order matters', !k.sameBind(['ControlLeft', 'KeyA'], ['KeyA', 'ControlLeft']));
ok('length matters', !k.sameBind(['ControlLeft'], ['ControlLeft', 'KeyA']));
ok('mouse vs key distinct', !k.sameBind(['Mouse1'], ['Mouse3']));

// 展示顺序即语义
eq('label keeps order', k.bindLabel(['KeyX', 'ControlLeft', 'AltLeft', 'KeyA', 'KeyB']), 'X + Ctrl + Alt + A + B');

console.log(failed === 0 ? '\nkeys: all checks passed' : `\nkeys: ${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
