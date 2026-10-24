"use strict";

/* ============ 基础工具 ============ */
const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fmtTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60e3) return t("time.just");
  if (diff < 3600e3) return t("time.min", { n: Math.floor(diff / 60e3) });
  if (diff < 86400e3) return t("time.hour", { n: Math.floor(diff / 3600e3) });
  if (diff < 7 * 86400e3) return t("time.day", { n: Math.floor(diff / 86400e3) });
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function shortPath(p) {
  if (!p) return "";
  const s = String(p);
  if (s.length <= 30) return s;
  return "…" + s.slice(-28);
}

/* ============ 轻量 Markdown 渲染 ============ */
function highlight(code) {
  const esc = escapeHtml(code);
  return esc.replace(
    /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|(&quot;(?:[^&]|&(?!quot;))*?&quot;|'(?:[^'\\]|\\.)*'|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|(\b(?:const|let|var|function|return|if|else|for|while|do|import|export|from|class|new|async|await|try|catch|finally|throw|def|print|lambda|None|True|False|and|or|not|in|is|elif|switch|case|break|continue|typeof|instanceof|of|extends|super|this|static|public|private|void|int|string|bool|struct|enum|interface|impl|fn|use|mod|pub|match|select|insert|update|delete|create|from|where|echo|sudo|npm|pip|git)\b)/g,
    (m, com, str, num, kw) => {
      if (com) return '<span class="tok-com">' + com + "</span>";
      if (str) return '<span class="tok-str">' + str + "</span>";
      if (num) return '<span class="tok-num">' + num + "</span>";
      if (kw) return '<span class="tok-kw">' + kw + "</span>";
      return m;
    },
  );
}

function inline(t) {
  t = escapeHtml(t);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*?&quot;)?\)/g,
    (m, alt, src) => '<img src="' + src + '" alt="' + alt + '" />');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return t;
}

