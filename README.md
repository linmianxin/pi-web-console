<div align="center">

# π Pi 控制台（Pi Web Console）

**一个 WorkBuddy 风格的网页界面，用来方便地调用 [pi](https://pi.dev) 编码智能体。**

*零第三方依赖 · 流式输出 · 会话管理 · 模型切换 · 工具调用可视化*

</div>

> A WorkBuddy-style web console for driving the [pi](https://github.com/earendil-works/pi) coding agent over its official RPC mode. Zero third-party dependencies, streaming chat, session management, model switching, and live tool-call visualization.

---

## 这是什么

[pi](https://pi.dev) 是一个极简、可扩展的编码智能体（coding agent），默认在终端里交互。本项目给它套上一层**网页聊天界面**，让你像用 WorkBuddy / CodeBuddy 一样在浏览器里：

- 流式查看 pi 的回复、思考过程、工具调用（读文件、写文件、执行命令……）
- 管理多个会话，随时切换、删除、导出 HTML
- 切换模型和思考等级、打断运行中的任务

它通过 pi 官方的 **RPC 模式**（`pi --mode rpc`）驱动 pi：后端用一个 Node 子进程跑 pi，把命令和流式事件在浏览器与 pi 之间双向转发。

## 特性

- ⚡ **流式聊天**：实时渲染文本，支持 Markdown + 代码高亮
- 🧠 **思考过程**：折叠展示 pi 的 reasoning
- 🛠 **工具调用可视化**：读/写文件、执行命令等以卡片形式实时展示参数与结果
- 💬 **会话管理**：新建 / 切换 / 删除会话，历史持久化（jsonl）
- 🎛 **模型切换 + 思考等级**：下拉即可切换（deepseek / anthropic / openai …）
- ⏹ **停止 / 打断**：随时 abort 运行中的任务
- 📦 **导出 HTML**：一键导出当前会话
- 🌓 **深色主题**：`Ctrl+Shift+D` 或右上角按钮
- 🔌 **零第三方依赖**：只用 Node 内置模块，无需 `npm install`

## 前置条件

1. 已安装 [pi](https://pi.dev)（installer 或 npm 全局安装均可）并登录了某个模型供应商：
   ```bash
   pi --list-models   # 能看到模型即可
   ```
2. **Node.js ≥ 22.19.0**（pi 本身的要求）

## 快速开始

### 方式一：直接运行（无需安装依赖）

```bash
# 克隆或下载本项目后
cd pi-web-console
node server.mjs
```

然后浏览器打开 http://localhost:8000

Windows 也可双击 `start.bat`；macOS/Linux 可运行 `./start.sh`。

### 方式二：npm

```bash
npm install        # 本仓库无运行时依赖，此步可选
npm start          # 等价于 node server.mjs
```

首次运行会自动生成 `config.json`（含默认配置），按需修改即可。

## 配置

`config.json`（首次运行自动生成，模板见 `config.example.json`）：

| 字段 | 说明 | 默认 |
|---|---|---|
| `port` | 网页端口 | `8000` |
| `workspace` | pi 的工作目录（留空则用用户主目录下的 `pi-workspace`） | `<home>/pi-workspace` |
| `sessionDir` | 会话文件目录 | `<项目>/sessions` |
| `approve` | 信任项目本地文件（AGENTS.md 等，等同 `pi --approve`） | `true` |
| `piInstallRoot` | pi installer 安装根目录（一般自动探测） | `<home>/.pi/agent/install` |
| `piCliPath` | **可选**：显式指定 pi 的 `cli.js` 路径（优先级最高） | 空 |
| `nodePath` | **可选**：显式指定 node 可执行文件路径 | 空 |

> 工作目录也可以在网页右上角「设置」里直接改，保存后自动重启 pi。
> 若无法自动找到 pi，请在 `config.json` 里设置 `piCliPath`。

## 目录结构

```
pi-web-console/
├── server.mjs              # 后端：HTTP + SSE + pi RPC 子进程管理（零依赖）
├── start.bat               # Windows 一键启动
├── start.sh                # macOS / Linux 一键启动
├── package.json            # npm 元信息与 start 脚本
├── config.example.json     # 配置模板
├── LICENSE                 # MIT
└── public/
    ├── index.html          # 界面结构
    ├── style.css           # 界面样式（含深色主题）
    └── app.js              # 前端逻辑（Markdown 渲染、事件处理）
```

## 工作原理

```
浏览器（界面）
   ↕ SSE 事件流 + HTTP 命令
server.mjs（Node 内置模块，零依赖）
   ↕ stdin/stdout JSONL（pi RPC 协议）
pi --mode rpc（编码智能体子进程）
```

后端按 pi 官方 [RPC 模式](https://github.com/earendil-works/pi) 协议：
- 把浏览器的 `prompt / abort / new_session / switch_session / set_model / export_html …` 转发给 pi；
- 把 pi 的流式事件（`text_delta` / `thinking_delta` / `tool_execution_*` / `agent_settled`）通过 **SSE** 推给浏览器实时渲染。

支持的命令见 [server.mjs](./server.mjs) 中的 `ALLOWED_COMMANDS`。

## 常见问题

**Q：页面显示「未连接」？**
先确认 pi 能单独运行：`pi --list-models`。若正常，检查 `config.json` 的 `piInstallRoot` / `piCliPath`，或在「设置」里查看报错。

**Q：需要 Docker 或安装 npm 包吗？**
不需要。零第三方依赖，只依赖本机 Node 与 pi。

**Q：怎么改默认模型？**
网页顶部下拉切换，或 `pi --list-models` 查看可用模型后，在 `config.json` 里启动参数（后端目前不固化 `--model`，默认沿用 pi 的默认模型）。

## 贡献

欢迎提 Issue / PR。改动 `server.mjs` 后建议本地自测：

```bash
node server.mjs
# 另开终端
curl http://localhost:8000/api/state
```

## 许可

[MIT](./LICENSE)
