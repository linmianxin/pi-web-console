// Pi 网页控制台 —— 后端服务
// 零第三方依赖，只用 Node 内置模块。
// 负责：启动/管理 pi 的 RPC 子进程、提供 HTTP 静态页 + SSE 事件流 + 命令转发。

import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();

const CONFIG_PATH = path.join(__dirname, "config.json");

function defaultConfig() {
  return {
    port: 8000,
    // 工作目录：pi 在此目录下干活，留空则使用用户主目录
    workspace: path.join(HOME, "pi-workspace"),
    // 会话文件目录：默认放在本项目 sessions/ 下
    sessionDir: path.join(__dirname, "sessions"),
    // 信任项目本地文件（AGENTS.md 等，等同 pi --approve）
    approve: true,
    // pi 安装根目录（installer 安装时自动探测；npm 全局安装可留空）
    piInstallRoot: path.join(HOME, ".pi", "agent", "install"),
    // 可选：显式指定 pi 的 cli.js 路径与 node 可执行文件路径（优先级最高）
    piCliPath: "",
    nodePath: "",
  };
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return { ...defaultConfig(), ...raw };
  } catch {
    return defaultConfig();
  }
}

const config = loadConfig();
function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}
if (!fs.existsSync(CONFIG_PATH)) saveConfig(); // 首次运行生成默认配置，方便用户修改

// ---------- 解析 pi 的真实 CLI 入口（多策略，跨平台） ----------
const PI_PACKAGE = "@earendil-works/pi-coding-agent";

function readPiBin(pkgDir) {
  const pkgPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin && pkg.bin.pi;
  if (!bin) return null;
  const cliPath = path.resolve(pkgDir, bin);
  return fs.existsSync(cliPath) ? cliPath : null;
}

function findGlobalPi() {
  const candidates = [];
  // 尝试 npm 全局安装目录
  try {
    const r = spawnSync("npm", ["root", "-g"], {
      encoding: "utf8", timeout: 8000, windowsHide: true,
      shell: process.platform === "win32",
    });
    if (r.status === 0 && r.stdout && r.stdout.trim()) candidates.push(r.stdout.trim());
  } catch { /* ignore */ }
  if (process.platform === "win32" && process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, "npm", "node_modules"));
  } else {
    candidates.push(path.join(HOME, ".npm-global", "node_modules"));
    candidates.push("/usr/local/lib/node_modules");
    candidates.push("/usr/lib/node_modules");
  }
  for (const root of candidates) {
    if (!root) continue;
    const cliPath = readPiBin(path.join(root, ...PI_PACKAGE.split("/")));
    if (cliPath) return { cliPath, installRoot: null, version: "npm" };
  }
  return null;
}

function resolvePi() {
  const nodePath = config.nodePath && fs.existsSync(config.nodePath)
    ? config.nodePath
    : process.execPath;

  // 1) 显式指定的 cli.js（优先级最高）
  if (config.piCliPath && fs.existsSync(config.piCliPath)) {
    return { cliPath: path.resolve(config.piCliPath), nodePath, installRoot: null, version: "custom" };
  }

  // 2) installer 安装（~/.pi/agent/install）
  const installRoot = config.piInstallRoot || path.join(HOME, ".pi", "agent", "install");
  const verFile = path.join(installRoot, "current-version");
  if (fs.existsSync(verFile)) {
    const version = fs.readFileSync(verFile, "utf8").trim();
    const pkgDir = path.join(installRoot, "releases", version, "node_modules", ...PI_PACKAGE.split("/"));
    const cliPath = readPiBin(pkgDir);
    if (cliPath) return { cliPath, nodePath, installRoot, version };
  }

  // 3) npm 全局安装
  const global = findGlobalPi();
  if (global) return { cliPath: global.cliPath, nodePath, installRoot: null, version: global.version };

  throw new Error(
    "未找到 pi。请先安装 pi（https://pi.dev），或在 config.json 中显式设置 piCliPath 指向 pi 的 cli.js。",
  );
}

