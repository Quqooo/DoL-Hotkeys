// 原版绑定冲突检测的单元测试
import { load, reporter } from './lib/unit.mjs';

// 必须在载入前放好观测数据：模块按此快照建表
globalThis.window = {
  __DoLHKEarly: {
    bindings: [{ keys: 'z n', combos: ['z', 'n'], src: '' }],
    native: [],
    mousetrapSeen: true,
  },
};

const v = await load('host/vanilla.ts', 'vanilla');
const { check, finish } = reporter();

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

finish('vanilla');
