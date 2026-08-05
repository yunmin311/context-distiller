# 架构说明

Context Distiller 是一个 Manifest V3 扩展，由四个彼此隔离的运行环境组成。
核心设计原则：**ChatGPT 的页面知识只存在于 Adapter 与 Main World Bridge 里；
标准化、Prompt 编译器和 React 界面永远不直接依赖 ChatGPT 的选择器。**

## 运行环境

| 环境 | 位置 | 能做 | 不能做 |
| --- | --- | --- | --- |
| **Service Worker** (`background.ts`) | 扩展后台 | 打开侧边栏、协调扩展事件 | 不是服务器/数据库，不存对话 |
| **Content Script** (`chatgpt.content.ts`) | 网页隔离世界 | 读写 DOM、注入 Main World、回填输入框、读选区 | 读不到页面自己的 JS 状态；不渲染侧栏 |
| **Main World Bridge** (`chatgpt-main-world.ts`) | 网页主世界 | 读页面内部 React fiber / 对话数据 | 用不了扩展 API |
| **Side Panel** (`sidepanel/`) | 独立 React 页面 | 显示消息、选材、编组、设置预设、预览 | 不调用模型，不生成最终笔记 |

为什么需要 Main World Bridge：Chrome 的 content script 与页面**共享 DOM，但不共享
JS 对象**。ChatGPT 把消息挂在 DOM 节点的 `__reactFiber$…` expando 属性上，隔离世界
读不到，只有主世界能读。因此「读页面内部数据」必须放在注入的主世界脚本里，隔离世界的
content script 则始终保留 `data-message-author-role` + `innerText` 的 DOM 回退路径。

## 核心模块职责

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| `ChatGPT Adapter` | 识别页面、提取标题/消息、定位消息、找输入框、回填 | 不管理侧栏状态，不编译 Prompt |
| `Main World Bridge` | 进主世界读内部数据，经事件传回 | 不直接操作扩展 API |
| `Content Script` | 承接选区、DOM 回退、注入、输入框回填 | 不长期保存，不渲染侧栏 |
| `Conversation Normalizer` | API/DOM 数据 → 统一消息结构 | 不判断消息是否重要 |
| `Side Panel` | 展示、选片段、编组、设置预设、预览 | 不调用模型，不生成最终笔记 |
| `Prompt Compiler` | 按预设 ID 和片段顺序拼接纯文本 | 不推理、不改写材料、不读 DOM |

## 数据流

```
ChatGPT 页面内部数据  /  当前 DOM
        │
   Main World Bridge  +  DOM Adapter        （优先内部数据，失败回退 DOM）
        │
   Conversation Normalizer
        │
   标准化 ConversationMessage[]
        │
   Side Panel 临时选择与编组
        │
   PromptSelections  +  FragmentGroup[]
        │
   Prompt Compiler                          （纯函数、确定性）
        │
   纯文本完整消息
        │
   Clipboard  或  ChatGPT 输入框
        │
   用户自行发送
```

## 三跳通信协议

全部类型定义在 `lib/messaging/protocol.ts`：

1. **Side Panel → Content Script**：`browser.tabs.sendMessage`，请求
   `get-conversation` / `get-selection` / `fill-composer` / `ping`。
2. **Content Script ↔ Main World**：`window` 上的 CustomEvent
   (`cd:mw-request` / `cd:mw-response`)，带请求 id 与超时，主世界取不到就回退 DOM。
3. 响应都是判别式联合（discriminated union），任何一层都不用猜消息形状。

## Prompt 编译顺序（固定）

编译器是纯本地、确定性的字符串处理。相同输入 → 相同输出。顺序（见 `compiler.ts`）：

1. 基础任务说明（材料由用户主动筛选，要求可脱离原对话独立阅读）
2. 输出用途 Prompt
3. 知识密度 Prompt
4. 文风 Prompt
5. 输出结构 Prompt
6. 附加要求 Prompt（**按预设库内的固定顺序**，与用户点击顺序无关）
7. 用户材料（按模块 `order`，再按片段数组顺序，`【模块名】` 分节，备注另起一行）

编译器**不读 DOM、不调用 AI、不改写材料、不判断内容**。它对特殊字符和代码块原样透传。

## 无持久化设计

MVP 的片段与设置只存在 Side Panel 的 React 内存状态（`useDistiller` 的 reducer），
**不写** IndexedDB / Dexie / `chrome.storage`。Side Panel 打开后主动向当前标签页请求
完整对话，而不是依赖「侧栏是否已加载」去接收之前的消息。若未来要保存默认主题或自定义
预设，应作为独立需求重新评估，而不是把持久化提前塞进核心架构。

## 已知限制 / 风险（与应对）

| 风险 | 应对 |
| --- | --- |
| ChatGPT 页面结构 / 内部数据变化 | 独立 Adapter；页面数据 + DOM 双路径；Adapter 是唯一改动点 |
| 虚拟列表只挂载部分消息 | 优先读内部数据；侧栏标注「可能不完整」，提示向上滚动后刷新 |
| 输入框是复杂编辑器（ProseMirror） | `fillComposer` 三级降级（textarea → execCommand → 手动段落）；**始终保留复制备用** |
| 预设 Prompt 之间冲突 | 限制首版预设数量；固定编译顺序；组合测试 |
| 无持久化导致误关闭丢失 | 明确提示临时会话性质；关键动作前不自动清空；提供复制预览 |
