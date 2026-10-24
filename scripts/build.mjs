import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const VERSION = pkg.version;

const boot = {
  name: 'DoL Hotkeys',
  nickName: { cn: '通用快捷键', en: 'Universal Hotkeys' },
  version: VERSION,
  styleFileList: ['hotkeys.css'],
  scriptFileList_inject_early: ['hotkeys-early.js'],
  scriptFileList: ['hotkeys.js'],
  tweeFileList: [],
  imgFileList: [],
  additionFile: [],
  addonPlugin: [],
  dependenceInfo: [
    { modName: 'ModLoader', version: '>=2.1.0' },
    { modName: 'GameVersion', version: '>=0.4.2.7' },
  ],
};

const shared = {
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'info',
  banner: { js: `/* DoL Hotkeys ${VERSION} */` },
  define: { __DOLHK_VERSION__: JSON.stringify(VERSION) },
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({ ...shared, entryPoints: [path.join(root, 'src/host/early.ts')], outfile: path.join(dist, 'hotkeys-early.js') });
await build({ ...shared, entryPoints: [path.join(root, 'src/index.ts')], outfile: path.join(dist, 'hotkeys.js') });

await copyFile(path.join(root, 'assets/hotkeys.css'), path.join(dist, 'hotkeys.css'));
await writeFile(path.join(dist, 'boot.json'), `${JSON.stringify(boot, null, 2)}\n`, 'utf8');

console.log(`built ${VERSION} -> ${path.relative(root, dist)}`);
