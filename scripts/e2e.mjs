// 端到端回归：真实游戏 + 真实模组包，覆盖派发、录制、面板与原版检测
// 用法：node scripts/e2e.mjs
// 目标版本：0.5.12.13（主线）；0.4.2.7 与 0.5.0.5（次要）。其余版本不要求回归。
// 环境变量：
//   HK_GAME_HTML / HK_IMAGE_DIR  换游戏版本
//   HK_SHOT / HK_SHOT_LANG / HK_SHOT_FOLD / HK_SHOT_HINT  结束时截图，并指定语言、收起的分区、悬停的 (?)
//   HK_EXTRA_ZIPS  逗号分隔的额外模组，用于测共存
//   HK_DECL_FIXTURE=0  跳过声明层夹具
//   HK_PROBE=orig|keys|env|dialog|api|perf|sidebar  只打印诊断信息（实现见 probes.mjs）
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync } from 'fflate';
import { runProbe } from './probes.mjs';

const root = path.resolve(import.meta.dirname, '..');
const research = path.resolve(root, '..', '_research');
const GAME_HTML = process.env.HK_GAME_HTML ?? path.join(research, 'mlbuild', 'Degrees of Lewdity VERSION.html.sc2patch.html.mod.html');
const IMAGE_DIR = process.env.HK_IMAGE_DIR ?? path.join(research, 'mlbuild', 'img');
const OUTPUT_DIR = path.join(root, 'test-output');
const SHOT_NAME = process.env.HK_SHOT ?? 'panel.png';
const EXTRA_ZIPS = (process.env.HK_EXTRA_ZIPS ?? '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const DECL_FIXTURE = path.join(OUTPUT_DIR, 'fixture-decl.zip');
const USE_DECL_FIXTURE = process.env.HK_DECL_FIXTURE !== '0';
if (USE_DECL_FIXTURE) {
  if (!existsSync(DECL_FIXTURE)) spawnSync(process.execPath, [path.join(root, 'scripts', 'make-decl-fixture.mjs')], { stdio: 'inherit' });
  if (!EXTRA_ZIPS.includes(DECL_FIXTURE)) EXTRA_ZIPS.unshift(DECL_FIXTURE);
}
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

const sleep = ms => new Promise(done => setTimeout(done, ms));
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.logs = [];
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
        else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const text = msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? '';
        this.errors.push(text);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args?.map(a => a.value ?? a.description ?? '').join(' ') ?? '';
        if (msg.params.type === 'error') this.errors.push(text);
        if (this.logs.length < 400) this.logs.push(`${msg.params.type}: ${text}`.slice(0, 300));
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 180000);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`evaluate failed: ${detail}`);
    }
    return result.result.value;
  }

  async waitFor(expression, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        const probe = await Promise.race([
          this.evaluate(`(() => { try { return Boolean(${expression}); } catch (e) { return false; } })()`),
          sleep(4000).then(() => false),
        ]);
        if (probe) return true;
      } catch {
        /* 页面可能正在导航或忙碌 */
      }
      await sleep(250);
    }
    return false;
  }
}

const MOD_INFO = {
  Ctrl: { code: 'ControlLeft', key: 'Control', vk: 17, bit: 2 },
  Shift: { code: 'ShiftLeft', key: 'Shift', vk: 16, bit: 8 },
  Alt: { code: 'AltLeft', key: 'Alt', vk: 18, bit: 1 },
  Meta: { code: 'MetaLeft', key: 'Meta', vk: 91, bit: 4 },
};

async function keyEvent(cdp, type, { code, key, vk, modifiers }) {
  await cdp.send('Input.dispatchKeyEvent', {
    type,
    code,
    key,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    modifiers,
  });
}

async function combo(cdp, mods, code, key, vk) {
  let mask = 0;
  for (const mod of mods) {
    const info = MOD_INFO[mod];
    await keyEvent(cdp, 'keyDown', { code: info.code, key: info.key, vk: info.vk, modifiers: mask });
    mask |= info.bit;
  }
  await keyEvent(cdp, 'keyDown', { code, key, vk, modifiers: mask });
  await sleep(25);
  await keyEvent(cdp, 'keyUp', { code, key, vk, modifiers: mask });
  for (const mod of [...mods].reverse()) {
    const info = MOD_INFO[mod];
    mask &= ~info.bit;
    await keyEvent(cdp, 'keyUp', { code: info.code, key: info.key, vk: info.vk, modifiers: mask });
  }
  await sleep(120);
}

async function chord(cdp, mods, taps) {
  let mask = 0;
  for (const mod of mods) {
    const info = MOD_INFO[mod];
    await keyEvent(cdp, 'keyDown', { code: info.code, key: info.key, vk: info.vk, modifiers: mask });
    mask |= info.bit;
  }
  for (const tap of taps) {
    await keyEvent(cdp, 'keyDown', { code: tap.code, key: tap.key, vk: tap.vk, modifiers: mask });
    await sleep(30);
    await keyEvent(cdp, 'keyUp', { code: tap.code, key: tap.key, vk: tap.vk, modifiers: mask });
    await sleep(40);
  }
  for (const mod of [...mods].reverse()) {
    const info = MOD_INFO[mod];
    mask &= ~info.bit;
    await keyEvent(cdp, 'keyUp', { code: info.code, key: info.key, vk: info.vk, modifiers: mask });
  }
  await sleep(150);
}

const KEY = {
  A: ['KeyA', 'a', 65],
  B: ['KeyB', 'b', 66],
  C: ['KeyC', 'c', 67],
  F: ['KeyF', 'f', 70],
  H: ['KeyH', 'h', 72],
  I: ['KeyI', 'i', 73],
  T: ['KeyT', 't', 84],
  J: ['KeyJ', 'j', 74],
  K: ['KeyK', 'k', 75],
  O: ['KeyO', 'o', 79],
  R: ['KeyR', 'r', 82],
  S: ['KeyS', 's', 83],
  X: ['KeyX', 'x', 88],
  Z: ['KeyZ', 'z', 90],
};

async function pressAlt(cdp, letter) {
  const [code, key, vk] = KEY[letter];
  await combo(cdp, ['Alt'], code, key, vk);
}

async function pressCtrl(cdp, letter) {
  const [code, key, vk] = KEY[letter];
  await combo(cdp, ['Ctrl'], code, key, vk);
}

const MOUSE_BIT = { left: 1, right: 2, middle: 4, back: 8, forward: 16 };

async function centerOf(cdp, selector) {
  return cdp.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
}

async function mouseClick(cdp, button, point, modifiers = 0) {
  const buttons = MOUSE_BIT[button];
  const base = { x: point.x, y: point.y, modifiers };
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', button: 'none', buttons: 0 });
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', button, buttons, clickCount: 1 });
  await sleep(70);
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', button, buttons: 0, clickCount: 1 });
  await sleep(160);
}

