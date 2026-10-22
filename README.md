**简中** | [English](README_EN.md)

# DoL 通用快捷键

为 [Degrees of Lewdity](https://gitgud.io/Vrelnir/degrees-of-lewdity) 提供一套可自由改键的通用快捷键：回溯、前进、属性、社交、特质、日志、成就、选项、存档、作弊。

- 依赖：ModLoader >=2.1.0
- 兼容性：DoL >=0.4.2.7 （实测 `0.4.2.7` `0.5.0.5` `0.5.12.13`）

---

## 功能预览

![快捷键分页](assets/screenshots/panel-zh.png)

---

## 开发

```bash
npm install
npm run typecheck
npm run build     # dist/：hotkeys.js、hotkeys-early.js、hotkeys.css、boot.json
npm run pack      # dist/DoL-Hotkeys-v1.0.0.mod.zip
npm run test:e2e  # 本地 HTTP + 无头浏览器 + CDP 断言
```