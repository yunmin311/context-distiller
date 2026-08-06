# 上架 Chrome 应用商店（Chrome Web Store）清单

这份清单覆盖发布 Context Distiller 到 Chrome 应用商店需要的**手续**、**要准备的素材**、
以及**代码里要改 / 要注意的地方**。Edge 商店流程类似，附在最后。

## 0. 前置手续

- **注册开发者账号**：<https://chrome.google.com/webstore/devconsole> 用 Google 账号登录，
  一次性缴 **US$5** 注册费（一个账号可发多个扩展）。
- 首次发布可能要求**验证身份 / 联系邮箱**，并声明是否为「交易商户」（本扩展不收费，选否）。

## 1. 打包

```bash
pnpm zip            # 产出 .output/context-distiller-<version>-chrome.zip
```

上传的是这个 zip（WXT 已按 MV3 规范打包，含 manifest、图标、脚本，无源码/node_modules）。

## 2. 商店列表要填的素材

| 字段 | 内容 / 规格 |
| --- | --- |
| 名称 | Context Distiller（≤ 45 字符） |
| 简短描述 | ≤ 132 字符，已与 manifest `description` 一致 |
| 详细描述 | 用途、边界（不调模型/不上传/不自动发送）、隐私、用法；建议中英各一版 |
| 图标 | 128×128（已在 `public/icon/128.png`） |
| 截图 | **1–5 张，1280×800 或 640×400 PNG/JPG**（`docs/screenshots/` 里的图需按此尺寸重导，见下） |
| 小宣传图（可选） | 440×280 |
| 分类 | Productivity（生产力） |
| 语言 | 简体中文（可加 English） |
| 官网/支持 URL | 一个**公开**可访问的链接（GitHub 仓库公开后填，或单独建页） |

> 截图尺寸：现有 `messages.png`（1180×760）/`workspace.png`（400×1220）是给 README 用的，
> **不符合商店的 1280×800**。上架时需另导一版 1280×800（把面板放在 1280×800 画布里居中/留白即可）。

## 3. 隐私与权限（审核重点）

商店会逐条看权限，需在开发者后台的「隐私」页填**用途说明**：

- `sidePanel`：在 ChatGPT 页面旁展示工作台侧边栏。
- `scripting`：向页面主世界注入一个只读脚本，读取当前对话的内部数据（代码块更准）。
- `storage`：**仅**保存用户自己的长期配置（自定义模块名 / 自定义要求文本），不含对话内容。
- host `*://chatgpt.com/*`、`*://chat.openai.com/*`：只在 ChatGPT 页运行、读取当前对话、回填输入框。

**数据用途声明**（Data usage）：勾选
- 不出售/不转移用户数据；
- 不用于与核心功能无关的用途；
- 不收集：本扩展**不向任何服务器发送数据**，只在本地内存 + 本地 `chrome.storage` 处理。

**隐私政策 URL（必填其一情形）**：因为声明了 host 权限并读取页面内容，商店通常要求一个
**公开的隐私政策链接**。可选方案：
1. 把仓库设为公开，填 `docs/PRIVACY.md` 的公开链接；
2. 或用 GitHub Pages / Gist 单独挂一份 `PRIVACY`；
3. 或任意静态托管。内容直接用 `docs/PRIVACY.md`。

## 4. 代码 / 仓库里要改或确认的点

- [x] `manifest.description` 已压到 ≤ 132 字符（否则会被拒）。
- [x] 权限最小：`sidePanel` / `scripting` / `storage` + 指定 host，无 `<all_urls>`、无 `tabs`。
- [x] 无远程代码：所有 JS 随包发布，无 `eval`、无外链 `<script>`（MV3 合规）。
- [ ] **官网/隐私链接需公开**：仓库当前是**私有**，上架前把仓库公开，或另挂隐私政策。
- [ ] 另导 **1280×800** 商店截图（README 那两张尺寸不合规）。
- [ ] 确认 `version`（`package.json` 的 `0.1.0`）符合预期；每次更新需**递增版本号**再传。
- [ ] （可选）加 `homepage_url` 指向公开仓库；私有期间先不加以免 404。
- [ ] 单一用途说明（Single purpose）：一句话——「把用户在 ChatGPT 挑选的对话片段编译成一段纯文本 Prompt」。

## 5. 提交流程

1. `pnpm zip` → 得到 zip。
2. 开发者后台 → 「新增项目」→ 上传 zip。
3. 填列表素材（第 2 节）+ 隐私/权限用途（第 3 节）。
4. 提交审核。首次审核通常几天;含较宽 host 权限或「读取页面内容」可能被人工复核，
   如实说明用途即可。
5. 通过后可选「立即发布」或「灰度发布」。

## 6. Edge 加载项商店（可选）

流程类似：<https://partner.microsoft.com/dashboard/microsoftedge>，开发者账号**免费**，
同一个 MV3 zip 可直接传（`pnpm build:edge` / `pnpm zip` 亦可）。素材与隐私要求与 Chrome 基本一致。