function mdToHtml(md) {
  if (!md) return "";
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let listType = null;
  let para = [];
  const flushPara = () => { if (para.length) { out.push("<p>" + inline(para.join("<br>")) + "</p>"); para = []; } };
  const closeList = () => { if (listType) { out.push("</" + listType + ">"); listType = null; } };

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    const fm = line.match(/^\s*```([\w+#.-]*)\s*$/);
    if (fm) {
      flushPara(); closeList();
      const lang = fm[1];
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      out.push('<pre><code' + (lang ? ' class="lang-' + escapeHtml(lang) + '"' : "") + ">" + highlight(code.join("\n")) + "</code></pre>");
      continue;
    }

    // 表格
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length &&
        /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      flushPara(); closeList();
      const header = line.trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim()));
        i++;
      }
      let t = "<table><thead><tr>";
      header.forEach((h) => { t += "<th>" + inline(h) + "</th>"; });
      t += "</tr></thead><tbody>";
      rows.forEach((r) => { t += "<tr>"; r.forEach((c) => { t += "<td>" + inline(c) + "</td>"; }); t += "</tr>"; });
      t += "</tbody></table>";
      out.push(t);
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); closeList();
      const n = h[1].length;
      out.push("<h" + n + ">" + inline(h[2]) + "</h" + n + ">");
      i++; continue;
    }

    // 分隔线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara(); closeList(); out.push("<hr>"); i++; continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      flushPara(); closeList();
      const qs = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        qs.push(lines[i].replace(/^\s*>\s?/, "")); i++;
      }
      out.push("<blockquote>" + mdToHtml(qs.join("\n")) + "</blockquote>");
      continue;
    }

    // 列表
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const type = ul ? "ul" : "ol";
      if (listType !== type) { closeList(); listType = type; out.push("<" + type + ">"); }
      out.push("<li>" + inline((ul || ol)[1]) + "</li>");
      i++; continue;
    }

    // 空行
    if (!line.trim()) { flushPara(); closeList(); i++; continue; }

    para.push(line);
    i++;
  }
  flushPara(); closeList();
  return out.join("\n");
}

function extractText(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
  if (content.content != null) return extractText(content.content);
  return String(content);
}

/* ============ 全局状态 ============ */
const state = {
  connected: false,
  streaming: false,
  model: null,
  thinkingLevel: "medium",
  sessionFile: null,
  sessionName: null,
  messageCount: 0,
  models: [],
  thinkingLevels: ["off", "minimal", "low", "medium", "high", "max"],
  workspace: "",
  sessionDir: "",
  sessions: [],
  currentSessionPath: null,
  stats: null,
};

let view = [];                 // 当前渲染的消息条目
let currentAssistant = null;   // 正在流式输出的助手条目
let toolCards = new Map();     // toolCallId -> tool 条目
let renderQueued = false;
let stickBottom = true;

/* ============ API ============ */
async function api(path, opts) {
  const r = await fetch(path, opts);
  const ct = r.headers.get("content-type") || "";
  return ct.includes("json") ? r.json() : r.text();
}

async function command(type, params = {}) {
  return api("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...params }),
  });
}

/* ============ 渲染：消息列表 ============ */
function renderBlocks(blocks) {
  let html = "";
  for (const b of blocks || []) {
    if (!b) continue;
    if (b.type === "text") {
      if (b.text) html += '<div class="md">' + mdToHtml(b.text) + "</div>";
    } else if (b.type === "thinking") {
      if (b.thinking) {
        html += '<details class="thinking"><summary>' + t("thinking.title") + '</summary><div class="thinking-body">' +
          escapeHtml(b.thinking) + "</div></details>";
      }
    } else if (b.type === "toolCall") {
      const name = b.name || b.toolName || "tool";
      html += '<div class="toolcall-chip">🛠 <code>' + escapeHtml(name) + "</code></div>";
    }
  }
  return html;
}

function renderToolCard(item) {
  let badge;
  if (item.status === "running") badge = '<span class="t-badge running">' + t("tool.running") + "</span>";
  else if (item.status === "error") badge = '<span class="t-badge error">' + t("tool.error") + "</span>";
  else badge = '<span class="t-badge done">' + t("tool.done") + "</span>";
  const name = escapeHtml(item.toolName || "tool");
  const dur = item.durationMs != null ? " · " + item.durationMs + "ms" : "";
  let argsHtml = "";
  if (item.args) {
    let a = item.args;
    if (typeof a !== "string") { try { a = JSON.stringify(a, null, 2); } catch { a = String(a); } }
    argsHtml = '<div class="t-args">' + escapeHtml(a) + "</div>";
  }
  let outHtml = "";
  if (item.output) {
    outHtml = '<div class="t-output' + (item.isError ? " error" : "") + '">' + escapeHtml(item.output) + "</div>";
  }
  return '<div class="tool-card"><div class="tool-head"><span class="t-name">' + name + "</span>" +
    badge + '<span class="t-meta">' + dur + "</span></div>" +
    (argsHtml || outHtml ? '<div class="tool-body">' + argsHtml + outHtml + "</div>" : "") + "</div>";
}

function renderItem(item) {
  if (item.kind === "user") {
    const imgs = (item.images || []).map((im) => '<img src="data:' + im.mimeType + ";base64," + im.data + '" alt="图片" />').join("");
    return '<div class="msg msg-user"><div class="bubble">' + escapeHtml(item.text) + imgs + "</div></div>";
  }
  if (item.kind === "assistant") {
    const blocks = renderBlocks(item.blocks);
    const typing = item.status === "streaming" && !blocks
      ? '<div class="typing"><span></span><span></span><span></span></div>' : "";
    const model = item.model ? "pi" : "pi";
    const modelNote = item.model ? " · " + escapeHtml(item.model) : "";
    return '<div class="msg msg-assistant"><div class="msg-role">' + model + modelNote + "</div>" +
      '<div class="bubble">' + blocks + typing + "</div></div>";
  }
  if (item.kind === "tool") return '<div class="msg msg-tool">' + renderToolCard(item) + "</div>";
  if (item.kind === "shell") {
    return '<div class="msg msg-tool"><div class="tool-card"><div class="tool-head"><span class="t-name">$ ' +
      escapeHtml(item.command) + "</span>" +
      (item.exitCode === 0 ? '<span class="t-badge done">0</span>' : '<span class="t-badge error">' + item.exitCode + "</span>") +
      '</div><div class="tool-body"><div class="t-output">' + escapeHtml(item.output || "") + "</div></div></div></div>";
  }
  if (item.kind === "note") {
    return '<div class="note"><span class="pill">' + escapeHtml(t(item.key, item.vars)) + "</span></div>";
  }
  return "";
}

function render() {
  renderQueued = false;
  const container = $("#messages");
  const empty = $("#empty-state");

  if (view.length === 0) {
    if (empty) empty.classList.remove("hidden");
    // 清掉 empty 之外的内容
    [...container.children].forEach((c) => { if (c !== empty) c.remove(); });
    return;
  }
  if (empty) empty.classList.add("hidden");

  // 简单重建：保留 empty 节点，其余删除重建
  let wrap = $("#msg-list");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "msg-list";
    wrap.className = "msg-inner";
    container.insertBefore(wrap, empty);
  }
  wrap.innerHTML = view.map(renderItem).join("");

  if (stickBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
}

function addNote(key, vars) {
  view.push({ kind: "note", key, vars });
  scheduleRender();
}

/* ============ pi 事件处理 ============ */
function ensureBlocks(arr, idx) {
  if (!arr[idx]) arr[idx] = { type: "text", text: "" };
  return arr[idx];
}

function handlePiEvent(rec) {
  if (!rec || !rec.type) return;
  switch (rec.type) {
    case "agent_start": setStreaming(true); break;
    case "agent_settled": setStreaming(false); break;
    case "message_start": onMessageStart(rec.message); break;
    case "message_end": onMessageEnd(rec.message); break;
    case "message_update": onMessageUpdate(rec); break;
    case "tool_execution_start": onToolStart(rec); break;
    case "tool_execution_update": onToolUpdate(rec); break;
    case "tool_execution_end": onToolEnd(rec); break;
    case "compaction_start": addNote("compacting"); break;
    case "compaction_end": addNote("compacted"); break;
    case "session_info_changed": state.sessionName = rec.name ?? null; break;
    case "thinking_level_changed": state.thinkingLevel = rec.level; syncSelectors(); break;
    case "ui:status": applyStatus(rec); break;
    case "ui:sessions": state.sessions = rec.sessions || []; renderSessions(); break;
    case "ui:log": onLog(rec); break;
  }
  scheduleRender();
}

function onMessageStart(message) {
  if (!message) return;
  if (message.role === "user") {
    view.push({ kind: "user", text: extractText(message.content), images: extractImages(message.content) });
  } else if (message.role === "assistant") {
    currentAssistant = { kind: "assistant", blocks: [], status: "streaming", model: message.model || null };
    if (Array.isArray(message.content) && message.content.length) {
      currentAssistant.blocks = message.content;
    }
    view.push(currentAssistant);
  }
}

function extractImages(content) {
  if (Array.isArray(content)) {
    return content.filter((b) => b && b.type === "image");
  }
  return [];
}

function onMessageEnd(message) {
  if (!message) return;
  if (message.role === "assistant") {
    if (currentAssistant) {
      currentAssistant.blocks = Array.isArray(message.content) ? message.content : [];
      currentAssistant.status = "done";
      currentAssistant.model = message.model || currentAssistant.model;
      currentAssistant = null;
    } else {
      view.push({ kind: "assistant", blocks: Array.isArray(message.content) ? message.content : [], status: "done", model: message.model });
    }
  } else if (message.role === "user") {
    // 已在 message_start 处理；若缺失则补一条
    if (!view.some((v) => v.kind === "user" && v.text === extractText(message.content))) {
      view.push({ kind: "user", text: extractText(message.content), images: extractImages(message.content) });
    }
  } else if (message.role === "toolResult") {
    view.push({
      kind: "tool", toolCallId: message.toolCallId, toolName: message.toolName,
      args: "", status: message.isError ? "error" : "done", output: extractText(message.content), isError: !!message.isError,
    });
  } else if (message.role === "bashExecution") {
    view.push({ kind: "shell", command: message.command, output: message.output, exitCode: message.exitCode });
  } else if (message.role === "compactionSummary" || message.role === "branchSummary") {
    addNote(message.role === "compactionSummary" ? "note.compacted" : "note.branch");
  }
}

function onMessageUpdate(rec) {
  const ev = rec.assistantMessageEvent;
  if (!ev) return;
  if (!currentAssistant) {
    currentAssistant = { kind: "assistant", blocks: [], status: "streaming" };
    view.push(currentAssistant);
  }
  const blocks = currentAssistant.blocks;
  const idx = ev.contentIndex || 0;
  if (ev.type === "text_start") ensureBlocks(blocks, idx).text = "";
  else if (ev.type === "text_delta") ensureBlocks(blocks, idx).text += ev.delta;
  else if (ev.type === "text_end") ensureBlocks(blocks, idx).text = ev.content || "";
  else if (ev.type === "thinking_start") { const b = ensureBlocks(blocks, idx); b.type = "thinking"; b.thinking = ""; }
  else if (ev.type === "thinking_delta") { const b = ensureBlocks(blocks, idx); b.type = "thinking"; b.thinking = (b.thinking || "") + ev.delta; }
  else if (ev.type === "thinking_end") { const b = ensureBlocks(blocks, idx); b.type = "thinking"; b.thinking = ev.content || b.thinking; }
  else if (ev.type === "toolcall_start") { const b = ensureBlocks(blocks, idx); b.type = "toolCall"; b.id = ev.id; b.name = ev.toolName; b.arguments = ""; }
  else if (ev.type === "toolcall_delta") { const b = ensureBlocks(blocks, idx); b.type = "toolCall"; b.arguments = (b.arguments || "") + ev.delta; }
  else if (ev.type === "toolcall_end") {
    const b = ensureBlocks(blocks, idx); b.type = "toolCall";
    if (ev.toolCall) { b.id = ev.toolCall.id; b.name = ev.toolCall.name; b.arguments = ev.toolCall.arguments; }
  }
  if (rec.usage) currentAssistant.usage = rec.usage;
}

function onToolStart(rec) {
  const item = { kind: "tool", toolCallId: rec.toolCallId, toolName: rec.toolName, args: rec.args, status: "running", output: "", isError: false };
  toolCards.set(rec.toolCallId, item);
  view.push(item);
}

function onToolUpdate(rec) {
  const item = toolCards.get(rec.toolCallId);
  if (!item) return;
  const more = extractText(rec.partialResult);
  if (more) item.output += more;
}

function onToolEnd(rec) {
  const item = toolCards.get(rec.toolCallId);
  if (!item) return;
  item.status = rec.isError ? "error" : "done";
  item.output = extractText(rec.result);
  item.isError = !!rec.isError;
  item.durationMs = rec.durationMs;
  toolCards.delete(rec.toolCallId);
}

/* ============ 状态 / 选择器 ============ */
function setStreaming(v) {
  state.streaming = v;
  $("#btn-send").classList.toggle("hidden", v);
  $("#btn-stop").classList.toggle("hidden", !v);
  $("#input-hint").textContent = v ? t("streaming.hint") : "";
}

function applyStatus(rec) {
  state.connected = !!rec.connected;
  state.streaming = !!rec.streaming;
  state.workspace = rec.workspace || state.workspace;
  state.sessionDir = rec.sessionDir || state.sessionDir;
  if (rec.state) {
    state.model = rec.state.model || state.model;
    state.thinkingLevel = rec.state.thinkingLevel || state.thinkingLevel;
    state.sessionFile = rec.state.sessionFile ?? state.sessionFile;
    state.sessionName = rec.state.sessionName ?? state.sessionName;
    state.messageCount = rec.state.messageCount ?? state.messageCount;
  }
  updateConn();
  syncSelectors();
  updateFoot();
}

function onLog(rec) {
  if (rec.level === "exit" || rec.level === "error") {
    state.connected = false;
    updateConn();
  }
}

function updateConn() {
  const dot = $("#conn-dot");
  const txt = $("#conn-text");
  if (state.connected) {
    dot.className = "dot on";
    txt.textContent = state.streaming ? t("conn.working") : t("conn.on");
  } else {
    dot.className = "dot off";
    txt.textContent = t("conn.off");
  }
}

function updateFoot() {
  const v = $("#foot-version");
  if (v) v.textContent = "";
  const w = $("#foot-workspace");
  if (w) w.textContent = shortPath(state.workspace);
}

function syncSelectors() {
  const ms = $("#model-select");
  if (ms) {
    if (state.model && !state.models.some((m) => m.id === state.model.id)) {
      state.models.unshift(state.model);
    }
    ms.innerHTML = state.models.map((m) =>
      '<option value="' + escapeHtml(m.provider + "/" + m.id) + '"' +
      (state.model && m.id === state.model.id ? " selected" : "") + ">" +
      escapeHtml(m.name || m.id) + "</option>",
    ).join("");
    if (!state.models.length) {
      ms.innerHTML = state.model ? '<option>' + escapeHtml(state.model.name || state.model.id) + "</option>" : "<option>" + t("model.none") + "</option>";
    }
  }
  const ts = $("#thinking-select");
  if (ts) {
    ts.innerHTML = state.thinkingLevels.map((l) =>
      '<option value="' + l + '"' + (l === state.thinkingLevel ? " selected" : "") + ">" + l + "</option>",
    ).join("");
  }
}

/* ============ 会话列表 ============ */
function renderSessions() {
  const list = $("#session-list");
  if (!list) return;
  if (!state.sessions.length) {
    list.innerHTML = '<div class="empty-hint">' + t("emptyHint") + "</div>";
    return;
  }
  list.innerHTML = "";
  for (const s of state.sessions) {
    const active = s.path === state.currentSessionPath || s.path === state.sessionFile;
    const item = el("div", "session-item" + (active ? " active" : ""));
    item.innerHTML =
      '<div class="s-title">' + escapeHtml(s.title || t("session.untitled")) + "</div>" +
      '<div class="s-meta">' + fmtTime(s.mtimeMs || s.timestamp) + " · " + escapeHtml(shortPath(s.cwd || "")) + "</div>" +
      '<button class="s-del" title="' + t("tool.delete") + '">🗑</button>';
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("s-del")) return;
      switchSession(s.path);
    });
    item.querySelector(".s-del").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(s);
    });
    list.appendChild(item);
  }
}

async function switchSession(sessionPath) {
  if (state.streaming) await command("abort").catch(() => {});
  state.currentSessionPath = sessionPath;
  const r = await command("switch_session", { sessionPath });
  if (r && r.success && r.data && r.data.cancelled) return;
  await refreshAll();
}

async function deleteSession(s) {
  if (!confirm(t("confirm.delete", { title: s.title || t("session.untitled") }))) return;
  await api("/api/delete-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: s.path }),
  });
  await refreshAll();
}

/* ============ 数据加载 ============ */
async function loadMessages() {
  const r = await command("get_messages").catch(() => null);
  if (!r || !r.success) return;
  view = [];
  toolCards.clear();
  currentAssistant = null;
  const messages = r.data.messages || [];
  for (const m of messages) {
    if (!m || m.role === "system") continue;
    if (m.role === "user") {
      view.push({ kind: "user", text: extractText(m.content), images: extractImages(m.content) });
    } else if (m.role === "assistant") {
      view.push({ kind: "assistant", blocks: Array.isArray(m.content) ? m.content : [], status: "done", model: m.model });
    } else if (m.role === "toolResult") {
      view.push({ kind: "tool", toolCallId: m.toolCallId, toolName: m.toolName, args: "", status: m.isError ? "error" : "done", output: extractText(m.content), isError: !!m.isError });
    } else if (m.role === "bashExecution") {
      view.push({ kind: "shell", command: m.command, output: m.output, exitCode: m.exitCode });
    } else if (m.role === "compactionSummary") {
      view.push({ kind: "note", key: "note.compacted" });
    } else if (m.role === "branchSummary") {
      view.push({ kind: "note", key: "note.branch" });
    }
  }
  render();
}

async function loadModels() {
  const r = await command("get_available_models").catch(() => null);
  if (r && r.success && Array.isArray(r.data.models)) {
    state.models = r.data.models;
    syncSelectors();
  }
  try {
    const lv = await command("get_available_thinking_levels");
    if (lv && lv.success && Array.isArray(lv.data.levels) && lv.data.levels.length) {
      state.thinkingLevels = lv.data.levels;
      syncSelectors();
    }
  } catch { /* ignore */ }
}

async function refreshState() {
  const s = await api("/api/state");
  state.connected = s.connected;
  state.streaming = s.streaming;
  state.workspace = s.workspace;
  state.sessionDir = s.sessionDir;
  if (s.state) {
    state.model = s.state.model;
    state.thinkingLevel = s.state.thinkingLevel;
    state.sessionFile = s.state.sessionFile;
    state.sessionName = s.state.sessionName;
    state.messageCount = s.state.messageCount;
    state.currentSessionPath = state.currentSessionPath || s.state.sessionFile;
  }
  state.sessions = s.sessions || [];
  updateConn();
  syncSelectors();
  updateFoot();
  renderSessions();
  setStreaming(state.streaming);
}

async function refreshAll() {
  await refreshState();
  await loadModels();
  await loadMessages();
}

/* ============ 发送 / 停止 ============ */
async function sendMessage(text) {
  text = (text || "").trim();
  if (!text) return;
  if (!state.connected) {
    addNote("reconnect.attempting");
    await api("/api/restart", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    await refreshState();
    if (!state.connected) { addNote("reconnect.fail"); return; }
  }
  $("#input").value = "";
  autoResize();
  const type = state.streaming ? "follow_up" : "prompt";
  const r = await command(type, { message: text });
  if (!r || !r.success) {
    addNote("send.fail", { error: (r && r.error) || "?" });
  }
}

async function stopStreaming() {
  await command("abort").catch(() => {});
}

/* ============ SSE 连接 ============ */
function connectSSE() {
  if (state._sse) { try { state._sse.close(); } catch { /* ignore */ } }
  const es = new EventSource("/api/events");
  state._sse = es;
  es.onmessage = (e) => {
    let rec;
    try { rec = JSON.parse(e.data); } catch { return; }
    handlePiEvent(rec);
  };
  es.onopen = () => { state.connected = true; updateConn(); };
  es.onerror = () => {
    // EventSource 会自动重连；仅更新提示
    if (es.readyState === EventSource.CLOSED) {
      state.connected = false;
      updateConn();
      setTimeout(connectSSE, 2000);
    }
  };
}

/* ============ 输入框自适应 ============ */
function autoResize() {
  const t = $("#input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 220) + "px";
}

/* ============ 事件绑定 ============ */
function bindEvents() {
  const input = $("#input");
  const send = $("#btn-send");
  const stop = $("#btn-stop");

  send.addEventListener("click", () => sendMessage(input.value));
  stop.addEventListener("click", stopStreaming);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });
  input.addEventListener("input", autoResize);

  $("#btn-new-session").addEventListener("click", async () => {
    if (state.streaming) await command("abort").catch(() => {});
    await command("new_session").catch(() => {});
    await refreshAll();
  });

  $("#model-select").addEventListener("change", async (e) => {
    const v = e.target.value.split("/");
    const provider = v[0];
    const modelId = v.slice(1).join("/");
    await command("set_model", { provider, modelId }).catch(() => {});
    await refreshState();
  });

  $("#thinking-select").addEventListener("change", async (e) => {
    await command("set_thinking_level", { level: e.target.value }).catch(() => {});
    state.thinkingLevel = e.target.value;
  });

  $("#btn-export").addEventListener("click", async () => {
    const r = await command("export_html").catch(() => null);
    if (r && r.success) {
      addNote("export.ok", { path: r.data.path });
    } else {
      addNote("export.fail");
    }
  });

  // 建议按钮
  document.querySelectorAll(".sugg").forEach((b) => {
    b.addEventListener("click", () => sendMessage(b.dataset.q));
  });

  // 设置弹窗
  $("#btn-settings").addEventListener("click", openSettings);
  $("#btn-modal-close").addEventListener("click", closeSettings);
  $("#btn-modal-cancel").addEventListener("click", closeSettings);
  $("#modal-mask").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeSettings(); });
  $("#btn-restart").addEventListener("click", saveAndRestart);

  // 主题切换（键盘 Ctrl+Shift+D 或点击）
  $("#btn-theme").addEventListener("click", toggleTheme);
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) { e.preventDefault(); toggleTheme(); }
  });

  // 语言切换
  $("#btn-lang").addEventListener("click", () => setLang(LANG === "zh" ? "en" : "zh"));

  // 滚动检测，决定是否自动跟随底部
  const container = $("#messages");
  container.addEventListener("scroll", () => {
    stickBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
  });
}

async function openSettings() {
  const s = await api("/api/settings");
  $("#set-workspace").value = s.workspace || "";
  $("#set-sessiondir").value = s.sessionDir || "";
  $("#set-approve").checked = !!s.approve;
  $("#modal-note").textContent = "pi 版本: " + (s.piVersion || "?") + "。修改工作目录后需重启 pi 才会生效。";
  $("#modal-mask").classList.remove("hidden");
}

function closeSettings() {
  $("#modal-mask").classList.add("hidden");
}

async function saveAndRestart() {
  const workspace = $("#set-workspace").value.trim();
  const approve = $("#set-approve").checked;
  await api("/api/restart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace, approve }),
  });
  closeSettings();
  await refreshAll();
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? null : "dark";
  if (next) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem("pi-ui-theme", next || "light"); } catch { /* ignore */ }
}

function initTheme() {
  try {
    if (localStorage.getItem("pi-ui-theme") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch { /* ignore */ }
}

/* ============ 启动 ============ */
async function main() {
  initTheme();
  bindEvents();
  window.onLangChanged = () => {
    renderSessions();
    syncSelectors();
    updateConn();
    setStreaming(state.streaming);
    render();
  };
  applyI18n();
  connectSSE();
  await refreshAll();
}

main();
