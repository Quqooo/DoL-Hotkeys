import type { Bind, GroupRef, HotkeyDefInput, LocalizedText } from '../core/types';

interface DeclFields {
  label?: LocalizedText;
  tip?: LocalizedText;
  defaultBind?: Bind | string;
  group?: GroupRef;
  priority?: number;
  inInput?: boolean;
}

interface DeclRecord {
  modName?: unknown;
  declaredVersion?: unknown;
  params?: { group?: GroupRef; binds?: Record<string, unknown> } | unknown;
}

interface DeclEntry {
  fields: DeclFields;
  modName: string;
}

const ALLOWED = new Set(['label', 'tip', 'defaultBind', 'group', 'priority', 'inInput']);
const reported = new Set<string>();

let table = new Map<string, DeclEntry>();
let consumed = -1;

function warn(message: string): void {
  console.warn(`[dol-hotkeys] ${message}`);
}

function once(key: string, message: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  warn(message);
}

function queue(): DeclRecord[] {
  const value = window.DoLHK_DECL;
  return Array.isArray(value) ? (value as DeclRecord[]) : [];
}

/** 取版本串的首个数字段，兼容 `^1.0.0` / `>=1.0` / `1.2.3` 这类写法 */
function majorOf(text: string): number | null {
  const match = /\d+/.exec(text);
  return match ? Number(match[0]) : null;
}

function checkVersion(modName: string, declared: unknown): void {
  if (declared === undefined || declared === null || declared === '') return;
  if (typeof declared !== 'string') {
    once(`ver:${modName}`, `declaration from "${modName}" ignores a non-string modVersion`);
    return;
  }
  const expected = majorOf(__DOLHK_VERSION__);
  const actual = majorOf(declared);
  if (expected === null || actual === null) {
    once(`ver:${modName}`, `declaration from "${modName}" has an unparsable modVersion "${declared}"`);
    return;
  }
  if (expected !== actual) {
    once(`ver:${modName}`, `declaration from "${modName}" targets version "${declared}" but this build is ${__DOLHK_VERSION__}`);
  }
}

function pickFields(raw: unknown): { fields: DeclFields; ignored: string[] } {
  const fields: DeclFields = {};
  const ignored: string[] = [];
  if (!raw || typeof raw !== 'object') return { fields, ignored };
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED.has(key)) {
      ignored.push(key);
      continue;
    }
    if (key === 'label' || key === 'tip') fields[key] = value as LocalizedText;
    else if (key === 'group') fields.group = value as GroupRef;
    else if (key === 'defaultBind') fields.defaultBind = value as Bind | string;
    else if (key === 'priority' && typeof value === 'number' && Number.isFinite(value)) fields.priority = value;
    else if (key === 'inInput' && typeof value === 'boolean') fields.inInput = value;
  }
  return { fields, ignored };
}

/** 声明按到达顺序处理：同 id 保留首个，重复来源只诊断 */
export function rebuild(): void {
  const records = queue();
  if (records.length === consumed) return;
  consumed = records.length;
  table = new Map();

  records.forEach((record, index) => {
    const modName = typeof record.modName === 'string' && record.modName ? record.modName : `#${index}`;
    checkVersion(modName, record.declaredVersion);
    const params = record.params && typeof record.params === 'object' ? (record.params as Record<string, unknown>) : null;
    if (!params) {
      once(`params:${modName}:${index}`, `declaration from "${modName}" has no params`);
      return;
    }
    const sharedGroup = params.group as GroupRef | undefined;
    const binds = params.binds;
    if (!binds || typeof binds !== 'object') {
      once(`binds:${modName}:${index}`, `declaration from "${modName}" has no binds`);
      return;
    }
    for (const [id, raw] of Object.entries(binds as Record<string, unknown>)) {
      const { fields, ignored } = pickFields(raw);
      if (ignored.length > 0) {
        once(`extra:${modName}:${id}`, `declaration "${id}" ignores unsupported fields: ${ignored.join(', ')}`);
      }
      if (fields.group === undefined && sharedGroup !== undefined) fields.group = sharedGroup;
      const existing = table.get(id);
      if (existing) {
        once(`dup:${id}`, `declaration "${id}" from "${modName}" is ignored, already declared by "${existing.modName}"`);
        continue;
      }
      table.set(id, { fields, modName });
    }
  });
}

/** 运行时定义里缺省的字段用声明补齐，显式值优先 */
export function withDeclaration(def: HotkeyDefInput): HotkeyDefInput {
  rebuild();
  const decl = def && typeof def.id === 'string' ? table.get(def.id) : undefined;
  if (!decl) return def;
  const merge = <T>(runtime: T | undefined, declared: T | undefined): T | undefined =>
    runtime === undefined || runtime === null ? declared : runtime;
  return {
    ...def,
    label: merge(def.label, decl.fields.label),
    tip: merge(def.tip, decl.fields.tip),
    defaultBind: merge(def.defaultBind, decl.fields.defaultBind),
    group: merge(def.group, decl.fields.group),
    priority: merge(def.priority, decl.fields.priority),
    inInput: merge(def.inInput, decl.fields.inInput),
  };
}

/** 声明侧预检：只做诊断，不建行 */
export function checkDeclarations(clashOf: (bind: Bind) => string | undefined): void {
  rebuild();
  for (const [id, entry] of table) {
    const bind = entry.fields.defaultBind;
    if (typeof bind === 'string' || !bind) continue;
    const clash = clashOf(bind);
    if (clash) once(`pre:${id}`, `declaration "${id}" from "${entry.modName}" clashes with ${clash}`);
  }
}

export function declarationCount(): number {
  rebuild();
  return table.size;
}

/** 供测试与诊断：重置内部缓存 */
export function resetDeclarations(): void {
  consumed = -1;
  table = new Map();
  reported.clear();
}
