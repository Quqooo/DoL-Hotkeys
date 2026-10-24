import { bindKey } from '../core/keys';
import { bindOf, isUsable, list as listEntries, revision as registryRevision } from '../data/registry';
import { conflictMode, revision as settingsRevision } from '../core/settings';
import { ACTION_ORDER, type ActionId, type Bind, type RegisteredHotkey } from '../core/types';

interface Candidate {
  entry: RegisteredHotkey;
  bind: Bind;
}

const reported = new Set<string>();

let cacheKey = '';
let table = new Map<string, Candidate[]>();

function build(): void {
  const key = `${registryRevision()}:${settingsRevision()}`;
  if (key === cacheKey) return;
  cacheKey = key;

  table = new Map();
  for (const entry of listEntries()) {
    const candidate: Candidate = { entry, bind: bindOf(entry.id) };
    const id = bindKey(candidate.bind);
    const bucket = table.get(id);
    if (bucket) bucket.push(candidate);
    else table.set(id, [candidate]);
  }
}

function rankOf(entry: RegisteredHotkey): number {
  if (entry.builtin) return ACTION_ORDER.indexOf(entry.id as ActionId);
  return ACTION_ORDER.length + entry.order;
}

/** 优先级降序 → 同优先级内置优先 → 内置按 ACTION_ORDER、第三方按注册顺序 */
function byPriority(a: Candidate, b: Candidate): number {
  if (b.entry.priority !== a.entry.priority) return b.entry.priority - a.entry.priority;
  if (a.entry.builtin !== b.entry.builtin) return a.entry.builtin ? -1 : 1;
  return rankOf(a.entry) - rankOf(b.entry);
}

function select(held: Bind, inputBlocked: boolean): Candidate[] {
  build();
  const matches = table.get(bindKey(held));
  if (!matches || matches.length === 0) return [];
  const usable = matches.filter(item => {
    if (inputBlocked && !item.entry.inInput) return false;
    return isUsable(item.entry);
  });
  return usable.sort(byPriority);
}

function run(item: Candidate, event: Event): void {
  try {
    item.entry.handler({
      id: item.entry.id,
      event,
      source: item.bind.some(atom => atom.startsWith('Mouse')) ? 'mouse' : 'key',
    });
  } catch (error) {
    if (reported.has(item.entry.id)) return;
    reported.add(item.entry.id);
    console.warn(`[dol-hotkeys] handler failed: ${item.entry.id}`, error);
  }
}

/** 派发一次按键，返回被执行的条目 id；未命中返回 null */
export function dispatch(held: Bind, event: Event, inputBlocked = false): string | null {
  const matches = select(held, inputBlocked);
  if (matches.length === 0) return null;

  const mode = conflictMode();

  // legacy 忽略 priority，按「内置 ACTION_ORDER → 第三方注册顺序」取首个
  if (mode === 'legacy') {
    let chosen = matches[0];
    for (const item of matches) {
      if (rankOf(item.entry) < rankOf(chosen.entry)) chosen = item;
    }
    run(chosen, event);
    return chosen.entry.id;
  }

  if (mode === 'all') {
    for (const item of matches) run(item, event);
    return matches[0].entry.id;
  }

  run(matches[0], event);
  return matches[0].entry.id;
}