function startServer(html, port) {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (url === '/' || url === '/game.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (url.startsWith('/img/')) {
      const file = path.join(IMAGE_DIR, url.slice(5));
      if (existsSync(file)) {
        const buffer = await readFile(file);
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(buffer);
        return;
      }
    }
    if (url.endsWith('.json')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function launch(profileDir, url) {
  const browser = BROWSERS.find(candidate => existsSync(candidate));
  if (!browser) throw new Error('No Chromium browser found for end-to-end testing');
  const child = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-extensions',
      '--disable-features=Translate,MediaRouter',
      '--window-size=1400,1000',
      `--user-data-dir=${profileDir}`,
      '--remote-debugging-port=0',
      url,
    ],
    { stdio: 'ignore' },
  );

  const portFile = path.join(profileDir, 'DevToolsActivePort');
  for (let i = 0; i < 200; i++) {
    if (existsSync(portFile)) {
      const content = (await readFile(portFile, 'utf8')).trim().split('\n');
      if (content.length >= 2) return { child, port: Number(content[0]), path: content[1].trim() };
    }
    await sleep(100);
  }
  child.kill();
  throw new Error('DevTools endpoint never became available');
}

async function connectWs(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new Cdp(ws);
}

async function buildModZip() {
  const dist = path.join(root, 'dist');
  const files = {};
  for (const name of await readdir(dist)) {
    if (name.endsWith('.zip')) continue;
    files[name] = new Uint8Array(await readFile(path.join(dist, name)));
  }
  return Buffer.from(zipSync(files, { level: 9 }));
}

async function holdChord(cdp, mods, taps) {
  let mask = 0;
  for (const mod of mods) {
    const info = MOD_INFO[mod];
    await keyEvent(cdp, 'keyDown', { code: info.code, key: info.key, vk: info.vk, modifiers: mask });
    mask |= info.bit;
  }
  for (const tap of taps) {
    await keyEvent(cdp, 'keyDown', { code: tap.code, key: tap.key, vk: tap.vk, modifiers: mask });
    await sleep(45);
  }
  for (const tap of [...taps].reverse()) {
    await keyEvent(cdp, 'keyUp', { code: tap.code, key: tap.key, vk: tap.vk, modifiers: mask });
    await sleep(25);
  }
  for (const mod of [...mods].reverse()) {
    const info = MOD_INFO[mod];
    mask &= ~info.bit;
    await keyEvent(cdp, 'keyUp', { code: info.code, key: info.key, vk: info.vk, modifiers: mask });
  }
  await sleep(160);
}

async function openHotkeysTab(cdp) {
  await cdp.evaluate(`SugarCube.State.temporary.currentOverlay ? closeOverlay() : true`);
  await sleep(200);
  await pressAlt(cdp, 'O');
  await cdp.waitFor(`document.querySelector('#overlayTabs button[data-dolhk-tab]')`, 15000);
  await cdp.evaluate(`document.querySelector('#overlayTabs button[data-dolhk-tab]').click()`);
  return cdp.waitFor(`document.querySelector('.dolhk-row[data-dolhk]')`, 15000);
}

/** 关掉覆盖层并等它收干净：关闭过程中的按键会被吞掉，紧接着派发会漏 */
async function closeOverlayAndSettle(cdp, wait = 250) {
  await cdp.evaluate(`closeOverlay()`);
  await sleep(wait);
}

/** 抹掉覆盖层记录，模拟「已回到正文」；`forgetCurrent` 连游戏自己的状态一起清掉 */
async function clearOverlayMark(cdp, forgetCurrent = false) {
  const head = forgetCurrent ? 'delete SugarCube.State.temporary.currentOverlay; ' : '';
  await cdp.evaluate(`${head}document.getElementById('customOverlay').setAttribute('data-overlay', 'none'); true`);
}