// ---------- pi RPC 子进程管理 ----------
class PiRpc {
  constructor() {
    this.proc = null;
    this.pending = new Map(); // id -> {resolve, reject}
    this.seq = 0;
    this.buf = "";
    this.connected = false;
    this.streaming = false;
    this.state = {};
    this.onEvent = () => {};
    this.piInfo = null;
  }

  start() {
    this.stop();
    try {
      this.piInfo = resolvePi();
    } catch (e) {
      this.connected = false;
      this._emit({ type: "ui:log", level: "error", message: "解析 pi 路径失败: " + (e && e.message ? e.message : e) });
      return Promise.resolve();
    }
    const args = ["--mode", "rpc", "--session-dir", config.sessionDir];
    if (config.approve) args.push("--approve");

    fs.mkdirSync(config.sessionDir, { recursive: true });
    fs.mkdirSync(config.workspace, { recursive: true });

    const env = { ...process.env };
    if (this.piInfo.installRoot) env.PI_MANAGED_INSTALL_ROOT = this.piInfo.installRoot;

    this.proc = spawn(this.piInfo.nodePath || process.execPath, [this.piInfo.cliPath, ...args], {
      cwd: config.workspace,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.connected = true;

    this.proc.stdout.on("data", (d) => this._onStdout(d));
    this.proc.stderr.on("data", (d) => this._emit({ type: "ui:log", level: "stderr", message: String(d) }));
    this.proc.on("error", (e) => {
      this.connected = false;
      this._rejectAll(new Error(e.message));
      this._emit({ type: "ui:log", level: "error", message: "pi 启动失败: " + e.message });
    });
    this.proc.on("exit", (code, sig) => {
      this.connected = false;
      this.proc = null;
      this._rejectAll(new Error("pi exited"));
      this._emit({ type: "ui:log", level: "exit", message: `pi 已退出 (code=${code}, signal=${sig ?? ""})` });
    });

    this._emit({
      type: "ui:log", level: "info",
      message: `pi v${this.piInfo.version} 已启动，工作目录: ${config.workspace}`,
    });
    return this.refreshState().catch(() => {});
  }

  _onStdout(d) {
    this.buf += d.toString("utf8");
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      let line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch {
        this._emit({ type: "ui:log", level: "warn", message: "无法解析的记录: " + line.slice(0, 200) });
        continue;
      }
      this._handle(rec);
    }
  }

  _handle(rec) {
    if (rec.type === "response") {
      const p = rec.id ? this.pending.get(rec.id) : undefined;
      if (p) {
        this.pending.delete(rec.id);
        p.resolve(rec);
      } else {
        this._emit(rec); // 无请求 ID 的响应（如 parse 错误）
      }
      return;
    }
    if (rec.type === "agent_start") this.streaming = true;
    else if (rec.type === "agent_settled") { this.streaming = false; this.refreshState().catch(() => {}); }
    else if (rec.type === "thinking_level_changed") this.state.thinkingLevel = rec.level;
    else if (rec.type === "session_info_changed") this.state.sessionName = rec.name ?? null;
    this._emit(rec);
  }

  send(cmd) {
    if (!this.proc || !this.connected) {
      return Promise.reject(new Error("pi 未连接"));
    }
    const id = "c" + ++this.seq;
    const full = { ...cmd, id };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.proc.stdin.write(JSON.stringify(full) + "\n");
      } catch (e) {
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  async refreshState() {
    try {
      const r = await this.send({ type: "get_state" });
      if (r && r.success) this.state = { ...this.state, ...r.data };
    } catch { /* 子进程可能正在退出 */ }
    return this.state;
  }

  _rejectAll(err) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  _emit(obj) {
    try { this.onEvent(obj); } catch { /* ignore */ }
  }

  stop() {
    if (this.proc) {
      try { this.proc.stdin.end(); } catch { /* ignore */ }
    }
  }

  kill() {
    if (this.proc) {
      try { this.proc.kill(); } catch { /* ignore */ }
      this.proc = null;
    }
    this.connected = false;
  }
}

const pi = new PiRpc();

// ---------- 会话列表（读取 session-dir 下的 *.jsonl） ----------
function extractUserText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((b) => b && b.type === "text")
      .map((b) => b.text)
      .join(" ");
  }
  return "";
}

