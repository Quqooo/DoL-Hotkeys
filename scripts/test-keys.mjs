// 键位编码与旧配置迁移的单元测试（M0 契约）
// 运行：npm test
import { load, reporter } from './lib/unit.mjs';

const k = await load('core/keys.ts', 'keys');
const { check, eq, finish } = reporter();

// 旧 step 编码 → 结构化 Bind
eq(
  'legacy modifier mapping',
  [k.legacyStepToBind('Ctrl+KeyZ'), k.legacyStepToBind('Alt+KeyC')],
  [['ControlLeft', 'KeyZ'], ['AltLeft', 'KeyC']],
);
eq('legacy modifier order', k.legacyStepToBind('Shift+Ctrl+KeyA'), ['ControlLeft', 'ShiftLeft', 'KeyA']);
eq('legacy combo', k.legacyStepToBind('Ctrl+KeyA,KeyB'), ['ControlLeft', 'KeyA', 'KeyB']);
eq('legacy mouse', k.legacyStepToBind('Mouse3'), ['Mouse3']);
// 依次为：空串、悬空修饰键、未知按键
eq('legacy rejects malformed steps', ['', 'Ctrl+', 'Ctrl+Nope'].map(k.legacyStepToBind), [null, null, null]);

// 多段序列在 v3 里不存在，按按下顺序拍平并去重
eq('legacy sequence flatten', k.bindFromLegacySteps(['Alt+KeyK', 'Alt+KeyJ']), ['AltLeft', 'KeyK', 'KeyJ']);
eq('legacy single step array', k.bindFromLegacySteps(['Ctrl+KeyZ']), ['ControlLeft', 'KeyZ']);

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
// 依次为：重复原子、未知原子、裸修饰键、空数组、超长组合
eq(
  'normalize rejects malformed chords',
  [
    k.normalizeBind(['KeyA', 'KeyA']),
    k.normalizeBind(['Nope']),
    k.normalizeBind(['Control']),
    k.normalizeBind([]),
    k.normalizeBind(new Array(9).fill('KeyA').map((v, i) => `${v}${i}`)),
  ],
  [null, null, null, null, null],
);
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