async function main() {
  if (!existsSync(GAME_HTML)) {
    throw new Error(`Game build missing: ${GAME_HTML}\nRun the ModLoader build download first.`);
  }

  const zip = await buildModZip();
  check('L1 mod zip produced', zip.length > 1000, `${(zip.length / 1024).toFixed(1)} KiB`);

  const original = await readFile(GAME_HTML, 'utf8');
  const marker = 'window.modDataValueZipList = [';
  if (!original.includes(marker)) throw new Error('Cannot find the mod injection marker in the game HTML');
  let patched = process.env.HK_NO_MOD ? original : original.replace(marker, `${marker}"${zip.toString('base64')}",`);
  for (const extra of EXTRA_ZIPS) {
    const data = await readFile(extra);
    patched = patched.replace(marker, `${marker}"${data.toString('base64')}",`);
    console.log(`  extra mod loaded first: ${path.basename(extra)} (${(data.length / 1024).toFixed(1)} KiB)`);
  }

  const workDir = await mkdtemp(path.join(tmpdir(), 'dolhk-e2e-'));
  const profileDir = path.join(workDir, 'profile');
  await mkdir(profileDir, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const port = 41733;
  const server = await startServer(patched, port);
  const url = `http://127.0.0.1:${port}/game.html`;

  let browser;
  let cdp;
  try {
    console.log('launching browser…');
    const launched = await launch(profileDir, url);
    browser = launched.child;
    const targets = await (await fetch(`http://127.0.0.1:${launched.port}/json/list`)).json();
    const page = targets.find(target => target.type === 'page');
    if (!page) throw new Error('No page target exposed by the browser');
    cdp = await connectWs(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    console.log('waiting for the game to boot…');
    const bootTimeout = Number(process.env.HK_BOOT_TIMEOUT ?? 180000);
    const ready = await cdp.waitFor('window.SugarCube && window.SugarCube.Engine && window.SugarCube.State && document.getElementById("passages")', bootTimeout);
    check('L2 game boots with the mod loaded', ready);
    const env = await cdp.evaluate(`(() => {
      const keys = Object.keys(window).filter(k => /mod|Mod|SC2|loader/i.test(k));
      const pick = {};
      for (const k of keys) {
        const v = window[k];
        if (!v || typeof v !== 'object') continue;
        for (const f of ['version', 'modLoaderVersion', 'dataManagerVersion', 'gameVersion', 'ver']) {
          if (f in v) pick[k + '.' + f] = String(v[f]);
        }
      }
      return { keys, pick, modCount: (window.modDataValueZipList || []).length };
    })()`);
    console.log(`  env: ${JSON.stringify(env)}`);
    const probeCtx = { cdp, sleep, pressAlt, keyEvent, openHotkeysTab, outputDir: OUTPUT_DIR };
    await runProbe(process.env.HK_PROBE, probeCtx, ['orig', 'keys', 'env', 'dialog', 'api', 'perf']);
    if (!ready) {
      for (const text of cdp.errors.slice(0, 10)) console.log(`   ! ${String(text).slice(0, 300)}`);
      const snapshot = await cdp
        .evaluate(
          `({ title: document.title, readyState: document.readyState,
              manager: Boolean(window.SC2DataManager), mods: (window.modDataValueZipList || []).length })`,
        )
        .catch(() => null);
      console.log('   boot snapshot:', JSON.stringify(snapshot));
      throw new Error('Game never finished booting');
    }

    check(
      'L2 early hook captured vanilla Mousetrap bindings',
      await cdp.evaluate('Boolean(window.__DoLHKEarly && window.__DoLHKEarly.bindings.length)'),
      await cdp.evaluate('JSON.stringify((window.__DoLHKEarly?.bindings ?? []).map(b => b.keys))'),
    );

    await runProbe(process.env.HK_PROBE, probeCtx, ['sidebar']);

    const dismissed = await cdp.evaluate(`(() => {
      if (!window.SugarCube?.Dialog?.isOpen?.()) return 'none';
      SugarCube.Dialog.close();
      return 'closed';
    })()`);
    console.log(`  age gate: ${dismissed}`);
    await sleep(600);

    const titleAvailability = await cdp.evaluate(`({
      passage: SugarCube.State.passage,
      intro: SugarCube.State.variables.intro,
      options: window.DoLHK.available('options'),
      saves: window.DoLHK.available('saves'),
      feats: window.DoLHK.available('feats'),
      social: window.DoLHK.available('social'),
      journal: window.DoLHK.available('journal'),
      characteristics: window.DoLHK.available('characteristics'),
      traits: window.DoLHK.available('traits'),
      statistics: window.DoLHK.available('statistics'),
      cheats: window.DoLHK.available('cheats'),
    })`);
    check(
      'L13 menu keeps only the always-available pages',
      titleAvailability.options && titleAvailability.saves && titleAvailability.feats &&
        !titleAvailability.social && !titleAvailability.journal && !titleAvailability.statistics &&
        !titleAvailability.characteristics && !titleAvailability.traits && !titleAvailability.cheats,
      JSON.stringify(titleAvailability),
    );

    await pressAlt(cdp, 'J');
    const menuOverlay = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);

    await cdp.evaluate(`SugarCube.State.variables.intro = 0; true`);
    await pressAlt(cdp, 'J');
    const gameOverlay = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check(
      'L13 journal hotkey follows page availability',
      menuOverlay !== 'journal' && gameOverlay === 'journal',
      JSON.stringify({ menu: menuOverlay, game: gameOverlay }),
    );
    await closeOverlayAndSettle(cdp, 250);

    await pressAlt(cdp, 'O');
    await cdp.waitFor(`document.querySelector('#overlayTabs button')`);

    const tabLabels = await cdp.evaluate(`[...document.querySelectorAll('#overlayTabs button')].map(b => b.textContent)`);
    const tabCount = await cdp.evaluate(`document.querySelectorAll('#overlayTabs button[data-dolhk-tab]').length`);
    check('L3 hotkeys tab injected into the settings overlay', tabCount === 1, tabLabels.join(' / '));

    await cdp.evaluate(`document.querySelector('#overlayTabs button[data-dolhk-tab]').click()`);
    const panelReady = await cdp.waitFor(`document.querySelector('.dolhk')`);
    check('L3 panel renders', panelReady);

    const BUILTIN_IDS = ['back', 'forward', 'characteristics', 'social', 'traits', 'journal', 'statistics', 'feats', 'options', 'saves', 'cheats'];
    const allRows = await cdp.evaluate(`[...document.querySelectorAll('.dolhk-row[data-dolhk]')].map(r => r.dataset.dolhk)`);
    const rows = allRows.filter(id => BUILTIN_IDS.includes(id));
    check('L3 eleven bindable actions listed', rows.length === 11, allRows.join(','));

    const api = await cdp.evaluate(`(() => {
      const api = window.DoLHK;
      const def = {
        id: 'e2e.probe',
        label: { zh: '探针', en: 'Probe' },
        defaultBind: 'alt+q',
        handler: () => {},
      };
      const first = api.register(def);
      const dup = api.register(def);
      const bind = api.getBind('e2e.probe');
      const removed = api.unregister('e2e.probe');
      const after = api.getBind('e2e.probe');
      return {
        api: api.api,
        version: api.version,
        lang: api.lang(),
        first,
        dup,
        bind,
        removed,
        after,
        badId: api.register({ id: 'nodot', defaultBind: ['KeyA'], handler: () => {} }),
      };
    })()`);
    check('L21 public api exposes version and language', api.api === 1 && /^\d+\.\d+\.\d+$/.test(api.version) && ['zh', 'en'].includes(api.lang), JSON.stringify({ api: api.api, version: api.version, lang: api.lang }));
    check(
      'L21 register normalizes a Mousetrap bind and rejects duplicates',
      api.first === true && api.dup === false && JSON.stringify(api.bind) === '["AltLeft","KeyQ"]',
      JSON.stringify({ first: api.first, dup: api.dup, bind: api.bind }),
    );
    check(
      'L21 unregister removes the entry and invalid ids are rejected',
      api.removed === true && api.after === null && api.badId === false,
      JSON.stringify({ removed: api.removed, after: api.after, badId: api.badId }),
    );

    const availability = await cdp.evaluate(`(() => {
      const api = window.DoLHK;
      api.register({ id: 'e2e.off', defaultBind: ['AltLeft', 'KeyN'], handler: () => {}, available: () => false });
      const off = api.available('e2e.off');
      const missing = api.available('e2e.missing');
      const builtin = api.available('options');
      api.unregister('e2e.off');
      return { off, missing, builtin, afterUnregister: api.available('e2e.off') };
    })()`);
    check(
      'L21 available() reports the registered predicate and rejects unknown ids',
      availability.off === false && availability.missing === false && availability.builtin === true && availability.afterUnregister === false,
      JSON.stringify(availability),
    );

    const panelRows = await cdp.evaluate(`(() => {
      const api = window.DoLHK;
      const make = (id, group, bind) => ({ id, group, defaultBind: bind, label: id, handler: () => {} });
      api.register(make('e2e.ungrouped', undefined, ['AltLeft', 'KeyY']));
      api.register(make('e2e.groupA', { id: 'e2e.g', label: { zh: '组甲', en: 'Group A' } }, ['AltLeft', 'KeyU']));
      api.register(make('e2e.groupB', { id: 'e2e.g', label: { zh: '组乙', en: 'Group B' } }, ['AltLeft', 'KeyO']));
      // 只写组 id：后注册的条目加入前面创建的分组，不改变已有显示名
      api.register(make('e2e.groupC', 'e2e.g', ['AltLeft', 'KeyB']));
      // id 更小的组后注册，借它校验分区按 id 而非注册顺序排列
      api.register(make('e2e.groupD', { id: 'e2e.a', label: { zh: '组丙', en: 'Group C' } }, ['AltLeft', 'KeyV']));
      const row = id => document.querySelector(\`.dolhk-row[data-dolhk="\${id}"]\`);
      const sectionOf = id => row(id)?.closest('.settingsGrid') ?? null;
      const headers = [...document.querySelectorAll('.dolhk-sections .settingsHeader')].map(node => node.textContent);
      const badge = row('e2e.ungrouped')?.querySelector('.dolhk-badge')?.textContent ?? '';
      const dupText = row('e2e.groupB')?.querySelector('.dolhk-warn')?.textContent ?? '';
      const commonSection = document.querySelector('.dolhk-sections .settingsGrid');
      const ungroupedInCommon = Boolean(commonSection?.querySelector('[data-dolhk="e2e.ungrouped"]'));
      const groupSection = sectionOf('e2e.groupA');
      const joined = Boolean(groupSection) && sectionOf('e2e.groupB') === groupSection && sectionOf('e2e.groupC') === groupSection;
      const allHeaders = [...document.querySelectorAll('.dolhk .settingsHeader')].map(node => node.textContent);
      return { headers, badge, dupText, ungroupedInCommon, joined, allHeaders };
    })()`);
    const ownHeaders = panelRows.headers.filter(text => !/夹具|Fixture/.test(text));
    check(
      'L22 groups are ordered by id and labelled by the first registration',
      (ownHeaders.join('|') === '常用快捷键|组丙|组甲' || ownHeaders.join('|') === 'Common hotkeys|Group C|Group A') &&
        panelRows.joined === true &&
        panelRows.ungroupedInCommon === true &&
        panelRows.badge === 'e2e',
      JSON.stringify({ headers: panelRows.headers, joined: panelRows.joined, inCommon: panelRows.ungroupedInCommon, badge: panelRows.badge }),
    );
    check(
      'L22 conflict hint follows the legacy mode',
      /仅执行靠前的一项|only the earlier entry runs/.test(panelRows.dupText),
      panelRows.dupText,
    );

    const order = panelRows.allHeaders;
    const at = pattern => order.findIndex(text => pattern.test(text));
    const commonAt = at(/常用快捷键|Common hotkeys/);
    const originalAt = at(/原版快捷键|Vanilla hotkeys/);
    const groupAt = order.map((text, index) => (/组甲|组丙|Group [AC]/.test(text) ? index : -1)).filter(index => index >= 0);
    check(
      'L22 sections run common > groups by id > vanilla > other',
      commonAt === 0 &&
        groupAt.length === 2 &&
        groupAt.every(index => index > commonAt && index < originalAt) &&
        originalAt === order.length - 2,
      JSON.stringify(order),
    );

    const modeTip = await cdp.evaluate(`(() => {
      const anchor = document.querySelector('.dolhk-radios .tooltip-anchor');
      return anchor ? { text: anchor.textContent, tip: anchor.getAttribute('tooltip') || '' } : null;
    })()`);
    check(
      'L22 legacy conflict mode carries a hint',
      modeTip?.text.trim() === '(?)' && modeTip.tip.length > 0,
      JSON.stringify(modeTip),
    );

    const foldProbe = await cdp.evaluate(`(() => {
      const pick = () => [...document.querySelectorAll('.dolhk-sections .settingsHeader')]
        .find(node => /组甲|Group A/.test(node.textContent));
      const head = pick();
      if (!head) return { skip: 'no group header' };
      const read = node => {
        const wrap = node.parentElement;
        const list = wrap.querySelector('.dolhk-list');
        return {
          folded: wrap.classList.contains('dolhk-folded'),
          expanded: node.getAttribute('aria-expanded'),
          role: node.getAttribute('role'),
          hidden: list ? getComputedStyle(list).display === 'none' : null,
          text: node.textContent,
          rows: wrap.querySelectorAll('.dolhk-row').length,
        };
      };
      const initial = read(head);
      head.click();
      const collapsed = read(pick());
      // 面板重建（注册表变化会整体重绘）之后应保持收起
      window.DoLHK.register({ id: 'e2e.foldprobe', defaultBind: ['AltLeft', 'KeyG'], handler: () => {} });
      window.DoLHK.unregister('e2e.foldprobe');
      const rebuilt = read(pick());
      let stored = null;
      try {
        stored = (JSON.parse(localStorage.getItem('dol-hotkeys:config')) || {}).collapsed || [];
      } catch (error) {
        stored = null;
      }
      pick().click();
      const reexpanded = read(pick());
      const allFoldable = [...document.querySelectorAll('.dolhk .settingsHeader')]
        .every(node => node.getAttribute('role') === 'button');
      return { initial, collapsed, rebuilt, stored, reexpanded, allFoldable };
    })()`);
    check(
      'L24 panel sections start expanded and every header is a button',
      foldProbe.initial?.folded === false &&
        foldProbe.initial?.expanded === 'true' &&
        foldProbe.initial?.role === 'button' &&
        foldProbe.initial?.hidden === false &&
        foldProbe.allFoldable === true,
      JSON.stringify({ ...foldProbe.initial, allFoldable: foldProbe.allFoldable }),
    );
    check(
      'L24 clicking a group header collapses it without changing its text',
      foldProbe.collapsed?.folded === true && foldProbe.collapsed?.expanded === 'false' && foldProbe.collapsed?.hidden === true && foldProbe.collapsed?.text === foldProbe.initial?.text,
      JSON.stringify({ collapsed: foldProbe.collapsed, initialText: foldProbe.initial?.text }),
    );
    check(
      'L24 collapse survives a panel rebuild and is persisted',
      foldProbe.rebuilt?.folded === true &&
        foldProbe.rebuilt?.hidden === true &&
        foldProbe.rebuilt?.rows === foldProbe.initial?.rows &&
        Array.isArray(foldProbe.stored) &&
        foldProbe.stored.some(key => key === 'g:e2e.g'),
      JSON.stringify({ rebuilt: foldProbe.rebuilt, stored: foldProbe.stored }),
    );
    check(
      'L24 clicking again expands the group',
      foldProbe.reexpanded?.folded === false && foldProbe.reexpanded?.hidden === false,
      JSON.stringify(foldProbe.reexpanded),
    );

    const vanillaRow = await cdp.evaluate(`(() => {
      window.DoLHK.register({ id: 'e2e.vanilla', defaultBind: ['KeyN'], label: 'probe', handler: () => {} });
      const node = document.querySelector('.dolhk-row[data-dolhk="e2e.vanilla"] .dolhk-warn');
      const text = node?.textContent ?? '';
      window.DoLHK.unregister('e2e.vanilla');
      return text;
    })()`);
    check('L22 vanilla collision is reported on the row', /原版|vanilla/i.test(vanillaRow), vanillaRow);

    const removedRows = await cdp.evaluate(`(() => {
      const headers = () => [...document.querySelectorAll('.dolhk-sections .settingsHeader')].map(n => n.textContent);
      const before = headers();
      for (const id of ['e2e.ungrouped', 'e2e.groupA', 'e2e.groupB', 'e2e.groupC', 'e2e.groupD']) window.DoLHK.unregister(id);
      return {
        rows: document.querySelectorAll('.dolhk-row[data-dolhk^="e2e."]').length,
        before,
        after: headers(),
      };
    })()`);
    check(
      'L22 unregister repaints the panel',
      removedRows.rows === 0 && removedRows.after.length === removedRows.before.length - 2,
      JSON.stringify(removedRows),
    );

    if (USE_DECL_FIXTURE) {
      const decl = await cdp.evaluate(`(() => {
        const api = window.DoLHK;
        const row = id => document.querySelector(\`.dolhk-row[data-dolhk="\${id}"]\`);
        const textOf = node => (node ? node.textContent.trim() : '');
        return {
          actBind: api.getBind('fixture.act'),
          actKey: row('fixture.act')?.querySelector('.dolhk-key')?.textContent ?? '',
          actLabel: textOf(row('fixture.act')?.querySelector('.gold')),
          actHint: (() => {
            const anchor = row('fixture.act')?.querySelector('.dolhk-head .tooltip-anchor');
            return anchor ? { text: anchor.textContent, tip: anchor.getAttribute('tooltip') || '' } : null;
          })(),
          actRegistered: Boolean(row('fixture.act')),
          joinRow: Boolean(row('fixture.join')),
          joinedSection: Boolean(row('fixture.act')?.closest('.settingsGrid')) &&
            row('fixture.act')?.closest('.settingsGrid') === row('fixture.join')?.closest('.settingsGrid'),
          declOnlyRow: Boolean(row('fixture.declonly')),
          declOnlyBind: api.getBind('fixture.declonly'),
          typoRegistered: Boolean(row('fixture.typo')),
        };
      })()`);

      check(
        'L23 declaration fills the missing defaultBind, label and hint',
        decl.actRegistered &&
          JSON.stringify(decl.actBind) === '["AltLeft","ShiftLeft","KeyK"]' &&
          decl.actKey === 'Alt + Shift + K' &&
          /夹具动作|Fixture action/.test(decl.actLabel) &&
          decl.actHint?.text.trim() === '(?)' &&
          /夹具说明|Fixture tip/.test(decl.actHint.tip),
        JSON.stringify({ bind: decl.actBind, key: decl.actKey, label: decl.actLabel, hint: decl.actHint }),
      );
      check(
        'L23 a declaration joins a group by id alone',
        decl.joinRow === true && decl.joinedSection === true,
        JSON.stringify({ row: decl.joinRow, sameSection: decl.joinedSection }),
      );
      check(
        'L23 declared-only entry never becomes a row',
        decl.declOnlyRow === false && decl.declOnlyBind === null,
        JSON.stringify({ row: decl.declOnlyRow, bind: decl.declOnlyBind }),
      );
      check(
        'L23 a misnamed addonName leaves the definition unusable',
        decl.typoRegistered === false,
        JSON.stringify({ registered: decl.typoRegistered }),
      );

      await closeOverlayAndSettle(cdp, 300);
      await clearOverlayMark(cdp, true);
      await combo(cdp, ['Alt', 'Shift'], 'KeyK', 'k', 75);
      const fired = await cdp.evaluate(`(window.__declFixture || {}).fired`);
      check('L23 declared binding dispatches the runtime handler', fired === 'act', String(fired));
      await cdp.evaluate(`window.DoLHK.unregister('fixture.act'); true`);
      await openHotkeysTab(cdp);
    }

    const columns = await cdp.evaluate(`(() => {
      const read = sel => getComputedStyle(document.querySelector(sel)).gridTemplateColumns.split(' ').length;
      return { list: read('.dolhk-sections .dolhk-list'), orig: read('.dolhk-orig'), width: document.getElementById('customOverlayContent').clientWidth };
    })()`);
    check('L14 two columns when space allows', columns.list >= 2 && columns.orig >= 2, JSON.stringify(columns));

    await cdp.evaluate(`SugarCube.State.temporary.currentOverlay ? closeOverlay() : true`);
    await sleep(200);
    await pressAlt(cdp, 'S');
    await sleep(900);
    const savesTabCount = await cdp.evaluate(`document.querySelectorAll('#overlayTabs button[data-dolhk-tab]').length`);
    check('L16 hotkeys tab stays out of the saves overlay', savesTabCount === 0, String(savesTabCount));
    await closeOverlayAndSettle(cdp, 250);
    await openHotkeysTab(cdp);

    const setLang = async value => {
      await cdp.evaluate(`(() => {
        const select = document.querySelector('.dolhk-select');
        select.value = '${value}';
        select.dispatchEvent(new Event('change'));
        return true;
      })()`);
      await sleep(500);
      return cdp.evaluate(`({
        row: document.querySelector('.dolhk-row[data-dolhk] .gold')?.textContent ?? '',
        tab: [...document.querySelectorAll('#overlayTabs button')].pop()?.textContent ?? '',
      })`);
    };
    const zhLabels = await setLang('zh');
    const enLabels = await setLang('en');
    check(
      'L10 labels follow the interface language',
      zhLabels.row === '回溯' &&
        zhLabels.tab === '快捷键' &&
        enLabels.row === 'Back' &&
        enLabels.tab === 'Hotkeys',
      JSON.stringify({ zh: zhLabels, en: enLabels }),
    );
    // 后续检查都在 auto 模式下进行，自动探测分支由这些检查顺带覆盖
    await setLang('auto');

    const originalRows = await cdp.evaluate(`document.querySelectorAll('.dolhk-orig-row').length`);
    const snapshotRows = await cdp.evaluate(
      `[...document.querySelectorAll('.dolhk-orig-row')].filter(r => /snapshot/i.test(r.textContent)).length`,
    );
    const modRow = await cdp.evaluate(
      `[...document.querySelectorAll('.dolhk-orig-key')].map(n => n.textContent).some(t => /Alt \\+ M/.test(t))`,
    );
    check(
      'L9 detected bindings listed without snapshot fallback',
      originalRows >= 4 && snapshotRows === 0 && modRow === true,
      `${originalRows} rows, ${snapshotRows} snapshot, mod manager ${modRow}`,
    );

    await closeOverlayAndSettle(cdp, 300);

    await pressAlt(cdp, 'C');
    const overlay = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    await pressAlt(cdp, 'C');
    const closed = await cdp.evaluate(`document.getElementById('customOverlay')?.classList.contains('hidden') ?? false`);
    check('L4 Alt+C toggles characteristics', overlay === 'characteristics' && closed, JSON.stringify({ overlay, closed }));

    const openOverlayWith = async letter => {
      await clearOverlayMark(cdp);
      await pressAlt(cdp, letter);
      return cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    };

    const pages = { T: 'traits', F: 'gameFeats', I: 'statistics' };
    const opened = {};
    for (const [letter, expected] of Object.entries(pages)) opened[letter] = (await openOverlayWith(letter)) === expected;
    check('L15/L19 Alt+T / Alt+F / Alt+I open their pages', Object.values(opened).every(Boolean), JSON.stringify(opened));

    await clearOverlayMark(cdp);
    await cdp.evaluate(`SugarCube.State.variables.cheatsEnabled = false; SugarCube.State.variables.debug = 0; true`);
    await pressAlt(cdp, 'H');
    const cheatsLocked = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    await cdp.evaluate(`SugarCube.State.variables.cheatsEnabled = true; true`);
    const cheatsOpen = await openOverlayWith('H');
    check(
      'L15 cheat hotkey follows the unlock state',
      cheatsLocked !== 'cheats' && cheatsOpen === 'cheats',
      JSON.stringify({ locked: cheatsLocked, unlocked: cheatsOpen }),
    );
    await closeOverlayAndSettle(cdp, 250);

    const safePassage = await cdp.evaluate(
      `['PassageFooter', 'PassageHeader', 'StoryCaption'].find(name => SugarCube.Story.has(name)) ?? 'Start'`,
    );
    const depth = await cdp.evaluate(`(() => {
      if (SugarCube.State.variables.options) SugarCube.State.variables.options.maxStates = 10;
      SugarCube.Config.history.maxStates = 10;
      return SugarCube.Config.history.maxStates;
    })()`);
    console.log(`  history depth raised to ${depth}`);
    for (let i = 0; i < 3; i++) {
      const step = await cdp
        .evaluate(
          `(() => {
            const before = SugarCube.State.length;
            try { SugarCube.Engine.play('${safePassage}'); } catch (e) { return { err: String(e).slice(0, 160), before }; }
            return { before, after: SugarCube.State.length, passage: SugarCube.State.passage };
          })()`,
        )
        .catch(error => ({ err: String(error).slice(0, 160) }));
      console.log(`  history step ${i}: ${JSON.stringify(step)}`);
      await sleep(600);
    }
    const startIndex = await cdp.evaluate('SugarCube.State.activeIndex');
    const historyLength = await cdp.evaluate('SugarCube.State.length');
    await pressCtrl(cdp, 'Z');
    const afterBack = await cdp.evaluate('SugarCube.State.activeIndex');
    check(
      'L4 Ctrl+Z walks history back',
      historyLength > 1 ? afterBack === startIndex - 1 : afterBack === startIndex,
      `${startIndex} -> ${afterBack} (length ${historyLength})`,
    );
    await pressCtrl(cdp, 'X');
    const afterForward = await cdp.evaluate('SugarCube.State.activeIndex');
    check('L4 Ctrl+X walks history forward', afterForward === startIndex, `${afterBack} -> ${afterForward}`);
    await cdp.evaluate(`SugarCube.Engine.play('Start')`);
    await sleep(400);

    await openHotkeysTab(cdp);

    await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="journal"] .dolhk-key').click()`);
    await sleep(120);

    await chord(cdp, ['Ctrl'], [
      { code: 'KeyK', key: 'k', vk: 75 },
      { code: 'KeyJ', key: 'j', vk: 74 },
    ]);
    const boundText = await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="journal"] .dolhk-key').textContent`);
    const stored = await cdp.evaluate(
      `JSON.parse(localStorage.getItem('dol-hotkeys:config') || '{}')?.binds?.journal?.join('|') ?? ''`,
    );
    check(
      'L5 chord captured, rendered and persisted as one ordered bind',
      boundText === 'Ctrl + K + J' && stored === 'ControlLeft|KeyK|KeyJ',
      JSON.stringify({ boundText, stored }),
    );

    await closeOverlayAndSettle(cdp, 300);
    await clearOverlayMark(cdp, true);
    await holdChord(cdp, ['Ctrl'], [
      { code: 'KeyK', key: 'k', vk: 75 },
      { code: 'KeyJ', key: 'j', vk: 74 },
    ]);
    const journalOpened = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L5 chord works in game', journalOpened === 'journal', journalOpened);

    await closeOverlayAndSettle(cdp, 200);
    await openHotkeysTab(cdp);

    await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="traits"] .dolhk-key').click()`);
    await sleep(140);
    await holdChord(cdp, ['Ctrl'], [
      { code: 'KeyA', key: 'a', vk: 65 },
      { code: 'KeyB', key: 'b', vk: 66 },
    ]);
    const chordText = await cdp.evaluate(
      `document.querySelector('.dolhk-row[data-dolhk="traits"] .dolhk-key').textContent`,
    );
    check('L17 held chord captured as one combination', chordText === 'Ctrl + A + B', chordText);

    await closeOverlayAndSettle(cdp, 250);
    await clearOverlayMark(cdp, true);
    await holdChord(cdp, ['Ctrl'], [
      { code: 'KeyA', key: 'a', vk: 65 },
      { code: 'KeyB', key: 'b', vk: 66 },
    ]);
    const traitsOpened = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L17 chord triggers the action in game', traitsOpened === 'traits', traitsOpened);

    await closeOverlayAndSettle(cdp, 200);
    await openHotkeysTab(cdp);

    const beforeCancel = await cdp.evaluate(
      `document.querySelector('.dolhk-row[data-dolhk="saves"] .dolhk-key').textContent`,
    );
    await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="saves"] .dolhk-key').click()`);
    await sleep(100);
    await combo(cdp, [], 'Escape', 'Escape', 27);
    const afterCancel = await cdp.evaluate(
      `document.querySelector('.dolhk-row[data-dolhk="saves"] .dolhk-key').textContent`,
    );
    check('L6 Esc cancels capture and restores the old binding', afterCancel === beforeCancel, `${afterCancel}`);

    await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="social"] .dolhk-key').click()`);
    await sleep(100);
    await combo(cdp, [], 'Backspace', 'Backspace', 8);
    const clearedText = await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="social"] .dolhk-key').textContent`);
    const clearedStored = await cdp.evaluate(
      `JSON.parse(localStorage.getItem('dol-hotkeys:config') || '{}')?.binds?.social?.length ?? -1`,
    );
    check('L6 Backspace clears the binding', clearedStored === 0, clearedText);

    await closeOverlayAndSettle(cdp, 250);
    await clearOverlayMark(cdp);
    await pressAlt(cdp, 'R');
    const afterClear = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L6 cleared action no longer responds', afterClear !== 'social', afterClear);

    await openHotkeysTab(cdp);
    await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="saves"] .dolhk-key').click()`);
    await sleep(100);
    await combo(cdp, ['Ctrl'], 'KeyS', 's', 83);
    const warnText = await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="saves"] .dolhk-warn').textContent`);
    const warnStored = await cdp.evaluate(
      `JSON.parse(localStorage.getItem('dol-hotkeys:config') || '{}')?.binds?.saves?.join('|') ?? ''`,
    );
    check('L7 browser reserved combo warns but still saves', warnStored === 'ControlLeft|KeyS' && warnText.length > 0, warnText);

    await closeOverlayAndSettle(cdp, 250);
    await clearOverlayMark(cdp);
    await cdp.evaluate(
      `(() => { const i = document.createElement('input'); i.id = 'hkProbe'; document.body.appendChild(i); i.focus(); return document.activeElement.id; })()`,
    );
    await pressAlt(cdp, 'O');
    const afterInput = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L8 typing inside an input does not trigger hotkeys', afterInput !== 'options', afterInput);
    await cdp.evaluate(`document.getElementById('hkProbe')?.remove(); true`);

    await openHotkeysTab(cdp);

    const captureMouse = async (action, button) => {
      await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="${action}"] .dolhk-key').click()`);
      await sleep(160);
      const point = await centerOf(cdp, `.dolhk-row[data-dolhk="${action}"] .dolhk-key`);
      await mouseClick(cdp, button, point);
      return cdp.evaluate(`({
        text: document.querySelector('.dolhk-row[data-dolhk="${action}"] .dolhk-key').textContent,
        stored: JSON.parse(localStorage.getItem('dol-hotkeys:config') || '{}')?.binds?.${action}?.join('|') ?? '',
      })`);
    };

    const middle = await captureMouse('saves', 'middle');
    const sideBack = await captureMouse('journal', 'back');
    const sideForward = await captureMouse('feats', 'forward');
    check(
      'L18 mouse buttons record their own codes',
      middle.text === 'Middle' &&
        middle.stored === 'Mouse1' &&
        sideBack.text === 'Side 1' &&
        sideBack.stored === 'Mouse3' &&
        sideForward.text === 'Side 2' &&
        sideForward.stored === 'Mouse4',
      JSON.stringify({ middle, sideBack, sideForward }),
    );

    await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="characteristics"] .dolhk-key').click()`);
    await sleep(160);
    const chordPoint = await centerOf(cdp, '.dolhk-row[data-dolhk="characteristics"] .dolhk-key');
    await keyEvent(cdp, 'keyDown', { code: 'ControlLeft', key: 'Control', vk: 17, modifiers: 0 });
    await mouseClick(cdp, 'middle', chordPoint, 2);
    await keyEvent(cdp, 'keyUp', { code: 'ControlLeft', key: 'Control', vk: 17, modifiers: 0 });
    await sleep(200);
    const mouseChord = await cdp.evaluate(`({
      text: document.querySelector('.dolhk-row[data-dolhk="characteristics"] .dolhk-key').textContent,
      stored: JSON.parse(localStorage.getItem('dol-hotkeys:config') || '{}')?.binds?.characteristics?.join('|') ?? '',
    })`);
    check(
      'L18 modifier plus mouse button forms one chord',
      mouseChord.text === 'Ctrl + Middle' && mouseChord.stored === 'ControlLeft|Mouse1',
      JSON.stringify(mouseChord),
    );

    const idle = { x: 700, y: 560 };
    await closeOverlayAndSettle(cdp, 300);
    await clearOverlayMark(cdp, true);
    await mouseClick(cdp, 'middle', idle);
    const mouseOpened = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    await closeOverlayAndSettle(cdp, 250);
    await clearOverlayMark(cdp);
    await mouseClick(cdp, 'back', idle);

    const sideOpened = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check(
      'L18 mouse buttons trigger their actions in game',
      mouseOpened === 'saves' && sideOpened === 'journal',
      JSON.stringify({ middle: mouseOpened, side: sideOpened }),
    );
    await closeOverlayAndSettle(cdp, 300);

    await cdp.evaluate(`window.cordova = { exec: (ok, fail, service, action, args) => {
      (window.__cordovaLog = window.__cordovaLog || []).push({ service, action, args });
    } }; true`);
    await cdp.evaluate(`window.__confirmCalled = false; window.confirm = () => { window.__confirmCalled = true; return false; }; true`);
    await openHotkeysTab(cdp);

    const radioState = () =>
      cdp.evaluate(`(() => {
        const inputs = [...document.querySelectorAll('input[name="dolhk-volume"]')];
        const config = JSON.parse(localStorage.getItem('dol-hotkeys:config') || '{}');
        return {
          values: inputs.map(node => node.value),
          disabled: inputs.some(node => node.disabled),
          checked: inputs.filter(node => node.checked).map(node => node.value),
          volumeKeys: config.volumeKeys ?? null,
          volumeInvert: config.volumeInvert ?? null,
        };
      })()`);

    const initialRadios = await radioState();
    check(
      'L20 volume row renders three native radios',
      initialRadios.values.join(',') === 'off,on,invert' &&
        initialRadios.disabled === false &&
        initialRadios.checked.join(',') === 'off',
      JSON.stringify(initialRadios),
    );

    const pickVolume = async value => {
      await cdp.evaluate(`document.querySelector('input[name="dolhk-volume"][value="${value}"]').click(); true`);
      await sleep(400);
    };

    await pickVolume('on');
    const dialogShown = await cdp.evaluate(`({
      open: Boolean(window.SugarCube && SugarCube.Dialog && SugarCube.Dialog.isOpen('dolhk-dialog-host')),
      buttons: [...document.querySelectorAll('.dolhk-dialog-actions button')].map(node => node.textContent),
      confirmCalled: window.__confirmCalled,
      hostClass: (SugarCube.Dialog.body ? (SugarCube.Dialog.body() || {}).className : '') || '',
    })`);
    check(
      'L20 enabling volume keys opens the native dialog, not window.confirm',
      dialogShown.open && dialogShown.confirmCalled === false && dialogShown.buttons.length === 2 &&
        dialogShown.hostClass.includes('dolhk-dialog-host'),
      JSON.stringify(dialogShown),
    );

    await cdp.evaluate(`[...document.querySelectorAll('.dolhk-dialog-actions button')][0].click(); true`);
    await sleep(400);
    const cancelState = await radioState();
    check(
      'L20 cancelling the dialog keeps the volume keys off',
      cancelState.checked.join(',') === 'off' && cancelState.volumeKeys === false,
      JSON.stringify(cancelState),
    );

    await pickVolume('on');
    await cdp.evaluate(`[...document.querySelectorAll('.dolhk-dialog-actions button')][1].click(); true`);
    await sleep(400);
    const enabledState = await radioState();
    const enableLog = await cdp.evaluate(`(window.__cordovaLog || []).map(c => ({
      action: c.action,
      button: Array.isArray(c.args) ? c.args[0] : null,
      on: Array.isArray(c.args) ? c.args[1] : null,
    }))`);
    const overridesOn = enableLog.filter(c => c.action === 'overrideButton' && c.on === true);
    check(
      'L20 confirming applies the override to both buttons via CoreAndroid',
      enabledState.checked.join(',') === 'on' &&
        enabledState.volumeKeys === true &&
        enabledState.volumeInvert === false &&
        overridesOn.length >= 2 &&
        new Set(overridesOn.map(c => c.button)).size === 2 &&
        enableLog.every(c => c.action === 'overrideButton' || c.action === undefined),
      JSON.stringify({ ...enabledState, log: enableLog.slice(-4) }),
    );

    await pickVolume('invert');
    const invertState = await radioState();
    const dialogAfterInvert = await cdp.evaluate(
      `Boolean(SugarCube.Dialog && SugarCube.Dialog.isOpen('dolhk-dialog-host'))`,
    );
    check(
      'L20 switching to inverted needs no second dialog',
      invertState.checked.join(',') === 'invert' &&
        invertState.volumeKeys === true &&
        invertState.volumeInvert === true &&
        dialogAfterInvert === false,
      JSON.stringify({ ...invertState, dialog: dialogAfterInvert }),
    );

    await pickVolume('off');
    const offState = await radioState();
    const releaseLog = await cdp.evaluate(`(window.__cordovaLog || []).slice(-2).map(c => ({
      action: c.action,
      button: Array.isArray(c.args) ? c.args[0] : null,
      on: Array.isArray(c.args) ? c.args[1] : null,
    }))`);
    check(
      'L20 choosing disabled releases the override',
      offState.checked.join(',') === 'off' &&
        offState.volumeKeys === false &&
        releaseLog.length === 2 &&
        releaseLog.every(c => c.action === 'overrideButton' && c.on === false),
      JSON.stringify({ ...offState, log: releaseLog }),
    );

    await cdp.evaluate(`delete window.cordova; true`);
    await sleep(200);

    const vanillaRefresh = await cdp.evaluate(`(() => {
      const texts = () => [...document.querySelectorAll('.dolhk-orig-row')].map(node => node.textContent).join('|');
      const redetect = () => document.querySelector('.dolhk-tools .dolhk-btn')?.click();
      const before = texts();
      const trap = window.Mousetrap;
      if (!trap) return { skip: 'no mousetrap' };
      // reset() 会真的清空游戏自己的绑定、unbind() 会原地改写同一个表，测完必须按内容装回去
      const copyTable = table => {
        const out = {};
        for (const key of Object.keys(table ?? {})) out[key] = Array.isArray(table[key]) ? [...table[key]] : table[key];
        return out;
      };
      const savedCallbacks = copyTable(trap._callbacks);
      const savedDirectMap = copyTable(trap._directMap);
      const savedBindings = (window.__DoLHKEarly?.bindings ?? []).map(b => ({ ...b, combos: [...b.combos] }));

      trap.unbind('n');
      redetect();
      const afterUnbind = texts();
      trap.reset();
      redetect();
      const afterReset = texts();

      trap._callbacks = {};
      for (const key of Object.keys(savedCallbacks)) trap._callbacks[key] = savedCallbacks[key];
      trap._directMap = {};
      for (const key of Object.keys(savedDirectMap)) trap._directMap[key] = savedDirectMap[key];
      if (window.__DoLHKEarly) window.__DoLHKEarly.bindings = savedBindings;
      redetect();
      const restored = texts();
      return { before, afterUnbind, afterReset, restored };
    })()`);
    check(
      'L9 vanilla list follows Mousetrap unbind and reset',
      !vanillaRefresh.skip && vanillaRefresh.before !== vanillaRefresh.afterUnbind && vanillaRefresh.afterUnbind !== vanillaRefresh.afterReset,
      JSON.stringify({ before: vanillaRefresh.before?.slice(0, 60), afterUnbind: vanillaRefresh.afterUnbind?.slice(0, 60) }),
    );
    check(
      'L9 mousetrap state restored after the probe',
      vanillaRefresh.skip || vanillaRefresh.restored === vanillaRefresh.before,
      JSON.stringify({ before: vanillaRefresh.before?.slice(0, 80), restored: vanillaRefresh.restored?.slice(0, 80) }),
    );

    const hotkeyErrors = cdp.errors.filter(text => /dol-hotkeys|hotkeys\.js|hotkeys-early\.js/.test(text));
    check('L2 no mod related console errors', hotkeyErrors.length === 0, hotkeyErrors.slice(0, 3).join(' | '));

    await openHotkeysTab(cdp);
    await sleep(600);

    const shotLang = process.env.HK_SHOT_LANG;
    if (shotLang) {
      await cdp.evaluate(`(() => {
        const select = document.querySelector('.dolhk-select');
        select.value = '${shotLang}';
        select.dispatchEvent(new Event('change'));
        return true;
      })()`);
      await sleep(500);
    }

    // HK_SHOT_FOLD=<标题前缀>：截图前收起该分区，用于人工核对折叠态样式
    const shotFold = process.env.HK_SHOT_FOLD;
    if (shotFold) {
      await cdp.evaluate(`(() => {
        const head = [...document.querySelectorAll('.dolhk .settingsHeader')]
          .find(node => node.textContent.includes(${JSON.stringify(shotFold)}));
        if (head && head.getAttribute('aria-expanded') === 'true') head.click();
        return Boolean(head);
      })()`);
      await sleep(300);
    }

    const shotReady = await cdp.evaluate(`(() => {
      const panel = document.querySelector('.dolhk');
      if (!panel) return 'missing';
      document.body.innerHTML = '';
      document.body.style.cssText = 'background:#141414;visibility:visible;';
      const host = document.createElement('div');
      host.style.cssText = 'max-width:880px;margin:0 auto;padding:12px;';
      document.body.appendChild(host);
      host.appendChild(panel);
      return 'ok';
    })()`);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 1400,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(400);
    console.log(`  panel standalone: ${shotReady}`);

    // HK_SHOT_HINT=1：把第一个 (?) 悬停出来核对弹层
    // 必须在 body 重建之后：弹层挂在 body 上，先前建会被 innerHTML 清掉
    if (process.env.HK_SHOT_HINT) {
      await cdp.evaluate(`(() => {
        const anchor = document.querySelector('.dolhk-radios .tooltip-anchor')
          ?? document.querySelector('.dolhk .tooltip-anchor');
        if (!anchor) return false;
        const rect = anchor.getBoundingClientRect();
        anchor.dispatchEvent(new MouseEvent('mouseover', {
          bubbles: true,
          clientX: Math.round(rect.left + rect.width / 2),
          clientY: Math.round(rect.bottom),
          relatedTarget: document.body,
        }));
        return true;
      })()`);
      await sleep(500);
      const popups = await cdp.evaluate(`document.querySelectorAll('.tooltip-popup').length`);
      console.log(`  hint popups: ${popups}`);
    }

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(OUTPUT_DIR, SHOT_NAME), Buffer.from(shot.data, 'base64'));
    console.log(`  screenshot -> ${path.relative(root, path.join(OUTPUT_DIR, SHOT_NAME))}`);

    const otherErrors = cdp.errors.filter(text => !/dol-hotkeys|hotkeys\.js/.test(text));
    if (otherErrors.length) {
      console.log(`  (page reported ${otherErrors.length} unrelated console errors)`);
      for (const text of otherErrors.slice(0, 3)) console.log(`   · ${text.slice(0, 180)}`);
    }
  } finally {
    try {
      cdp?.ws.close();
    } catch {
      /* ignore */
    }
    browser?.kill();
    server.close();
    await sleep(500);
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  const failed = results.filter(item => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    process.exitCode = 1;
    for (const item of failed) console.log(`  failed: ${item.name} ${item.detail}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