function readSessionMeta(file) {
  try {
    const stat = fs.statSync(file);
    const fd = fs.openSync(file, "r");
    const cap = 256 * 1024; // 只读前 256KB 足够拿到 header + 首个用户消息
    const size = Math.min(stat.size, cap);
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, 0);
    fs.closeSync(fd);

    const text = buf.toString("utf8");
    const lines = text.split("\n");
    let header = null;
    try { header = JSON.parse(lines[0]); } catch { header = null; }

    let title = "";
    for (let k = 1; k < lines.length; k++) {
      const ln = lines[k].trim();
      if (!ln) continue;
      let e;
      try { e = JSON.parse(ln); } catch { continue; }
      if (e && e.type === "message" && e.message && e.message.role === "user") {
        title = extractUserText(e.message);
        if (title) break;
      }
    }
    if (!title) title = header && header.cwd ? "(空会话) " + path.basename(header.cwd) : "(空会话)";
    title = title.replace(/\s+/g, " ").trim().slice(0, 80);

    return {
      path: file,
      id: header ? header.id : null,
      timestamp: header ? header.timestamp : stat.mtime.toISOString(),
      cwd: header ? header.cwd : null,
      parentSession: header ? header.parentSession : null,
      title,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

function listSessions() {
  const dir = config.sessionDir;
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
        const meta = readSessionMeta(full);
        if (meta) out.push(meta);
      }
    }
  };
  walk(dir);
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

// ---------- 静态文件 ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(req, res, urlPath) {
  let rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  rel = rel.replace(/\.\./g, ""); // 防目录穿越
  const file = path.join(__dirname, "public", rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

// ---------- SSE 客户端 ----------
const sseClients = new Set();

function broadcast(obj) {
  const data = "data: " + JSON.stringify(obj) + "\n\n";
  for (const res of sseClients) {
    try { res.write(data); } catch { /* ignore */ }
  }
}

pi.onEvent = (obj) => broadcast(obj);

function sendStatus(res) {
  const s = {
    type: "ui:status",
    connected: pi.connected,
    streaming: pi.streaming,
    state: pi.state,
    workspace: config.workspace,
    sessionDir: config.sessionDir,
    piVersion: pi.piInfo ? pi.piInfo.version : null,
  };
  try { res.write("data: " + JSON.stringify(s) + "\n\n"); } catch { /* ignore */ }
}

function sendSessionList(res) {
  try {
    res.write("data: " + JSON.stringify({ type: "ui:sessions", sessions: listSessions() }) + "\n\n");
  } catch { /* ignore */ }
}

// ---------- 命令白名单 ----------
const ALLOWED_COMMANDS = new Set([
  "prompt", "steer", "follow_up", "abort", "clear_queue",
  "new_session", "switch_session", "set_session_name",
  "get_state", "get_messages", "get_session_stats", "get_tree", "get_entries",
  "set_model", "cycle_model", "get_available_models",
  "set_thinking_level", "cycle_thinking_level", "get_available_thinking_levels",
  "compact", "set_auto_compaction", "export_html",
  "get_commands",
]);

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let tooBig = false;
    req.on("data", (c) => {
      data += c;
      if (data.length > 20 * 1024 * 1024) { tooBig = true; req.destroy(); }
    });
    req.on("end", () => {
      if (tooBig) return reject(new Error("请求体过大"));
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error("JSON 解析失败")); }
    });
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

