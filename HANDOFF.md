# HANDOFF — Context Distiller 交接文档（2026-10-23）

> 写给下一个接手的 agent（Codex）。这份文档浓缩了 v1.4.0 → v1.4.3 四轮现场迭代的全部教训。
> **读这份文档的顺序**：先读「用户实证铁律」，再读「当前架构」，最后读「未决问题」。
> 违反铁律的任何「优化」都会复现已经踩过的坑。

---

## 0. 项目一句话

Chrome MV3 侧边栏扩展（WXT + React 19 + TS），读取当前 ChatGPT 对话 → 多粒度选材 → 确定性编译成一段纯文本 Prompt → 复制/回填。**不调模型、不存服务器、不自动发送。**当前版本 **1.4.5**，远端 `yunmin311/context-distiller`（main 已同步；v1.4.0–v1.4.4 tag 均在远端，v1.4.3 指向发布提交 d9fdd00）。

## 1. 用户实证铁律（违反 = 复现已知事故）

这些不是设计偏好，是**用户用真实使用换来的结论**，每一条背后是一次回归事故：

1. **「重试」必须刷新页面**（v1.3 行为，v1.4 曾移除，1.4.1 按用户要求恢复）。占主导的真实故障是「久开的 ChatGPT 标签页客户端状态过期」，原地重读永远修不好它，一次全新页面加载每次都好。位置：`useDistiller.ts` `retryRead`。
2. **定位永远尝试，不做任何「生成中拒绝」守卫**。历史上两次尝试加守卫（DOM 存在性 → 可见性）都因 ChatGPT 真实 UI 的隐藏 stop 按钮/残留 streaming 类而**永久拒绝定位**——那是用户心目中最好的功能。寻址失败的最坏结果只是回到原位，可接受；被拒之门外不可接受。
3. **读取闸门只能「推迟」，不能「丢弃」**。v1.4.0 的闸门在 20s 间隔内静默拒绝后台读取，把「partial→full 升级读取」丢掉了——用户盯着半截列表等一个永远不会来的补全。现在 `ReadGate.acquire()` 是等待式准入（后台最多等 25s，前台 6s）。**任何限流保护的新方案必须保证「该完成的读取最终一定完成」。**
4. **用户点过的按钮必须有即时反馈**。点击后 4 秒无任何反应 = 「按钮坏了」的体感。手动读取走 DOM 优先（亚秒上屏）；强制加载点击瞬间弹 toast。
5. **交付前必须自测**（用户明令）。见 §4 冒烟测试；「不部署未测过的构建」。

## 2. 当前架构（v1.4.3 读取链路）

```
侧边栏 (sidepanel/)
  App.tsx ── useDistiller.ts (状态机 + 读取动作)
      │
      ├─ 读取触发点一览（全部经 ReadGate，除 domOnly）：
      │    · 打开面板 / 切换会话：DOM 优先（亚秒）→ 后台升级读取（deferred）
      │    · 底部「读取当前对话」：同上（温和读取）
      │    · 右上角刷新：强制加载 force + bypassCache（跳过缓存跳过间隔，立即 toast）
      │    · 三连击刷新：deep load（DOM walk，80 步，零后端）
      │    · 流式期间：120s 轮询 + 结束 3.5s 追读（deferred，无变化在 reducer 去重）
      │    · conversation-grew 推送：reason 分流——'grown'=DOM 合并（零后端），'full-ready'=一次 deferred 全量
      │
      └─ messaging.ts sendToActiveTab（45s 硬超时——sendMessage 在标签页死亡时 promise 永不返回，
         曾造成「后台一直加载但界面不出现、之后什么都点不动」的死锁；45s 是命门，勿删）
            │
内容脚本 (chatgpt.content.ts)
      │ window CustomEvent
主世界桥 (chatgpt-main-world.ts)
      ├─ /api/auth/session → token（4min 缓存）
      ├─ /backend-api/conversation/<id>（单条响应缓存 30s TTL；force 时 bypass 并刷新）
      └─ 走 active branch、过滤思考/工具节点、合并同角色连续节点
```

