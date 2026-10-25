// 单元测试共用脚手架：把 src 下的模块打成 ESM 后 import，断言与退出码集中在这里
// 各测试只需给出入口与标签，不再各自复制 esbuild 参数

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

export const root = path.resolve(import.meta.dirname, '..', '..');

/**
 * 打包并载入 src 下的模块。`entry` 可以是相对 `src/` 的路径，也可以是绝对路径
 * （声明层测试需要临时入口把两个模块一起导出）。
 */
export async function load(entry, name) {
  const entryPath = path.isAbsolute(entry) ? entry : path.join(root, 'src', entry);
  const out = path.join(root, 'test-output', `${name}.mjs`);
  await mkdir(path.dirname(out), { recursive: true });
  await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile: out,
    logLevel: 'error',
    define: { __DOLHK_VERSION__: JSON.stringify('1.0.2') },
  });
  return import(`file://${out}`);
}

export function reporter() {
  let failed = 0;

  function check(name, ok, detail = '') {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : `\n  ${detail}`}`);
  }

  /** 结构化比较，失败时同时打印两边 */
  function eq(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    check(name, ok, ok ? '' : `got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
  }

  function finish(label) {
    console.log(failed === 0 ? `\n${label}: all checks passed` : `\n${label}: ${failed} check(s) failed`);
    process.exit(failed === 0 ? 0 : 1);
  }

  return { check, eq, finish };
}
