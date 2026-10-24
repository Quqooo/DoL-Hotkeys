import { bindKey, parseMousetrap } from '../core/keys';
import type { Bind, Lang } from '../core/types';

export interface ReservedBind {
  key: string;
  label: { zh: string; en: string };
}

const STATIC: ReservedBind[] = [
  { key: bindKey(['KeyN']), label: { zh: '原版「继续」', en: 'vanilla continue' } },
  { key: bindKey(['NumpadDivide']), label: { zh: '原版「回溯」', en: 'vanilla go back' } },
  { key: bindKey(['NumpadSubtract']), label: { zh: '原版「前进」', en: 'vanilla go forward' } },
  { key: bindKey(['AltLeft', 'KeyM']), label: { zh: '模组管理器', en: 'Mod manager' } },
];

const warned = new Set<string>();

/** 原版绑定表：静态项 + 运行时观测到的 Mousetrap 绑定 */
export function reservedBinds(): ReservedBind[] {
  const out = [...STATIC];
  const seen = new Set(out.map(item => item.key));
  for (const binding of window.__DoLHKEarly?.bindings ?? []) {
    for (const combo of binding.combos) {
      const bind = parseMousetrap(combo);
      if (!bind) continue;
      const key = bindKey(bind);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: { zh: `原版「${combo}」`, en: `vanilla "${combo}"` } });
    }
  }
  return out;
}

export function clashOf(bind: Bind): ReservedBind | undefined {
  const key = bindKey(bind);
  return reservedBinds().find(item => item.key === key);
}

export function labelOfReserved(item: ReservedBind, lang: Lang): string {
  return item.label[lang];
}

/** 注册时与原版冲突：控制台提示一次，面板行内另有常驻提示 */
export function warnOnRegister(id: string, bind: Bind): void {
  const clash = clashOf(bind);
  if (!clash || warned.has(id)) return;
  warned.add(id);
  console.warn(`[dol-hotkeys] "${id}" uses a combination already bound by the game: ${clash.label.en}`);
}
