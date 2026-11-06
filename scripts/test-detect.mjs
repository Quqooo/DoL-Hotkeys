// 原版检测的接口探测单元测试
import { load, reporter } from './lib/unit.mjs';

globalThis.window = globalThis;

const d = await load('host/detect.ts', 'detect-a');
const { check, eq, finish } = reporter();

eq('z maps to continue', d.describeCombo('z').kind, 'continue');
eq('space maps to continue', d.describeCombo('space').kind, 'continue');
eq('slash maps to back', [d.describeCombo('/').kind, d.describeCombo('/').dir], ['history', -1]);
eq('minus maps to forward', [d.describeCombo('-').kind, d.describeCombo('-').dir], ['history', 1]);
eq('star maps to reroll', d.describeCombo('*').kind, 'reroll');
eq('alt+m maps to modloader', d.describeCombo('alt+m').kind, 'modloader');
eq('unknown combo has no semantics', d.describeCombo('alt+q'), null);

eq('numpad slash label', d.comboLabel('/'), 'Num /');
eq('modifier label', d.comboLabel('alt+m'), 'Alt + M');
eq('single letter label', d.comboLabel('z'), 'Z');

const rows = d.rowsOfGroups([{ combos: ['z', 'n'] }, { combos: ['/'] }]);
check('bind groups keep their order', rows[0].keys === 'Z / N' && rows[1].keys === 'Num /', JSON.stringify(rows));
check('observed rows are marked detected', rows.every(row => row.detected), JSON.stringify(rows));

globalThis.__DoLHKEarly = { bindings: [{ combos: ['z', 'n'] }] };
const observed = d.detect();
eq('snapshot link plus observed bindings is mixed', observed.source, 'mixed');
check('observed row appears in the list', observed.entries.some(entry => entry.keys === 'Z / N'), JSON.stringify(observed.entries.map(e => e.keys)));

delete globalThis.__DoLHKEarly;
const d2 = await load('host/detect.ts', 'detect-b');
eq('no observation falls back to snapshot', d2.detect().source, 'snapshot');

finish('detect');
