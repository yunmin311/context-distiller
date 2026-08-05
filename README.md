# Context Distiller · 对话蒸馏器

> 一个运行在 AI 对话页面旁边的**临时选材与 Prompt 编译工作台**。
> 首发适配 ChatGPT。不调用模型、不建服务器、不保存历史、不导出文件、绝不自动发送。

Context Distiller 解决的不是「让插件自己总结对话」，而是「在你把材料交给 AI 之前，
把**材料选择权、组织权和生成指令的控制权**交回给你」。它在长对话与最终生成之间，
加了一层轻量、可见、确定性的输入编译过程：

```
打开 ChatGPT 长对话
      ↓  插件读取并标准化当前对话
选择整条消息 / 问答组合 / 局部文本
      ↓  进入侧边栏临时工作区
分组、排序、加备注
      ↓  点底部预设按钮（文风 / 密度 / 用途 / 结构 / 附加要求）
基础 Prompt + 预设 Prompt + 用户材料
      ↓  确定性拼接
一段完整纯文本消息
      ↓  复制 或 填入输入框
你检查后自行发送 → 你自己的 AI 完成最终生成
```

**插件准备输入，用户确认输入，用户自己的 AI 生成结果。**

---

## 产品边界（MVP）

| 负责 | 不负责 |
| --- | --- |
| 读取当前 ChatGPT 对话并标准化 | 调用 AI / 模型 API |
| 多粒度选材（整条 / 问答 / 局部） | 保存历史项目或长期片段库 |
| 侧边栏临时编组、排序、备注 | 生成 PDF / Word / Markdown 文件 |
| 预设 Prompt → 固定顺序编译纯文本 | 自动发送消息 |
| 复制 / 回填输入框 | 服务器、账号、云同步 |
| — | 捕获、归档模型最终回答 |

关闭或刷新侧边栏后，本次整理**会丢失**——这是主动的产品取舍（避免演变成笔记库），
不是缺陷。详见 [docs/PRIVACY.md](docs/PRIVACY.md)。

---

## 技术栈

| 层级 | 方案 |
| --- | --- |
| 扩展标准 | Manifest V3 |
| 工程框架 | [WXT](https://wxt.dev) |
| 语言 | TypeScript |
| 侧边栏界面 | React 19 |
| 浏览器能力 | Chrome Side Panel API |
| 网页接入 | Content Script（隔离世界）+ Main World 注入脚本 |
| 单元测试 | Vitest |
| 端到端测试 | Playwright（规划中，见路线图 Beta 阶段） |

架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 环境要求

- Node.js ≥ 20（本仓库用 24 验证）
- [pnpm](https://pnpm.io) ≥ 9（本仓库用 11 验证）
- Chrome 或 Edge（Chromium 系，需支持 Side Panel API）

## 快速开始

```bash
pnpm install          # 安装依赖（会自动执行 wxt prepare 生成类型）

pnpm dev              # 开发模式：自动打开带扩展的 Chrome，改代码热更新
pnpm dev:edge         # 开发模式（Edge）

pnpm build            # 生产构建 → .output/chrome-mv3
pnpm build:edge       # 生产构建 → .output/edge-mv3
pnpm zip              # 打包成可上传的 zip

pnpm test             # 运行单元测试（Vitest）
pnpm typecheck        # 类型检查（tsc --noEmit）
```

### 手动加载（不用 `pnpm dev` 时）

1. `pnpm build`
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
3. 打开右上角「开发者模式」
4. 点「加载已解压的扩展程序」，选择 `D:\context-distiller\.output\chrome-mv3`
5. 打开一个 [chatgpt.com](https://chatgpt.com) 对话，点工具栏里的 Context Distiller 图标打开侧边栏

用法详见 [docs/USAGE.md](docs/USAGE.md)。

---

## 项目结构

```
context-distiller/
├─ wxt.config.ts              # WXT 配置（权限、host、side panel、web-accessible）
├─ entrypoints/               # 扩展入口（WXT 约定）
│  ├─ background.ts           # Service Worker：打开侧栏、协调事件
│  ├─ chatgpt.content.ts      # Content Script（隔离世界）：协调页面侧
│  ├─ chatgpt-main-world.ts   # Main World Bridge：读页面内部 React 数据
│  └─ sidepanel/              # React 侧边栏
│     ├─ index.html / main.tsx / App.tsx / styles.css
│     ├─ useDistiller.ts      # 会话状态（reducer，纯内存）
│     ├─ messaging.ts         # 与页面通信 + 剪贴板
│     └─ components/          # MessageList / GroupBoard / PresetBar / PreviewPanel
├─ lib/                       # 与浏览器无关的核心（可单测）
│  ├─ core/
│  │  ├─ types.ts             # 数据模型
│  │  ├─ presets.ts           # 预设 Prompt 库（作者维护、带版本）
│  │  ├─ compiler.ts          # Prompt 编译器（纯函数、确定性）★
│  │  └─ compiler.test.ts
│  ├─ platform/
│  │  ├─ adapter.ts           # PlatformAdapter 接口 + 注册表
│  │  ├─ chatgpt-adapter.ts   # ChatGPT DOM 提取、输入框回填
│  │  ├─ normalizer.ts        # 原始消息 → 标准 ConversationMessage[]
│  │  └─ normalizer.test.ts
│  ├─ messaging/protocol.ts   # 三跳通信的类型协议
│  └─ utils/id.ts
├─ public/icon/               # 图标 16/32/48/128
└─ docs/                      # 架构 / 隐私 / 使用
```

★ = 产品的确定性核心。相同的片段、模块顺序和按钮选择，永远编译出相同的纯文本。

---

## 测试

```bash
pnpm test
```

单元测试锁定确定性核心：

- **Prompt 编译器**：确定性、固定编译顺序、附加要求按库内顺序（与点击顺序无关）、
  空材料处理、特殊字符/代码原样透传（不转义不改写）、未知预设 ID 跳过、备注渲染、字符计数。
- **标准化器**：角色识别、去空、按 ID 去重、丢弃工具/未知角色、缺 ID 时合成 ID。

依赖真实 ChatGPT DOM 的部分（提取、选区、输入框回填、React fiber 读取）需在浏览器中
手动 / Playwright 验证——见 [docs/USAGE.md](docs/USAGE.md) 的「测试清单」。

---

## 路线图

- **M0 原理验证** ✅ 运行环境与通信链路（已由本 MVP 架构覆盖）
- **MVP** ✅ ChatGPT 读取、角色区分、多粒度选材、临时编组、底部预设、完整预览、复制与回填
- **Beta** ◻ 虚拟列表增强、搜索定位、选择器容错、快捷键、错误恢复、封闭测试
- **后续** ◻ Claude / Gemini 适配、更多经过验证的预设、可选的用户自定义预设

任何涉及历史保存、云同步、最终回答归档、文件生成的需求，均**不在**当前路线内；
若未来出现明确用户需求，作为新的产品方向单独评估。

## 隐私

最小权限、最小留存。只在 chatgpt.com / chat.openai.com 运行，只处理当前对话页数据，
不读取账号密码或 Cookie，不上传服务器，不写入长期本地数据库。详见
[docs/PRIVACY.md](docs/PRIVACY.md)。

## 许可

[MIT](LICENSE)
