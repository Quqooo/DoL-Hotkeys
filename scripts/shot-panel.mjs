// 只渲染 Hotkeys 面板并截图，用于快速目视检查（不跑完整 e2e）
// 用法：node scripts/shot-panel.mjs [输出文件名]
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
const research = path.resolve(root, '..', '_research');
const GAME_HTML = process.env.HK_GAME_HTML ?? path.join(research, 'mlbuild', 'Degrees of Lewdity VERSION.html.sc2patch.html.mod.html');
const IMAGE_DIR = process.env.HK_IMAGE_DIR ?? path.join(research, 'mlbuild', 'img');
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

const sleep = ms => new Promise(done => setTimeout(done, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !this.pending.has(msg.id)) return;
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
      else resolve(msg.result);
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
      }, 120000);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) {
      throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
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
        /* 页面可能忙 */
      }
      await sleep(250);
    }
    return false;
  }
}

async function buildZip() {
  const dist = path.join(root, 'dist');
  const files = {};
  for (const name of await readdir(dist)) {
    if (name.endsWith('.zip')) continue;
    files[name] = new Uint8Array(await readFile(path.join(dist, name)));
  }
  return Buffer.from(zipSync(files, { level: 9 }));
}

async function main() {
  const out = path.resolve(root, 'test-output', process.argv[2] ?? 'panel-default.png');
  const zip = await buildZip();
  const original = await readFile(GAME_HTML, 'utf8');
  const marker = 'window.modDataValueZipList = [';
  const html = original.replace(marker, `${marker}"${zip.toString('base64')}",`);

  const workDir = await mkdtemp(path.join(tmpdir(), 'dolhk-shot-'));
  const profileDir = path.join(workDir, 'profile');
  await mkdir(profileDir, { recursive: true });
  await mkdir(path.dirname(out), { recursive: true });

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
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(await readFile(file));
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

  const port = 41736;
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));

  const browser = BROWSERS.find(candidate => existsSync(candidate));
  const child = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-extensions',
    '--window-size=1400,1000',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    `http://127.0.0.1:${port}/game.html`,
  ], { stdio: 'ignore' });

  try {
    const portFile = path.join(profileDir, 'DevToolsActivePort');
    let devPort = 0;
    for (let i = 0; i < 300; i++) {
      if (existsSync(portFile)) {
        const content = (await readFile(portFile, 'utf8')).trim().split('\n');
        if (content.length >= 2) {
          devPort = Number(content[0]);
          break;
        }
      }
      await sleep(100);
    }
    if (!devPort) throw new Error('devtools 端口未就绪');

    const targets = await (await fetch(`http://127.0.0.1:${devPort}/json/list`)).json();
    const page = targets.find(target => target.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1200, deviceScaleFactor: 1, mobile: false });

    const ready = await cdp.waitFor('window.SugarCube && window.SugarCube.Engine && document.getElementById("passages")', 180000);
    if (!ready) throw new Error('游戏未启动');

    await cdp.evaluate(`(() => {
      const gate = window.SugarCube?.Dialog?.isOpen?.() ? document.querySelector('#ui-dialog-body') : null;
      if (gate) {
        const cb = gate.querySelector('input[type=checkbox]');
        if (cb && !cb.checked) cb.click();
        const enter = [...gate.querySelectorAll('button')].find(b => /enter/i.test(b.textContent));
        if (enter) enter.click();
      }
      return true;
    })()`);
    await sleep(1200);
    await cdp.evaluate(`(() => {
      if (window.SugarCube?.Dialog?.isOpen?.()) {
        if (window.SugarCube.Links) window.SugarCube.Links.enabled = true;
        localStorage.setItem('verifiedAge', true);
        window.SugarCube.Dialog.close();
      }
      return true;
    })()`);
    await sleep(800);

    const altDown = { code: 'AltLeft', key: 'Alt', windowsVirtualKeyCode: 18, nativeVirtualKeyCode: 18, modifiers: 0 };
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...altDown });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyO', key: 'o', windowsVirtualKeyCode: 79, nativeVirtualKeyCode: 79, modifiers: 1 });
    await sleep(40);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyO', key: 'o', windowsVirtualKeyCode: 79, nativeVirtualKeyCode: 79, modifiers: 1 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...altDown, modifiers: 0 });

    const tabReady = await cdp.waitFor(`document.querySelector('#overlayTabs button[data-dolhk-tab]')`, 15000);
    if (!tabReady) throw new Error('Hotkeys 分页未出现');
    await cdp.evaluate(`document.querySelector('#overlayTabs button[data-dolhk-tab]').click()`);
    await cdp.waitFor(`document.querySelector('.dolhk-row[data-dolhk]')`, 15000);
    await sleep(500);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(out, Buffer.from(shot.data, 'base64'));
    console.log(`面板截图：${path.relative(root, out)}`);
  } finally {
    child.kill();
    server.close();
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