// ---------- HTTP 服务 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  try {
    // SSE 事件流
    if (p === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");
      sseClients.add(res);
      sendStatus(res);
      sendSessionList(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    // 会话列表
    if (p === "/api/sessions" && req.method === "GET") {
      return json(res, 200, { sessions: listSessions() });
    }

    // 当前状态快照
    if (p === "/api/state" && req.method === "GET") {
      await pi.refreshState().catch(() => {});
      return json(res, 200, {
        connected: pi.connected,
        streaming: pi.streaming,
        state: pi.state,
        workspace: config.workspace,
        sessionDir: config.sessionDir,
        piVersion: pi.piInfo ? pi.piInfo.version : null,
        sessions: listSessions(),
      });
    }

    // 转发 RPC 命令
    if (p === "/api/command" && req.method === "POST") {
      const body = await readJsonBody(req);
      const type = body.type;
      if (!type || !ALLOWED_COMMANDS.has(type)) {
        return json(res, 400, { success: false, error: "不支持的命令: " + type });
      }
      const { type: _t, id: _id, ...rest } = body;
      try {
        const r = await pi.send({ type, ...rest });
        // 会话/模型变化后刷新列表，让侧栏保持最新
        if (["new_session", "switch_session", "set_session_name"].includes(type)) {
          broadcast({ type: "ui:sessions", sessions: listSessions() });
        }
        if (["new_session", "switch_session", "set_model", "set_thinking_level"].includes(type)) {
          await pi.refreshState().catch(() => {});
        }
        return json(res, r.success ? 200 : 400, r);
      } catch (e) {
        return json(res, 500, { success: false, error: String(e.message || e) });
      }
    }

    // 重启 pi（可切换工作目录）
    if (p === "/api/restart" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (body.workspace) config.workspace = String(body.workspace);
      if (body.approve !== undefined) config.approve = !!body.approve;
      saveConfig();
      await pi.start();
      broadcast({ type: "ui:sessions", sessions: listSessions() });
      return json(res, 200, { success: true, connected: pi.connected, workspace: config.workspace });
    }

    // 获取/保存设置
    if (p === "/api/settings" && req.method === "GET") {
      return json(res, 200, {
        workspace: config.workspace,
        sessionDir: config.sessionDir,
        approve: config.approve,
        port: config.port,
        piVersion: pi.piInfo ? pi.piInfo.version : null,
      });
    }

    // 删除会话（删除 jsonl 文件）
    if (p === "/api/delete-session" && req.method === "POST") {
      const body = await readJsonBody(req);
      const target = String(body.path || "");
      if (!target || !target.endsWith(".jsonl")) {
        return json(res, 400, { success: false, error: "无效的会话路径" });
      }
      const dir = path.resolve(config.sessionDir);
      const resolved = path.resolve(target);
      if (!resolved.startsWith(dir)) {
        return json(res, 400, { success: false, error: "路径越界" });
      }
      try {
        fs.unlinkSync(resolved);
        broadcast({ type: "ui:sessions", sessions: listSessions() });
        return json(res, 200, { success: true });
      } catch (e) {
        return json(res, 500, { success: false, error: String(e.message || e) });
      }
    }

    // 静态文件
    if (req.method === "GET" && serveStatic(req, res, p)) return;

    json(res, 404, { error: "Not Found" });
  } catch (e) {
    json(res, 500, { error: String(e && e.message ? e.message : e) });
  }
});

// 心跳，保持 SSE 连接
setInterval(() => {
  for (const res of sseClients) {
    try { res.write(": ping\n\n"); } catch { sseClients.delete(res); }
  }
}, 25000);

// 启动：先让 HTTP 服务就绪（保证界面始终可访问），再后台拉起 pi
fs.mkdirSync(config.sessionDir, { recursive: true });
fs.mkdirSync(config.workspace, { recursive: true });
server.listen(config.port, () => {
  console.log(`Pi 网页控制台已启动: http://localhost:${config.port}`);
  console.log(`工作目录: ${config.workspace}`);
  console.log(`会话目录: ${config.sessionDir}`);
});
pi.start().then(() => {
  console.log(`pi 版本: ${pi.piInfo ? pi.piInfo.version : "?"}`);
}).catch((e) => {
  console.error("pi 启动失败:", e);
});

function shutdown() {
  console.log("\n正在关闭...");
  pi.kill();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
