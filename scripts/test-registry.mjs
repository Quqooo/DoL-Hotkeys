// 注册表校验与本地化解析的单元测试
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'test-output', 'registry.mjs');

await mkdir(path.dirname(out), { recursive: true });
await build({
  entryPoints: [path.join(root, 'src', 'registry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: out,
  logLevel: 'error',
});

const r = await import(`file://${out}`);

let failed = 0;
function check(name, ok) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
const def = extra => ({ id: 'mymod.act', defaultBind: ['ControlLeft', 'KeyA'], handler: () => {}, ...extra });

check('valid id', r.isValidId('mymod.act'));
check('valid id with dash', r.isValidId('my-mod.act_1'));
check('id without dot rejected', !r.isValidId('act'));
check('id with empty segment rejected', !r.isValidId('a..b') && !r.isValidId('.a') && !r.isValidId('a.'));

check('register structured bind', r.register(def()) === true);
check('duplicate rejected', r.register(def()) === false);
check('get returns entry', r.get('mymod.act')?.defaultBind.length === 2);
check('unregister', r.unregister('mymod.act') === true);
check('unregister missing returns false', r.unregister('mymod.act') === false);

check('register mousetrap string', r.register(def({ id: 'mousetrap.one', defaultBind: 'alt+q' })) === true);
check('mousetrap normalized', JSON.stringify(r.get('mousetrap.one')?.defaultBind) === '["AltLeft","KeyQ"]');
check('comma sequence rejected', r.register(def({ id: 'mousetrap.two', defaultBind: 'alt+q,alt+w' })) === false);
check('unknown atom rejected', r.register(def({ id: 'bad.atom', defaultBind: ['Nope'] })) === false);
check('missing bind rejected', r.register(def({ id: 'no.bind', defaultBind: undefined })) === false);
check('missing handler rejected', r.register({ id: 'no.handler', defaultBind: ['KeyA'] }) === false);
check('empty id rejected', r.register(def({ id: '' })) === false);

check('default label is id', r.labelOf(r.get('mousetrap.one'), 'zh') === 'mousetrap.one');
check('string label', r.resolveLabel('存档', 'x.y', 'zh') === '存档');
check('object label prefers current language', r.resolveLabel({ zh: '存档', en: 'Save' }, 'x.y', 'en') === 'Save');
check('object label falls back', r.resolveLabel({ en: 'Save' }, 'x.y', 'zh') === 'Save');
check('function label', r.resolveLabel(lang => (lang === 'zh' ? '存档' : 'Save'), 'x.y', 'zh') === '存档');
check('throwing label falls back to id', r.resolveLabel(() => { throw new Error('boom'); }, 'x.y', 'zh') === 'x.y');
check('empty label falls back to id', r.resolveLabel({ zh: '   ' }, 'x.y', 'zh') === 'x.y');

check('group absent is null', r.groupOf(r.get('mousetrap.one'), 'zh') === null);
r.register(def({ id: 'group.one', group: { zh: '我的模组', en: 'My Mod' } }));
check('group resolved', r.groupOf(r.get('group.one'), 'zh') === '我的模组');

console.log(failed === 0 ? '\nregistry: all checks passed' : `\nregistry: ${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
