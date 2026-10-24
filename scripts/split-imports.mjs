// 一次性脚本：子目录拆分后重写相对 import，不改动任何逻辑
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'src');
const groups = {
  core: ['types', 'keys', 'settings'],
  data: ['registry', 'decl'],
  runtime: ['dispatch', 'engine', 'capture'],
  host: ['game', 'actions', 'mobile', 'dialog', 'detect', 'early', 'vanilla', 'original-keys'],
  ui: ['i18n', 'panel'],
};
const where = new Map();
for (const [dir, names] of Object.entries(groups)) for (const n of names) where.set(n, dir);

const files = [];
for (const [dir, names] of Object.entries(groups)) for (const n of names) files.push([dir, `${n}.ts`]);
files.push(['.', 'index.ts']);
files.push(['.', 'builtins.ts']);
files.push(['.', 'globals.d.ts']);

let changed = 0;
for (const [dir, file] of files) {
  const abs = path.join(root, dir === '.' ? '' : dir, file);
  const text = await readFile(abs, 'utf8');
  const out = text.replace(/from '\.\/([A-Za-z0-9-]+)'/g, (_whole, target) => {
    const at = dir === '.' ? `./${target}` : `../${target}`;
    if (target === 'globals') return `from '${at}'`;
    const dest = where.get(target);
    if (!dest) throw new Error(`unknown module ${target} in ${abs}`);
    if (dir === dest) return `from './${target}'`;
    return `from '${dir === '.' ? `./${dest}/${target}` : `../${dest}/${target}`}'`;
  });
  if (out !== text) {
    await writeFile(abs, out, 'utf8');
    changed++;
    console.log(`rewrote ${dir}/${file}`);
  }
}
console.log(`done, ${changed} file(s) rewritten`);