关键文件职责：
- `lib/utils/read-governor.ts` — ReadGate（admit 同步版 / acquire 等待版）+ messageSignature 去重。**有单测锁定语义。**
- `lib/utils/paste-split.ts` — 粘贴导入拆分（中英前缀），兜底路径的核心。
- `lib/platform/chatgpt-markers.ts` — **所有** ChatGPT 选择器/端点/正则的唯一出处。改选择器只改这里。
- `lib/i18n/index.ts` — zh 是真源，en 是 `Record<UIKey,string>` 类型；漏译直接编译失败。新 key 两表都加、占位符一致。
- `entrypoints/sidepanel/App.tsx` — 所有读取触发点、视口策略（吸底只在用户显式动作或本来在底部）、ping 连接状态上屏。

## 3. 版本史速查（1.4.x 四轮现场迭代）

| 版本 | 改了什么 | 结果 |
| --- | --- | --- |
| 1.4.0 | 读取闸门（拒绝式）、轮询 70→120s、grew 分流、粘贴导入、重试不再刷新页、选择器集中化、CI | 闸门丢升级读 + 定位守卫误判 → 大回归 |
| 1.4.1 | 恢复刷新重试、45s 超时、busyReads 后台不拨 spinner、ping 上屏、错误带层数诊断 | 死锁消除，但读取慢 |
| 1.4.2 | 闸门改推迟（acquire）、主世界 30s 缓存、寻址时间上限 | 补全回来了，但仍 >1min，定位仍偶发拒绝 |
| 1.4.3 | 右上角=强制加载（force+bypassCache）、定位守卫彻底移除、寻址 80 步/20s | 待用户验证（当前态） |

## 4. 自测（交付前必跑）

```bash
pnpm typecheck && pnpm test && pnpm build     # 80 个单测；全绿才继续
pnpm smoke <版本号>                            # 真实浏览器冒烟，RESULT PASS 才交付
```

冒烟分两级，按配置自动选择：

- **匿名套件**（无 `.smoke-profile/` 时）：临时干净配置加载扩展 → 断言版本/首屏 → 真实 chatgpt.com
  上点读取 → 断言结构化错误卡片与防挂起 → 重试响应 → **粘贴导入 E2E**（拆前缀成 2 行 + 编译管线）。
- **登录态 E2E**（存在 `.smoke-profile/` 时自动追加）：从侧边栏打开真实对话（只读导航）→ 强制加载
  → 断言消息落地 → 点末条 #编号 → 断言页面真的滚到该消息。**配置方法（一次性，人工登录）：
  `pnpm smoke:login <版本号>`，在弹出的窗口里登录 ChatGPT，脚本轮询到会话后自动收尾。**
  该目录存的是测试会话，已被 .gitignore，绝不提交、绝不复制。

**运行环境注记**：脚本按 Windows + Git Bash 编写（浏览器路径探测用 cmd.exe、进程清理用 taskkill、
Edge/Chrome 安装路径为 Windows 形式）。在 WSL 下不能直接运行。CI 机房跑不了它（无浏览器），CI 只跑三关。
已知坑（都已修在脚本里，别回退）：品牌 Chrome 155+ 无视 `--load-extension`（脚本以 manifest 名字+版本逐一
校验 SW）；**相对路径的 --load-extension 会被静默忽略**（必须 resolve 成绝对路径）；窗口模式可能附着到
已有会话导致调试端口落空（用 headless=new）。

**冒烟测试已知边界（不是失败）**：
- 无头/匿名环境被 Cloudflare 拦 → 错误卡片显示「无法与页面通信/与页面的连接：无响应」= **正确行为**，断言接受它。
- 品牌版 Chrome 155+ **无视 `--load-extension`**（自己的组件扩展照常加载，会以假乱真）——脚本已 Edge 优先 + 用 manifest 名字/版本逐一校验 SW。若两浏览器都报 "did not load the extension"，先 `tasklist | grep -icE "msedge|chrome"` 清残留进程再跑。
- 登录态的真实读取成功率无法自动化（需要用户账号），这一步永远是用户验证。

