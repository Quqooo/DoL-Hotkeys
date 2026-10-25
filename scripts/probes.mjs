// 排查用探针：HK_PROBE=<name> 时只打印诊断信息并结束进程，不进入断言流程
// 与 e2e 主流程分开，避免诊断代码挤占回归断言的阅读路径

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const PROBES = {
  /** 原版快捷键列表：确认检测结果与快照兜底情况 */
  async orig({ cdp, sleep, pressAlt }) {
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
  },

  /** early 钩子观测到的原生监听与 Mousetrap 绑定 */
  async keys({ cdp }) {
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
  },

  /** 模组加载器环境与加载日志，用于启动失败时的定位 */
  async env({ cdp }) {
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
  },

  /** 音量键确认对话框：层级、按钮与宿主 class */
  async dialog({ cdp, sleep, openHotkeysTab, outputDir }) {
    await cdp.evaluate(`(() => {
      if (SugarCube.Dialog.isOpen()) SugarCube.Dialog.close();
      document.getElementById('ui-dialog')?.classList.remove('closeBlocked');
      window.cordova = { exec: () => {} };
      return true;
    })()`);
    await sleep(400);
    await openHotkeysTab(cdp);
    await cdp.evaluate(`document.querySelector('.dolhk-row input[type="checkbox"]').click(); true`);
    await sleep(600);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(outputDir, 'dialog.png'), Buffer.from(shot.data, 'base64'));
    const state = await cdp.evaluate(`({
      open: SugarCube.Dialog.isOpen('dolhk-dialog-host'),
      bodyClass: (SugarCube.Dialog.body ? (SugarCube.Dialog.body() || {}).className : '') || '',
      zIndexDialog: getComputedStyle(document.getElementById('ui-overlay')).zIndex,
      zIndexOverlay: getComputedStyle(document.getElementById('customOverlay')).zIndex,
      buttons: [...document.querySelectorAll('.dolhk-dialog-actions button')].map(node => node.textContent),
    })`);
    console.log('dialog:', JSON.stringify(state));
  },

  /** SugarCube Dialog 的可用方法，确认宿主 API 形状 */
  async api({ cdp }) {
    const info = await cdp.evaluate(`(() => {
      const cube = window.SugarCube || {};
      const dialog = cube.Dialog || window.Dialog;
      return {
        windowDialog: typeof window.Dialog,
        cubeDialog: typeof cube.Dialog,
        dialogKeys: dialog ? Object.getOwnPropertyNames(dialog).slice(0, 24) : null,
        methods: dialog
          ? Object.fromEntries(
              ['setup', 'body', 'append', 'empty', 'open', 'close', 'isOpen'].map(name => [name, typeof dialog[name]]),
            )
          : null,
        uiAlert: typeof (cube.UI || {}).alert,
        uiKeys: Object.keys(cube.UI || {}).slice(0, 24),
        hasModal: Boolean(document.getElementById('ui-dialog')),
        modalClass: document.getElementById('ui-dialog')?.className ?? '',
      };
    })()`);
    console.log('api:', JSON.stringify(info, null, 1));
  },

  /** 按键与面板刷新开销，用于判断注入是否有性能回退 */
  async perf({ cdp, sleep, keyEvent, openHotkeysTab }) {
    await cdp.send('Performance.enable', {});
    await cdp.evaluate(`(() => {
      if (SugarCube.State.variables.options) SugarCube.State.variables.options.maxStates = 2;
      SugarCube.Config.history.maxStates = 2;
      window.__mut = { calls: 0, records: 0 };
      const obs = new MutationObserver(list => {
        window.__mut.calls++;
        window.__mut.records += list.length;
      });
      obs.observe(document.body, { childList: true, subtree: true });
      return true;
    })()`);
    const passage = await cdp.evaluate(
      `['PassageFooter', 'PassageHeader', 'StoryCaption'].find(name => SugarCube.Story.has(name)) ?? 'Start'`,
    );
    const readMetrics = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics');
      const map = {};
      for (const item of metrics) map[item.name] = item.value;
      return map;
    };
    const workload = async () => {
      for (let i = 0; i < 30; i++) {
        await cdp.evaluate(`SugarCube.Engine.play('${passage}')`);
        await sleep(40);
      }
      for (let i = 0; i < 200; i++) {
        await keyEvent(cdp, 'keyDown', { code: 'KeyQ', key: 'q', vk: 81, modifiers: 1 });
      }
    };
    await workload();
    await cdp.evaluate('window.__mut = { calls: 0, records: 0 }; true');
    const before = await readMetrics();
    const startedAt = Date.now();
    await workload();
    const elapsed = Date.now() - startedAt;
    const after = await readMetrics();
    const delta = name => +(after[name] - before[name]).toFixed(4);
    console.log('--- perf ---');
    console.log(`  mod ${process.env.HK_NO_MOD ? 'off' : 'on'}: 30 passages + 200 keydowns in ${elapsed} ms`);
    console.log(`  boot script ${before.ScriptDuration.toFixed(4)} s | boot task ${before.TaskDuration.toFixed(4)} s`);
    console.log(`  ScriptDuration ${delta('ScriptDuration')} s | Task ${delta('TaskDuration')} s | Layout ${delta('LayoutDuration')} s | Style ${delta('RecalcStyleDuration')} s`);
    console.log(`  body mutations ${JSON.stringify(await cdp.evaluate('window.__mut'))}`);
    const keyMicro = await cdp.evaluate(`(() => {
      const ev = new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', altKey: true, bubbles: true });
      const t0 = performance.now();
      for (let i = 0; i < 2000; i++) document.dispatchEvent(ev);
      return +(((performance.now() - t0) / 2000) * 1000).toFixed(2);
    })()`);
    console.log(`  keydown dispatch ${keyMicro} us/event (game + listeners)`);
    if (!process.env.HK_NO_MOD) {
      const idle = await cdp.evaluate(`(() => {
        const t0 = performance.now();
        for (let i = 0; i < 5000; i++) window.DoLHK.refreshTab();
        return +(((performance.now() - t0) / 5000) * 1000).toFixed(2);
      })()`);
      console.log(`  ensureTab (no overlay) ${idle} us/call`);
      await openHotkeysTab(cdp);
      const detectCost = await cdp.evaluate(`(() => {
        const btn = [...document.querySelectorAll('.dolhk-btn')].pop();
        if (!btn) return null;
        let t0 = performance.now();
        btn.click();
        const first = performance.now() - t0;
        t0 = performance.now();
        btn.click();
        const second = performance.now() - t0;
        return {
          first: +first.toFixed(1),
          second: +second.toFixed(1),
          rows: document.querySelectorAll('.dolhk-orig-row').length,
        };
      })()`);
      console.log(`  detect + render ${JSON.stringify(detectCost)} ms`);
      const busy = await cdp.evaluate(`(() => {
        const t0 = performance.now();
        for (let i = 0; i < 2000; i++) window.DoLHK.refreshTab();
        return +(((performance.now() - t0) / 2000) * 1000).toFixed(2);
      })()`);
      console.log(`  ensureTab (overlay open) ${busy} us/call`);
    }
  },

  /** 侧边栏按钮与覆盖层状态，用于分页注入位置的问题定位 */
  async sidebar({ cdp, sleep }) {
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
          handler = click && click[0] ? String(click[0].handler).replace(/\\s+/g, ' ').slice(0, 300) : '';
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
  },
};

/**
 * 命中则执行探针并结束进程。
 * `allowed` 让调用点决定哪些探针在自己的时机执行：依赖启动完成的探针不能放在启动检查之前。
 */
export async function runProbe(name, ctx, allowed) {
  if (!name || !allowed.includes(name)) return;
  const probe = PROBES[name];
  if (!probe) {
    console.log(`  未知探针 ${name}，可选：${Object.keys(PROBES).join(' / ')}`);
    process.exit(1);
  }
  await probe(ctx);
  process.exit(0);
}
