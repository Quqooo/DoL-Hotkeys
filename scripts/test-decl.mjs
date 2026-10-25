// addon 声明层的合并与诊断单元测试
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { load, reporter, root } from './lib/unit.mjs';

const dir = path.join(root, 'test-output');
const entry = path.join(dir, 'decl-entry.ts');
await mkdir(dir, { recursive: true });
// 声明层与注册表要一起载入：声明只在注册时被消费
await writeFile(entry, "export * from '../src/data/decl';\nexport * from '../src/data/registry';\n");

globalThis.window = globalThis;
const d = await load(entry, 'decl');
const { check, finish } = reporter();

const warnings = [];
const realWarn = console.warn;
console.warn = message => warnings.push(String(message));

function decl(binds, extra) {
  return { modName: 'My Mod', declaredVersion: '1.0.0', params: { binds, ...extra } };
}
function setup(records) {
  d.resetDeclarations();
  warnings.length = 0;
  window.DoLHK_DECL = records;
}

setup([]);
check('empty queue yields no declaration', d.declarationCount() === 0);

setup([
  decl({
    'my.act': {
      label: { zh: '我的动作', en: 'My action' },
      tip: { zh: '会打开我的面板', en: 'Opens my panel' },
      defaultBind: ['ControlLeft', 'KeyG'],
      group: { id: 'my.mod', label: { zh: '我的模组', en: 'My mod' } },
      priority: 5,
      inInput: true,
    },
  }),
]);
check('declaration counted', d.declarationCount() === 1);
const filled = d.withDeclaration({ id: 'my.act', handler: () => {} });
check('label filled', filled.label.zh === '我的动作');
check('tip filled', filled.tip.en === 'Opens my panel');
check('defaultBind filled', JSON.stringify(filled.defaultBind) === '["ControlLeft","KeyG"]');
check('group filled', filled.group.id === 'my.mod' && filled.group.label.en === 'My mod');
check('priority filled', filled.priority === 5);
check('inInput filled', filled.inInput === true);

const kept = d.withDeclaration({ id: 'my.act', label: '运行时', tip: '运行时说明', priority: 9, inInput: false, handler: () => {} });
check('runtime label wins', kept.label === '运行时');
check('runtime tip wins', kept.tip === '运行时说明');
check('runtime priority wins', kept.priority === 9);
check('runtime inInput wins', kept.inInput === false);

setup([decl({ 'my.act': { label: 'first' } }), decl({ 'my.act': { label: 'second' }, defaultBind: ['KeyB'] })]);
check('duplicate keeps first', d.withDeclaration({ id: 'my.act', handler: () => {} }).label === 'first');
check('duplicate diagnosed once', warnings.filter(w => w.includes('already declared')).length === 1);

setup([decl({ 'my.act': { label: 'x', name: 'unsupported', note: 'nope' } })]);
check('unsupported fields ignored', d.withDeclaration({ id: 'my.act', handler: () => {} }).label === 'x');
check('unsupported fields diagnosed', warnings.some(w => w.includes('unsupported fields') && w.includes('name')));

setup([decl({ 'my.act': { label: 'x' }, 'my.two': { label: 'y' } }, { group: '共享组' })]);
check('shared group applied', d.withDeclaration({ id: 'my.act', handler: () => {} }).group === '共享组');

setup([decl({ 'my.act': { label: 'x', group: '自身组' } }, { group: '共享组' })]);
check('entry group overrides shared group', d.withDeclaration({ id: 'my.act', handler: () => {} }).group === '自身组');

setup([decl({ 'my.act': { label: 'x', group: { id: 'joined.group' } } })]);
const joined = d.withDeclaration({ id: 'my.act', handler: () => {} }).group;
check('group object without a label is kept as an id only', joined.id === 'joined.group' && joined.label === undefined);

setup([decl({ 'my.act': { label: 'x', priority: '9', inInput: 'yes' } })]);
const coerced = d.withDeclaration({ id: 'my.act', handler: () => {} });
check('non-numeric priority ignored', coerced.priority === undefined);
check('non-boolean inInput ignored', coerced.inInput === undefined);

setup([decl({ 'my.act': { label: 'x' } })]);
d.declarationCount();
window.DoLHK_DECL.push(decl({ 'my.late': { label: 'late' } }));
check('late declaration picked up', d.declarationCount() === 2);

setup([{ modName: 'Broken' }, decl({ 'my.act': { label: 'x' } })]);
check('record without params skipped', d.declarationCount() === 1);
check('record without params diagnosed', warnings.some(w => w.includes('has no params')));

setup([decl({ 'my.act': { label: 'x', defaultBind: ['KeyN'] } })]);
const clashes = [];
d.checkDeclarations(bind => {
  clashes.push(bind.join('+'));
  return bind.join('+') === 'KeyN' ? '原版「继续」' : undefined;
});
check('precheck inspects declared bind', clashes.includes('KeyN'));
check('precheck reports clash', warnings.some(w => w.includes('clashes with')));

setup([decl({ 'my.act': { label: 'x', defaultBind: ['ControlLeft', 'KeyZ'] } })]);
check('register uses declared bind', d.register({ id: 'my.act', handler: () => {} }) === true);
check('registered bind comes from declaration', JSON.stringify(d.get('my.act').defaultBind) === '["ControlLeft","KeyZ"]');
check('register without declaration still rejected', d.register({ id: 'other.act', handler: () => {} }) === false);

setup([decl({ 'my.act': { label: 'x' } })]);
window.DoLHK_DECL[0].declaredVersion = '^1.4.0';
d.declarationCount();
check('matching major version is silent', !warnings.some(w => w.includes('targets version')));

setup([decl({ 'my.act': { label: 'x' } })]);
window.DoLHK_DECL[0].declaredVersion = '2.0.0';
d.declarationCount();
check('mismatched major version warns', warnings.some(w => w.includes('targets version "2.0.0"')));

setup([decl({ 'my.act': { label: 'x' } })]);
window.DoLHK_DECL[0].declaredVersion = 'latest';
d.declarationCount();
check('unparsable modVersion warns', warnings.some(w => w.includes('unparsable modVersion')));

setup([decl({ 'my.act': { label: 'x' } })]);
window.DoLHK_DECL[0].declaredVersion = 1;
d.declarationCount();
check('non-string modVersion warns', warnings.some(w => w.includes('non-string modVersion')));

console.warn = realWarn;
finish('decl');
