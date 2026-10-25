// 生成用于 e2e 的假第三方模组：只写 boot 声明，运行时仍走全局 API
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'test-output');

const RUNTIME = `(function () {
  var state = (window.__declFixture = { fired: null });
  function reg(def) {
    var api = window.DoLHK;
    if (api && typeof api.register === 'function') return api.register(def);
    (window.DoLHK_QUEUE = window.DoLHK_QUEUE || []).push(def);
    return 'queued';
  }
  reg({ id: 'fixture.act', handler: function () { state.fired = 'act'; } });
  reg({ id: 'fixture.join', handler: function () { state.fired = 'join'; } });
  reg({ id: 'fixture.typo', handler: function () {} });
})();
`;

const binds = {
  'fixture.act': {
    label: { zh: '夹具动作', en: 'Fixture action' },
    tip: { zh: '夹具说明：由声明提供', en: 'Fixture tip from the declaration' },
    defaultBind: ['AltLeft', 'ShiftLeft', 'KeyK'],
  },
  'fixture.declonly': {
    label: { zh: '只声明', en: 'Declared only' },
    defaultBind: ['AltLeft', 'ShiftLeft', 'KeyL'],
  },
};

// 第二条声明只写组 id，用来验证「加入别的声明创建的分组」
const joining = {
  'fixture.join': {
    label: { zh: '入组动作', en: 'Joined action' },
    defaultBind: ['AltLeft', 'ShiftLeft', 'KeyJ'],
    group: 'fixture.shared',
  },
};

const boot = {
  name: 'Hotkey Decl Fixture',
  version: '1.0.0',
  styleFileList: [],
  scriptFileList_inject_early: [],
  scriptFileList: ['fixture.js'],
  tweeFileList: [],
  imgFileList: [],
  additionFile: [],
  addonPlugin: [
    {
      modName: 'DoL Hotkeys',
      addonName: 'hotkeys',
      modVersion: '1.0.0',
      params: { group: { id: 'fixture.shared', label: { zh: '夹具分组', en: 'Fixture group' } }, binds },
    },
    {
      modName: 'DoL Hotkeys',
      addonName: 'hotkeys',
      modVersion: '1.0.0',
      params: { binds: joining },
    },
    {
      modName: 'DoL Hotkeys',
      addonName: 'hotkeyz',
      modVersion: '1.0.0',
      params: {
        binds: { 'fixture.typo': { label: { zh: '拼错名', en: 'Typo name' }, defaultBind: ['AltLeft', 'ShiftLeft', 'KeyP'] } },
      },
    },
  ],
  dependenceInfo: [],
};

await mkdir(outDir, { recursive: true });
const encoder = new TextEncoder();
const zip = zipSync(
  {
    'boot.json': encoder.encode(`${JSON.stringify(boot, null, 2)}\n`),
    'fixture.js': encoder.encode(RUNTIME),
  },
  { level: 9 },
);
const target = path.join(outDir, 'fixture-decl.zip');
await writeFile(target, Buffer.from(zip));
console.log(`fixture -> ${path.relative(root, target)} (${(zip.length / 1024).toFixed(1)} KiB)`);
