import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync } from 'fflate';

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
        /* page may be navigating or busy */
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

async function main() {
  if (!existsSync(GAME_HTML)) {
    throw new Error(`Game build missing: ${GAME_HTML}\nRun the ModLoader build download first.`);
  }

  const zip = await buildModZip();
  check('L1 mod zip produced', zip.length > 1000, `${(zip.length / 1024).toFixed(1)} KiB`);

  const original = await readFile(GAME_HTML, 'utf8');
  const marker = 'window.modDataValueZipList = [';
  if (!original.includes(marker)) throw new Error('Cannot find the mod injection marker in the game HTML');
  let patched = original.replace(marker, `${marker}"${zip.toString('base64')}",`);
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
    if (process.env.HK_PROBE === 'orig') {
      await cdp.evaluate(`SugarCube.State.temporary.currentOverlay ? closeOverlay() : true`);
      await sleep(200);
      await pressAlt(cdp, 'O');
      await cdp.waitFor(`document.querySelector('#overlayTabs button[data-dolhk-tab]')`, 15000);
      await cdp.evaluate(`document.querySelector('#overlayTabs button[data-dolhk-tab]').click()`);
      await cdp.waitFor(`document.querySelector('.dolhk-orig-row')`, 15000);
      await sleep(400);
      const dump = await cdp.evaluate(`({
        source: document.querySelector('.dolhk-tools .dolhk-muted')?.textContent ?? '',
        rows: [...document.querySelectorAll('.dolhk-orig-row')].map(r => ({
          keys: r.querySelector('.dolhk-orig-key')?.textContent ?? '',
          desc: r.querySelector('.dolhk-orig-desc')?.textContent ?? '',
          snap: /snapshot/i.test(r.textContent),
        })),
      })`);
      console.log('source:', dump.source);
      for (const row of dump.rows) {
        console.log(`  ${row.keys.padEnd(26)} | ${row.desc}${row.snap ? '  [snapshot]' : ''}`);
      }
      process.exit(0);
    }
    if (process.env.HK_PROBE === 'keys') {
      const info = await cdp.evaluate(`(() => {
        const reg = window.__DoLHKEarly || {};
        const nat = (reg.native || []).map(x => String(x.src));
        const $ = window.jQuery;
        const jq = [];
        for (const [label, el] of [['document', document], ['window', window]]) {
          const ev = $ && $._data ? $._data(el, 'events') : null;
          if (!ev) continue;
          for (const type of Object.keys(ev)) {
            for (const item of ev[type] || []) {
              if (typeof item.handler === 'function') jq.push({ t: label + ':' + type, s: String(item.handler) });
            }
          }
        }
        const pick = list => list.map(x => (typeof x === 'string' ? x : x.s));
        const all = [...pick(nat), ...pick(jq)];
        const hits = all.filter(s => /linkFollow/i.test(s));
        return {
          native: nat.length,
          bindingKeys: (reg.bindings || []).map(b => b.keys),
          bindingCount: (reg.bindings || []).length,
          jq: jq.map(x => x.t),
          jqCount: jq.length,
          linkFollowHits: hits.length,
          hasJqueryData: Boolean($ && $._data),
          firstHit: hits[0] ? hits[0].replace(/\s+/g, ' ').slice(0, 300) : null,
          hasCases: hits.map(h => (h.match(/case\s*"/g) || []).length).slice(0, 5),
        };
      })()`);
      console.log('keys:', JSON.stringify(info, null, 1));
      process.exit(0);
    }
    if (process.env.HK_PROBE === 'env') {
      const mods = await cdp.evaluate(`(() => {
        const m = window.modSC2DataManager;
        const c = m && m.getModLoadController ? m.getModLoadController() : null;
        return {
          hasManager: Boolean(m),
          controllerKeys: c ? Object.keys(c).slice(0, 24) : null,
          early: typeof window.__DoLHKEarly,
          dolhk: typeof window.DoLHK,
        };
      })()`);
      console.log('mods:', JSON.stringify(mods));
      const picked = cdp.logs.filter(l => /hotkey|Hotkey|HotKeys|validateBoot|modList|initMod|inject|ModLoader =/.test(l));
      console.log(`--- loader logs (${picked.length}/${cdp.logs.length}) ---`);
      for (const line of picked.slice(0, 40)) console.log(`  ${line}`);
      process.exit(0);
    }
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
    check('L2 tab label available', typeof (await cdp.evaluate('window.DoLHK && window.DoLHK.label')) === 'string');

    if (process.env.HK_PROBE === 'sidebar') {
      await cdp.evaluate(`SugarCube.State.variables.intro = 0; true`);
      const dump = async label => {
        const info = await cdp.evaluate(`(() => {
          const ov = document.getElementById('customOverlay');
          const content = document.getElementById('customOverlayContent');
          const tabs = [...document.querySelectorAll('#overlayTabs button')];
          let handler = '';
          try {
            const ev = window.jQuery ? window.jQuery._data(tabs[0], 'events') : null;
            const click = ev && ev.click;
            handler = click && click[0] ? String(click[0].handler).replace(/\s+/g, ' ').slice(0, 300) : '';
          } catch (e) { handler = 'err:' + e.message; }
          const cls = content ? [...content.querySelectorAll('[class]')].map(n => n.className) : [];
          return {
            dataOverlay: ov ? ov.getAttribute('data-overlay') : null,
            currentOverlay: SugarCube.State.temporary.currentOverlay ?? null,
            tempKey: SugarCube.State.temporary.key ?? null,
            hidden: ov ? ov.classList.contains('hidden') : null,
            tabs: tabs.map(b => b.textContent),
            handler,
            classes: [...new Set(cls.filter(c => typeof c === 'string'))].slice(0, 16),
            injected: Boolean(document.querySelector('button[data-dolhk-tab]')),
          };
        })()`);
        console.log(`PROBE ${label}: ${JSON.stringify(info)}`);
      };
      const clickSidebar = async index => {
        const ok = await cdp.evaluate(`(() => {
          const bar = document.getElementById('overlayButtons');
          if (!bar) return false;
          const splits = [...bar.querySelectorAll('.sidebarButtonSplit')];
          const tail = splits[splits.length - 1];
          const btn = tail.querySelectorAll('button')[${index}];
          if (!btn) return false;
          btn.click();
          return true;
        })()`);
        await sleep(1200);
        return ok;
      };
      console.log('PROBE sidebar options clickable:', await clickSidebar(0));
      await dump('options-by-sidebar');
      await cdp.evaluate(`closeOverlay()`);
      await sleep(500);
      console.log('PROBE sidebar saves clickable:', await clickSidebar(1));
      await dump('saves-by-sidebar');
      await cdp.evaluate(`(() => { const t = [...document.querySelectorAll('#overlayTabs button')]; if (t.length > 1) t[t.length - 1].click(); return true; })()`);
      await sleep(1200);
      await dump('saves-export-by-sidebar');
      process.exit(0);
    }

    const dismissed = await cdp.evaluate(`(() => {
      if (!window.SugarCube?.Dialog?.isOpen?.()) return 'none';
      SugarCube.Dialog.close();
      return 'closed';
    })()`);
    check('L2 age gate dismissed', true, dismissed);
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
    check('L13 journal hotkey is inert on the menu', menuOverlay !== 'journal', menuOverlay);

    await cdp.evaluate(`SugarCube.State.variables.intro = 0; true`);
    await pressAlt(cdp, 'J');
    const gameOverlay = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L13 journal hotkey works in game', gameOverlay === 'journal', gameOverlay);
    await cdp.evaluate(`closeOverlay()`);
    await sleep(250);

    await pressAlt(cdp, 'O');
    await cdp.waitFor(`document.querySelector('#overlayTabs button')`);

    const tabLabels = await cdp.evaluate(`[...document.querySelectorAll('#overlayTabs button')].map(b => b.textContent)`);
    const tabCount = await cdp.evaluate(`document.querySelectorAll('#overlayTabs button[data-dolhk-tab]').length`);
    check('L3 hotkeys tab injected into the settings overlay', tabCount === 1, tabLabels.join(' / '));

    await cdp.evaluate(`document.querySelector('#overlayTabs button[data-dolhk-tab]').click()`);
    const panelReady = await cdp.waitFor(`document.querySelector('.dolhk')`);
    check('L3 panel renders', panelReady);

    const rows = await cdp.evaluate(`[...document.querySelectorAll('.dolhk-row[data-dolhk]')].map(r => r.dataset.dolhk)`);
    check('L3 eleven bindable actions listed', rows.length === 11, rows.join(','));
    check(
      'L3 new pages are listed',
      ['traits', 'statistics', 'feats', 'cheats'].every(id => rows.includes(id)),
      rows.join(','),
    );
    check(
      'L3 statistics sits right before feats',
      rows.indexOf('statistics') === rows.indexOf('feats') - 1,
      rows.join(','),
    );

    const defaultKeys = await cdp.evaluate(`({
      back: document.querySelector('.dolhk-row[data-dolhk="back"] .dolhk-key').textContent,
      forward: document.querySelector('.dolhk-row[data-dolhk="forward"] .dolhk-key').textContent,
    })`);
    check(
      'L3 back/forward default to Ctrl + Z / Ctrl + X',
      defaultKeys.back === 'Ctrl + Z' && defaultKeys.forward === 'Ctrl + X',
      JSON.stringify(defaultKeys),
    );

    const columns = await cdp.evaluate(`(() => {
      const read = sel => getComputedStyle(document.querySelector(sel)).gridTemplateColumns.split(' ').length;
      return { list: read('.dolhk-list'), orig: read('.dolhk-orig'), width: document.getElementById('customOverlayContent').clientWidth };
    })()`);
    check('L14 two columns when space allows', columns.list >= 2 && columns.orig >= 2, JSON.stringify(columns));

    const origDesc = await cdp.evaluate(`(() => {
      const node = document.querySelector('.dolhk-orig-desc');
      if (!node) return 'missing';
      const style = getComputedStyle(node);
      return style.textAlign + '/' + Math.round(node.getBoundingClientRect().right);
    })()`);
    check('L14 vanilla descriptions are right aligned', String(origDesc).startsWith('right'), origDesc);

    await cdp.evaluate(`SugarCube.State.temporary.currentOverlay ? closeOverlay() : true`);
    await sleep(200);
    await pressAlt(cdp, 'S');
    await sleep(900);
    const savesTabCount = await cdp.evaluate(`document.querySelectorAll('#overlayTabs button[data-dolhk-tab]').length`);
    check('L16 hotkeys tab stays out of the saves overlay', savesTabCount === 0, String(savesTabCount));
    await cdp.evaluate(`closeOverlay()`);
    await sleep(250);
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
    check('L10 chinese labels render', zhLabels.row === '回溯' && zhLabels.tab === '快捷键', JSON.stringify(zhLabels));
    const enLabels = await setLang('en');
    check('L10 english labels render', enLabels.row === 'Back' && enLabels.tab === 'Hotkeys', JSON.stringify(enLabels));
    const autoLabels = await setLang('auto');
    check('L10 auto mode restores detection', autoLabels.row.length > 0, JSON.stringify(autoLabels));

    const originalRows = await cdp.evaluate(`document.querySelectorAll('.dolhk-orig-row').length`);
    const snapshotRows = await cdp.evaluate(
      `[...document.querySelectorAll('.dolhk-orig-row')].filter(r => /snapshot/i.test(r.textContent)).length`,
    );
    check('L9 vanilla hotkey list rendered', originalRows >= 4, `${originalRows} rows`);
    check('L9 list has no stale snapshot rows', snapshotRows === 0, `${snapshotRows} snapshot rows`);
    const sourceLabel = await cdp.evaluate(`document.querySelector('.dolhk-tools .dolhk-muted')?.textContent ?? ''`);
    check('L9 vanilla list marked as detected', /动态检测|Detected/.test(sourceLabel), sourceLabel);
    const modRow = await cdp.evaluate(
      `[...document.querySelectorAll('.dolhk-orig-key')].map(n => n.textContent).some(t => /Alt \\+ M/.test(t))`,
    );
    check('L9 mod manager hotkey detected', modRow);

    await cdp.evaluate(`closeOverlay()`);
    await sleep(300);

    await pressAlt(cdp, 'C');
    const overlay = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L4 Alt+C opens characteristics', overlay === 'characteristics', overlay);

    await pressAlt(cdp, 'C');
    const closed = await cdp.evaluate(`document.getElementById('customOverlay')?.classList.contains('hidden') ?? false`);
    check('L4 Alt+C again closes the overlay', closed);

    const openOverlayWith = async letter => {
      await cdp.evaluate(`document.getElementById('customOverlay').setAttribute('data-overlay', 'none'); true`);
      await pressAlt(cdp, letter);
      return cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    };

    check('L15 Alt+T opens traits', (await openOverlayWith('T')) === 'traits');
    check('L15 Alt+F opens feats', (await openOverlayWith('F')) === 'gameFeats');
    check('L19 Alt+I opens statistics', (await openOverlayWith('I')) === 'statistics');
    await cdp.evaluate(`document.getElementById('customOverlay').setAttribute('data-overlay', 'none'); true`);
    await cdp.evaluate(`SugarCube.State.variables.cheatsEnabled = false; SugarCube.State.variables.debug = 0; true`);
    await pressAlt(cdp, 'H');
    const cheatsLocked = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L15 cheat hotkey inert while cheats are locked', cheatsLocked !== 'cheats', cheatsLocked);
    await cdp.evaluate(`SugarCube.State.variables.cheatsEnabled = true; true`);
    check('L15 cheat hotkey opens cheats when unlocked', (await openOverlayWith('H')) === 'cheats');
    await cdp.evaluate(`closeOverlay()`);
    await sleep(250);

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
    const capturing = await cdp.evaluate(
      `document.querySelector('.dolhk-row[data-dolhk="journal"] .dolhk-key').classList.contains('dolhk-capturing')`,
    );
    check('L5 key box enters capture mode', capturing);

    await chord(cdp, ['Ctrl'], [
      { code: 'KeyK', key: 'k', vk: 75 },
      { code: 'KeyJ', key: 'j', vk: 74 },
    ]);
    const boundText = await cdp.evaluate(`document.querySelector('.dolhk-row[data-dolhk="journal"] .dolhk-key').textContent`);
    check('L5 sequence captured and rendered', /Ctrl \+ K.*→.*Ctrl \+ J/.test(boundText), boundText);
    const stored = await cdp.evaluate(
      `JSON.parse(localStorage.getItem('dol-hotkeys:config') || '{}')?.binds?.journal?.join('|') ?? ''`,
    );
    check('L5 sequence persisted to localStorage', stored === 'Ctrl+KeyK|Ctrl+KeyJ', stored);

    await cdp.evaluate(`closeOverlay()`);
    await sleep(300);
    await cdp.evaluate(`delete SugarCube.State.temporary.currentOverlay; document.getElementById('customOverlay').setAttribute('data-overlay', 'none'); true`);
    await combo(cdp, ['Ctrl'], 'KeyK', 'k', 75);
    await combo(cdp, ['Ctrl'], 'KeyJ', 'j', 74);
    const journalOpened = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L5 sequence works in game', journalOpened === 'journal', journalOpened);

    await cdp.evaluate(`closeOverlay()`);
    await sleep(200);
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
    const chordStored = await cdp.evaluate(
      `JSON.parse(localStorage.getItem('dol-hotkeys:config') || '{}')?.binds?.traits?.join('|') ?? ''`,
    );
    check('L17 chord persisted as a single step', chordStored === 'Ctrl+KeyA,KeyB', chordStored);

    await cdp.evaluate(`closeOverlay()`);
    await sleep(250);
    await cdp.evaluate(`delete SugarCube.State.temporary.currentOverlay; document.getElementById('customOverlay').setAttribute('data-overlay', 'none'); true`);
    await holdChord(cdp, ['Ctrl'], [
      { code: 'KeyA', key: 'a', vk: 65 },
      { code: 'KeyB', key: 'b', vk: 66 },
    ]);
    const traitsOpened = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L17 chord triggers the action in game', traitsOpened === 'traits', traitsOpened);

    await cdp.evaluate(`closeOverlay()`);
    await sleep(200);
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

    await cdp.evaluate(`closeOverlay()`);
    await sleep(250);
    await cdp.evaluate(`document.getElementById('customOverlay').setAttribute('data-overlay', 'none'); true`);
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
    check('L7 browser reserved combo warns but still saves', warnStored === 'Ctrl+KeyS' && warnText.length > 0, warnText);

    await cdp.evaluate(`closeOverlay()`);
    await sleep(250);
    await cdp.evaluate(`document.getElementById('customOverlay').setAttribute('data-overlay', 'none'); true`);
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
    check(
      'L18 middle button recorded as its own code',
      middle.text === 'Middle' && middle.stored === 'Mouse1',
      JSON.stringify(middle),
    );
    const sideBack = await captureMouse('journal', 'back');
    check(
      'L18 back side button recorded as its own code',
      sideBack.text === 'Back' && sideBack.stored === 'Mouse3',
      JSON.stringify(sideBack),
    );
    const sideForward = await captureMouse('feats', 'forward');
    check(
      'L18 forward side button recorded as its own code',
      sideForward.text === 'Forward' && sideForward.stored === 'Mouse4',
      JSON.stringify(sideForward),
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
      mouseChord.text === 'Ctrl + Middle' && mouseChord.stored === 'Ctrl+Mouse1',
      JSON.stringify(mouseChord),
    );

    const idle = { x: 700, y: 560 };
    await cdp.evaluate(`closeOverlay()`);
    await sleep(300);
    await cdp.evaluate(`delete SugarCube.State.temporary.currentOverlay; document.getElementById('customOverlay').setAttribute('data-overlay', 'none'); true`);
    await mouseClick(cdp, 'middle', idle);
    const mouseOpened = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L18 middle button triggers its action in game', mouseOpened === 'saves', mouseOpened);
    await cdp.evaluate(`closeOverlay()`);
    await sleep(250);
    await cdp.evaluate(`document.getElementById('customOverlay').setAttribute('data-overlay', 'none'); true`);
    await mouseClick(cdp, 'back', idle);
    const sideOpened = await cdp.evaluate(`document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? ''`);
    check('L18 side button triggers its action in game', sideOpened === 'journal', sideOpened);
    await cdp.evaluate(`closeOverlay()`);
    await sleep(300);

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
