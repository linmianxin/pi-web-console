"use strict";

/* ============ 国际化（i18n）字典 ============ */
const I18N = {
  zh: {
    "brand.name": "Pi 控制台",
    "newSession": "新建会话",
    "emptyHint": "暂无会话",
    "conn.connecting": "连接中…",
    "conn.on": "已连接",
    "conn.off": "未连接",
    "conn.working": "工作中…",
    "model.label": "模型",
    "thinking.label": "思考",
    "stat.usage": "上下文用量",
    "theme.title": "切换深浅色（Ctrl+Shift+D）",
    "lang.title": "切换语言 / Switch language",
    "export.btn": "导出",
    "export.title": "导出当前会话为 HTML",
    "settings.btn": "设置",
    "empty.title": "有什么可以帮你？",
    "empty.subtitle": "我是 pi 编码智能体。可以直接给我任务，例如：",
    "sugg.1": "看看当前目录里有什么文件",
    "sugg.2": "帮我写一个 Python 脚本，打印当前时间",
    "sugg.3": "解释一下这个项目是做什么的",
    "sugg.4": "检查当前目录的 git 状态",
    "input.placeholder": "给 pi 发消息…（Enter 发送，Shift+Enter 换行）",
    "send": "发送",
    "stop": "停止",
    "streaming.hint": "pi 正在工作中…可以输入消息排队，或点击「停止」打断",
    "thinking.title": "思考过程",
    "tool.running": "执行中",
    "tool.done": "完成",
    "tool.error": "出错",
    "tool.delete": "删除会话",
    "session.untitled": "(未命名)",
    "compacting": "正在压缩上下文…",
    "compacted": "上下文压缩完成",
    "note.compacted": "📦 上下文已压缩",
    "note.branch": "🌿 分支摘要",
    "model.none": "无模型",
    "send.fail": "发送失败: {error}",
    "reconnect.attempting": "pi 未连接，正在尝试重启…",
    "reconnect.fail": "仍无法连接 pi，请检查设置中的 pi 路径。",
    "confirm.delete": "确定删除会话「{title}」？此操作不可恢复。",
    "export.ok": "已导出会话 HTML: {path}",
    "export.fail": "导出失败",
    "time.just": "刚刚",
    "time.min": "{n} 分钟前",
    "time.hour": "{n} 小时前",
    "time.day": "{n} 天前",
    "modal.title": "设置",
    "modal.workspace": "工作目录（pi 在此目录下干活）",
    "modal.sessiondir": "会话目录",
    "modal.approve": "信任项目本地文件（AGENTS.md 等，等同 --approve）",
    "modal.cancel": "取消",
    "modal.restart": "保存并重启 pi",
    "modal.note": "pi 版本: {v}。修改工作目录后需重启 pi 才会生效。",
  },
  en: {
    "brand.name": "Pi Console",
    "newSession": "New Session",
    "emptyHint": "No sessions yet",
    "conn.connecting": "Connecting…",
    "conn.on": "Connected",
    "conn.off": "Disconnected",
    "conn.working": "Working…",
    "model.label": "Model",
    "thinking.label": "Thinking",
    "stat.usage": "Context usage",
    "theme.title": "Toggle theme (Ctrl+Shift+D)",
    "lang.title": "切换语言 / Switch language",
    "export.btn": "Export",
    "export.title": "Export current session as HTML",
    "settings.btn": "Settings",
    "empty.title": "How can I help?",
    "empty.subtitle": "I'm the pi coding agent. Give me a task, for example:",
    "sugg.1": "List files in the current directory",
    "sugg.2": "Write a Python script that prints the current time",
    "sugg.3": "Explain what this project does",
    "sugg.4": "Check the git status of this directory",
    "input.placeholder": "Message pi… (Enter to send, Shift+Enter for newline)",
    "send": "Send",
    "stop": "Stop",
    "streaming.hint": "pi is working… queue a message or click Stop to interrupt",
    "thinking.title": "Thinking",
    "tool.running": "Running",
    "tool.done": "Done",
    "tool.error": "Error",
    "tool.delete": "Delete session",
    "session.untitled": "(untitled)",
    "compacting": "Compacting context…",
    "compacted": "Context compacted",
    "note.compacted": "📦 Context compacted",
    "note.branch": "🌿 Branch summary",
    "model.none": "No models",
    "send.fail": "Send failed: {error}",
    "reconnect.attempting": "pi disconnected, restarting…",
    "reconnect.fail": "Still cannot connect to pi. Check the pi path in settings.",
    "confirm.delete": "Delete session \"{title}\"? This cannot be undone.",
    "export.ok": "Exported session HTML: {path}",
    "export.fail": "Export failed",
    "time.just": "just now",
    "time.min": "{n} min ago",
    "time.hour": "{n} hr ago",
    "time.day": "{n} d ago",
    "modal.title": "Settings",
    "modal.workspace": "Working directory (where pi works)",
    "modal.sessiondir": "Session directory",
    "modal.approve": "Trust project-local files (AGENTS.md etc., equivalent to --approve)",
    "modal.cancel": "Cancel",
    "modal.restart": "Save & restart pi",
    "modal.note": "pi version: {v}. Changing the working directory requires restarting pi.",
  },
};

/* ============ 语言状态与工具 ============ */
let LANG = (() => {
  try {
    const s = localStorage.getItem("pi-ui-lang");
    if (s === "zh" || s === "en") return s;
  } catch { /* ignore */ }
  return (navigator.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
})();

function getLang() { return LANG; }

function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
  if (vars) {
    for (const k in vars) s = s.split("{" + k + "}").join(String(vars[k]));
  }
  return s;
}

function setLang(lang) {
  if (lang !== "zh" && lang !== "en") return;
  LANG = lang;
  try { localStorage.setItem("pi-ui-lang", lang); } catch { /* ignore */ }
  applyI18n();
}

/* ============ 应用到 DOM ============ */
function applyI18n() {
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
  document.title = t("brand.name");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title"));
  });
  const btn = document.getElementById("btn-lang");
  if (btn) btn.textContent = LANG === "zh" ? "EN" : "中";

  // 触发动态内容重绘（由 app.js 提供这些函数）
  if (typeof window.onLangChanged === "function") window.onLangChanged();
}
