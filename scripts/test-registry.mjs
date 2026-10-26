// 注册表校验与本地化解析的单元测试
import { load, reporter } from './lib/unit.mjs';

globalThis.window = globalThis;
const r = await load('data/registry.ts', 'registry');
const { check, finish } = reporter();

const def = extra => ({ id: 'mymod.act', defaultBind: ['ControlLeft', 'KeyA'], handler: () => {}, ...extra });

check('valid ids accepted', ['mymod.act', 'my-mod.act_1'].every(id => r.isValidId(id)));
check('invalid id shapes rejected', ['act', 'a..b', '.a', 'a.'].every(id => !r.isValidId(id)));

check('register structured bind', r.register(def()) === true);
check('duplicate rejected', r.register(def()) === false);
check('get returns entry', r.get('mymod.act')?.defaultBind.length === 2);
check('unregister', r.unregister('mymod.act') === true);
check('unregister missing returns false', r.unregister('mymod.act') === false);

check('register mousetrap string', r.register(def({ id: 'mousetrap.one', defaultBind: 'alt+q' })) === true);
check('mousetrap normalized', JSON.stringify(r.get('mousetrap.one')?.defaultBind) === '["AltLeft","KeyQ"]');
check('comma sequence rejected', r.register(def({ id: 'mousetrap.two', defaultBind: 'alt+q,alt+w' })) === false);
check('blocked atom rejected', r.register(def({ id: 'bad.atom', defaultBind: ['Unidentified'] })) === false);
check('media key accepted', r.register(def({ id: 'media.key', defaultBind: ['MediaPlayPause'] })) === true);
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

check('group absent is null', r.groupIdOf(r.get('mousetrap.one')) === null);
r.register(def({ id: 'group.one', group: { id: 'shared.group', label: { zh: '我的模组', en: 'My Mod' } } }));
check('group id kept as declared', r.groupIdOf(r.get('group.one')) === 'shared.group');
check('group label follows the language', r.groupLabelOf('shared.group', 'zh') === '我的模组' && r.groupLabelOf('shared.group', 'en') === 'My Mod');

r.register(def({ id: 'group.two', group: 'shared.group' }));
check(
  'string group joins by id and keeps the declared label',
  r.groupIdOf(r.get('group.two')) === 'shared.group' && r.groupLabelOf('shared.group', 'zh') === '我的模组',
);

r.register(def({ id: 'group.three', group: 'plain' }));
check('group id needs no namespace', r.groupIdOf(r.get('group.three')) === 'plain');
check('group without any label falls back to id', r.groupLabelOf('plain', 'zh') === 'plain');

r.register(def({ id: 'group.four', group: { id: 'plain', label: '后到的名字' } }));
r.register(def({ id: 'group.five', group: { id: 'plain', label: '更晚的名字' } }));
check('label comes from the earliest registration that provides one', r.groupLabelOf('plain', 'zh') === '后到的名字');
r.unregister('group.four');
r.unregister('group.five');
check('label falls back to id once its provider is gone', r.groupLabelOf('plain', 'zh') === 'plain');

r.register(def({ id: 'group.bad', group: { zh: '旧写法' } }));
check('group without an id is ignored', r.groupIdOf(r.get('group.bad')) === null);

check('null label falls back to id', r.resolveLabel(null, 'x.y', 'zh') === 'x.y');
check('number label falls back to id', r.resolveLabel(42, 'x.y', 'zh') === 'x.y');
check('array label falls back to id', r.resolveLabel([], 'x.y', 'zh') === 'x.y');

r.register(def({ id: 'label.null', label: null }));
check('null label falls back to the id', r.labelOf(r.get('label.null'), 'zh') === 'label.null');

r.register(def({ id: 'tip.null', tip: null }));
check('null tip is treated as absent', r.tipOf(r.get('tip.null'), 'zh') === null);

r.register(def({ id: 'group.null', group: { id: 'null.group', label: null } }));
check('invalid group label is dropped instead of crashing', r.groupLabelOf('null.group', 'zh') === 'null.group');

r.register(def({ id: 'group.mixed', group: { id: 'mixed.group', label: { zh: '   ', en: 'Mixed' } } }));
check('group label keeps the language that has text', r.groupLabelOf('mixed.group', 'zh') === 'Mixed');

r.register(def({ id: 'tip.one', tip: { zh: '会打开面板', en: 'Opens the panel' } }));
check('tip resolved', r.tipOf(r.get('tip.one'), 'zh') === '会打开面板');
check('tip absent is null', r.tipOf(r.get('mousetrap.one'), 'zh') === null);

check('default bind of a registered id', JSON.stringify(r.defaultBindOf('group.one')) === '["ControlLeft","KeyA"]');
check('default bind of an unknown id is null', r.defaultBindOf('nope.nope') === null);
check('list returns registered ids', r.list().map(entry => entry.id).includes('group.one'));

finish('registry');
