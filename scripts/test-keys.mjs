// 键位编码的单元测试
// 运行：npm test
import { load, reporter } from './lib/unit.mjs';

const k = await load('core/keys.ts', 'keys');
const { check, eq, finish } = reporter();

// Mousetrap 有损适配：只接受单个 chord
eq(
  'mousetrap parses single chords',
  [k.parseMousetrap('alt+o'), k.parseMousetrap('ctrl+shift+k'), k.parseMousetrap('esc')],
  [
    ['AltLeft', 'KeyO'],
    ['ControlLeft', 'ShiftLeft', 'KeyK'],
    ['Escape'],
  ],
);
eq(
  'mousetrap rejects sequences and unknown keys',
  [k.parseMousetrap('alt+o,alt+p'), k.parseMousetrap('alt+?')],
  [null, null],
);

// 结构化校验
eq('normalize ok', k.normalizeBind(['ControlLeft', 'KeyA']), ['ControlLeft', 'KeyA']);
// 依次为：重复原子、不可用原子、裸修饰键名、空数组、超长组合
eq(
  'normalize rejects malformed chords',
  [
    k.normalizeBind(['KeyA', 'KeyA']),
    k.normalizeBind(['Unidentified']),
    k.normalizeBind(['Control']),
    k.normalizeBind([]),
    k.normalizeBind(new Array(9).fill('KeyA').map((v, i) => `${v}${i}`)),
  ],
  [null, null, null, null, null],
);
eq('normalize accepts media keys', k.normalizeBind(['MediaPlayPause']), ['MediaPlayPause']);
eq('normalize accepts volume keys', k.normalizeBind(['AudioVolumeUp', 'KeyA']), ['AudioVolumeUp', 'KeyA']);
eq('normalize rejects disallowed mouse buttons', k.normalizeBind(['Mouse2']), null);
eq('saved bind keeps a media key', k.normalizeSavedBind(['MediaPlayPause']), ['MediaPlayPause']);
eq('saved bind keeps an empty array', k.normalizeSavedBind([]), []);
eq('normalize mouse ok', k.normalizeBind(['ControlLeft', 'Mouse3']), ['ControlLeft', 'Mouse3']);

// 匹配语义：bindKey 是唯一判等依据，修饰键按族归并、顺序保留
const sameBind = (a, b) => k.bindKey(a) === k.bindKey(b);
check('modifier family equal', sameBind(['ControlLeft', 'KeyA'], ['ControlRight', 'KeyA']));
check('order matters', !sameBind(['ControlLeft', 'KeyA'], ['KeyA', 'ControlLeft']));
check('length matters', !sameBind(['ControlLeft'], ['ControlLeft', 'KeyA']));
check('mouse vs key distinct', !sameBind(['Mouse1'], ['Mouse3']));

// 展示顺序即语义
eq('label keeps order', k.bindLabel(['KeyX', 'ControlLeft', 'AltLeft', 'KeyA', 'KeyB']), 'X + Ctrl + Alt + A + B');

finish('keys');
