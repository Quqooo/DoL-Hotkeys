// 生成用于 e2e 的假第三方模组：只写 boot 声明，运行时仍走全局 API
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'test-output');

const RUNTIME = `(function () {
  var state = (window.__declFixture = { results: {}, fired: null });
  var warnings = (window.__declWarnings = []);
  var realWarn = console.warn;
  console.warn = function () {
    var text = Array.prototype.map.call(arguments, String).join(' ');
    if (text.indexOf('[dol-hotkeys]') >= 0) warnings.push(text);
    return realWarn.apply(console, arguments);
  };
  function reg(def) {
    var api = window.DoLHK;
    if (api && typeof api.register === 'function') return api.register(def);
    (window.DoLHK_QUEUE = window.DoLHK_QUEUE || []).push(def);
    return 'queued';
  }
  state.results.act = reg({
    id: 'fixture.act',
    handler: function () { state.fired = 'act'; },
  });
  state.results.incomplete = reg({
    id: 'fixture.incomplete',
    handler: function () {},
  });
  state.results.vanilla = reg({
    id: 'fixture.vanilla',
    handler: function () { state.fired = 'vanilla'; },
  });
  state.results.typo = reg({
    id: 'fixture.typo',
    handler: function () {},
  });
  state.results.dup = reg({
    id: 'fixture.dup',
    handler: function () {},
  });
})();
`;

const binds = {
  'fixture.act': {
    label: { zh: '夹具动作', en: 'Fixture action' },
    defaultBind: ['AltLeft', 'ShiftLeft', 'KeyK'],
  },
  'fixture.incomplete': {
    label: { zh: '缺键位', en: 'No bind' },
  },
  'fixture.vanilla': {
    label: { zh: '撞原版', en: 'Vanilla clash' },
    defaultBind: ['KeyN'],
  },
  'fixture.declonly': {
    label: { zh: '只声明', en: 'Declared only' },
    defaultBind: ['AltLeft', 'ShiftLeft', 'KeyL'],
  },
  'fixture.dup': {
    label: { zh: '首个声明', en: 'First declaration' },
    defaultBind: ['AltLeft', 'ShiftLeft', 'KeyM'],
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
      params: { group: { zh: '夹具分组', en: 'Fixture group' }, binds },
    },
    {
      modName: 'DoL Hotkeys',
      addonName: 'hotkeys',
      modVersion: '2.0.0',
      params: {
        binds: {
          'fixture.dup': { label: { zh: '重复声明', en: 'Duplicate declaration' }, defaultBind: ['AltLeft', 'ShiftLeft', 'KeyQ'] },
        },
      },
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