## 4.5 重大发现：ChatGPT 新壳与 SSR 降级（2026-10-24，E2E 实证）

ChatGPT 的应用壳把对话**服务端渲染成带说话人前缀的纯文本**（「你说：…」/「ChatGPT 说：…」），
交互 UI 之后再水合。实测条件下水合**可能永远不发生**（自动化环境；用户的陈旧标签页大概率同样），
页面上 `data-message-*` 锚点数量为 0 —— 这一次性解释了用户报告的全部症状：
DOM 读取死亡（只剩慢速后端读取，35s 首行）、定位永久失败（无锚点）、跟随死亡、刷新页面能救（重新加载触发一次水合窗口）。

**v1.4.5 的应对**：`extractFromSsrFallback()`（chatgpt.content.ts）——页面无锚点时解析降级文本
（复用 paste-split 语法，已支持 说 后缀），读取变为**瞬时且零后端**（实测 35.3s → 1.0s）。
SSR 行是合成 id（msg_N），定位按钮自动隐藏（msg.ssrNoLocate）。

**对你（接手者）的意义**：
- 读路径现状 = SSR 降级（快）→ 水合后 DOM（快）→ 后端（慢，最后手段）。三层都在。
- 定位/跟随只在**水合后**可用。水合由 ChatGPT 掌控，自动化环境无法触发（trusted input、
  bringToFront 都试过）。用户端若水合则定位应恢复；若用户的页面同样不水合，定位在
  ChatGPT 恢复锚点渲染之前都不可能——这不是扩展能修的。
- E2E 的 locate 断言会先检查页面锚点数，0 则 SKIPPED（合理）。
- `.smoke-profile`（已 gitignore）存有测试会话；`pnpm smoke:login <ver>` 一次性重建。

## 5. 未决问题（按优先级）

1. **登录态读取端到端未验证**：v1.4.3 的强制加载/温和读取分工、30s 缓存体感、定位成功率，全部需要用户在真实账号下验证。若定位仍失败，**终极方案**：放弃「滚动搜索虚拟列表」，改为向页面注入一次性锚点标记（在目标消息挂载时自动 ring 高亮），用户报告见 `docs/USAGE.md` 清单。
2. **读取补全耗时**：1.4.2 时代用户报告 >1min。闸门推迟（后台 maxWait 25s）+ 巨线程全量拉取是两个候选瓶颈。若用户再报慢，先看面板 console 的 `[Context Distiller]` 行：补全读取是「被 defer 了多久」还是「后端拉取本身慢」，对症下药。
3. **CI 未跑通过一次真实运行**：workflow 已加（typecheck/test/build），推送会触发；第一次红要立即修，绿了才算交接闭环。
4. **Chrome Web Store 上架**（用户未决策）：上架前必须重读 2026-01 恶意扩展事件后的审查口径（host permissions / user data 披露）。当前策略：GitHub Releases 发版即可。

## 6. 仓库卫生

- **远端已同步** v1.4.3（tag），`legacy/pre-rewrite-0.5.0` 分支保存重写前历史，勿删。
- 本地 `recovery/*`、`backup-e-*` 分支是历史残留，确认无需要后可删。
- CI 曾被 revert 过一次（历史 commit），现已是正式配置，**别再撤**。
- 部署镜像：用户 Chrome 实际加载的是 `E:\下载\context-distiller-1.3.0-chrome`（文件夹名是历史遗留，勿改名——改名会导致 Chrome 找不到路径）。发布流程 = build → `robocopy /MIR` 到该目录 → 用户在 chrome://extensions 点刷新。
- 每次迭代**递增 package.json version**——版本号是用户区分「跑的哪版」的唯一手段（面板底部会显示）。

## 7. 给下一个 agent 的三句话

1. 用户的实证 > 任何架构洁癖；改动前先问「这条会不会违反 §1 的哪条铁律」。
2. 类型检查 + 单测 + 冒烟三关全过才交付；版本号必增；产物必镜像。
3. 用户会用中文报告现象 + 截图侧边栏界面（不是控制台）——错误卡片上的每一行字都是定位钥匙，读不懂就先问，别猜。
