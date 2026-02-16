// src/daemon/server.ts
import express from "express";
import { createServer as createHttpServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

// src/daemon/store.ts
var SessionStore = class {
  constructor() {
    this.sessions = /* @__PURE__ */ new Map();
    this.events = [];
    this.MAX_EVENTS = 100;
  }
  /**
   * 注册新会话
   */
  register(request) {
    const now = Date.now();
    const project = this.extractProjectName(request.cwd);
    const session = {
      pid: request.pid,
      ppid: request.ppid,
      terminal: this.normalizeTerminal(request.terminal),
      cwd: request.cwd,
      project,
      status: "running",
      startedAt: now,
      updatedAt: now
    };
    this.sessions.set(session.pid, session);
    this.addEvent("started", session);
    return session;
  }
  /**
   * 获取单个会话
   */
  get(pid) {
    return this.sessions.get(pid);
  }
  /**
   * 获取所有会话
   */
  getAll() {
    return Array.from(this.sessions.values());
  }
  /**
   * 更新会话状态
   */
  update(pid, status, message) {
    const session = this.sessions.get(pid);
    if (!session) return void 0;
    const oldStatus = session.status;
    session.status = status;
    session.updatedAt = Date.now();
    if (message !== void 0) {
      session.message = message;
    }
    if (status === "waiting") {
      this.addEvent("waiting", session);
    } else if (oldStatus === "waiting" && status === "running") {
      this.addEvent("resumed", session);
    }
    return session;
  }
  /**
   * 删除会话
   */
  delete(pid) {
    const session = this.sessions.get(pid);
    if (session) {
      this.addEvent("ended", session);
    }
    return this.sessions.delete(pid);
  }
  /**
   * 获取活跃会话数量
   */
  get count() {
    return this.sessions.size;
  }
  /**
   * 记录事件
   */
  addEvent(type, session) {
    const event = {
      id: `${session.pid}-${Date.now()}`,
      type,
      pid: session.pid,
      project: session.project,
      timestamp: Date.now(),
      message: session.message
    };
    this.events.unshift(event);
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(0, this.MAX_EVENTS);
    }
    return event;
  }
  /**
   * 获取所有事件
   */
  getEvents() {
    return this.events;
  }
  /**
   * 清除所有事件
   */
  clearEvents() {
    this.events = [];
  }
  /**
   * 从路径提取项目名称
   */
  extractProjectName(cwd) {
    const parts = cwd.split("/");
    return parts[parts.length - 1] || "unknown";
  }
  /**
   * 标准化终端类型
   */
  normalizeTerminal(terminal) {
    const terminalMap = {
      "vscode": "vscode",
      "iTerm.app": "iterm",
      "iTerm": "iterm",
      "WarpTerminal": "warp",
      "Warp": "warp",
      "Apple_Terminal": "terminal",
      "Terminal": "terminal"
    };
    return terminalMap[terminal] || "unknown";
  }
};
var sessionStore = new SessionStore();

// src/daemon/server.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var app = express();
app.use(express.json());
var publicPath = path.join(__dirname, "public");
app.use("/dashboard", express.static(publicPath));
app.get("/", (_req, res) => {
  res.redirect("/dashboard");
});
function success(data) {
  return { success: true, data };
}
function error(code, message) {
  return { success: false, error: { code, message } };
}
app.post("/api/sessions", (req, res) => {
  const { pid, ppid, terminal, cwd } = req.body;
  if (!pid || !ppid || !cwd) {
    res.status(400).json(error("INVALID_REQUEST", "Missing required fields: pid, ppid, cwd"));
    return;
  }
  const session = sessionStore.register({ pid, ppid, terminal: terminal || "unknown", cwd });
  res.status(201).json(success(session));
});
app.get("/api/sessions", (_req, res) => {
  const sessions = sessionStore.getAll();
  res.json(success(sessions));
});
app.get("/api/sessions/:pid", (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  if (isNaN(pid)) {
    res.status(400).json(error("INVALID_PID", "Invalid PID format"));
    return;
  }
  const session = sessionStore.get(pid);
  if (!session) {
    res.status(404).json(error("SESSION_NOT_FOUND", `Session with PID ${pid} not found`));
    return;
  }
  res.json(success(session));
});
app.patch("/api/sessions/:pid", (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  if (isNaN(pid)) {
    res.status(400).json(error("INVALID_PID", "Invalid PID format"));
    return;
  }
  const { status, message } = req.body;
  if (!status) {
    res.status(400).json(error("INVALID_REQUEST", "Missing required field: status"));
    return;
  }
  const session = sessionStore.update(pid, status, message);
  if (!session) {
    res.status(404).json(error("SESSION_NOT_FOUND", `Session with PID ${pid} not found`));
    return;
  }
  res.json(success(session));
});
app.delete("/api/sessions/:pid", (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  if (isNaN(pid)) {
    res.status(400).json(error("INVALID_PID", "Invalid PID format"));
    return;
  }
  const deleted = sessionStore.delete(pid);
  if (!deleted) {
    res.status(404).json(error("SESSION_NOT_FOUND", `Session with PID ${pid} not found`));
    return;
  }
  res.json(success(null));
});
app.get("/api/health", (_req, res) => {
  res.json(success({ status: "ok", sessions: sessionStore.count }));
});
app.get("/api/events", (_req, res) => {
  const events = sessionStore.getEvents();
  res.json(success(events));
});
function createServer() {
  const httpServer2 = createHttpServer(app);
  return httpServer2;
}

// src/daemon/websocket.ts
import { WebSocketServer, WebSocket } from "ws";
var wss = null;
var clients = /* @__PURE__ */ new Set();
function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`WebSocket client connected. Total: ${clients.size}`);
    sendMessage(ws, {
      type: "init",
      sessions: sessionStore.getAll(),
      events: sessionStore.getEvents()
    });
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(ws, msg);
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    });
    ws.on("close", () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected. Total: ${clients.size}`);
    });
  });
}
function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
function sendMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
function handleClientMessage(ws, msg) {
  switch (msg.type) {
    case "kill_session":
      const session = sessionStore.get(msg.pid);
      if (session) {
        sessionStore.addEvent("killed", session);
        sessionStore.delete(msg.pid);
        broadcast({ type: "session_removed", pid: msg.pid });
      }
      break;
  }
}

// src/notify/index.ts
import { exec } from "child_process";
import { promisify } from "util";

// src/types.ts
var DEFAULT_CONFIG = {
  port: 17530,
  checkInterval: 5e3,
  notifications: {
    sessionEnd: true,
    promptSubmit: false,
    waitingInput: true
  },
  sounds: {
    sessionEnd: "Glass",
    promptSubmit: "Submarine",
    waitingInput: "Hero"
  }
};

// src/notify/index.ts
var execAsync = promisify(exec);
async function sendNotification(title, message, sound = "Glass") {
  const script = `
    display notification "${escapeString(message)}" with title "${escapeString(title)}" sound name "${sound}"
  `;
  await runOsascript(script);
}
async function runOsascript(script) {
  const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, `'"'"'`)}'`);
  return stdout.trim();
}
function escapeString(str) {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// src/daemon/zombie.ts
var checkInterval = null;
function startZombieChecker(intervalMs = DEFAULT_CONFIG.checkInterval) {
  if (checkInterval) {
    console.log("Zombie checker already running");
    return;
  }
  console.log(`Starting zombie checker (interval: ${intervalMs}ms)`);
  checkInterval = setInterval(async () => {
    const sessions = sessionStore.getAll();
    for (const session of sessions) {
      if (!isProcessAlive(session.pid)) {
        console.log(`Detected zombie session: PID ${session.pid} (${session.project})`);
        sessionStore.delete(session.pid);
        try {
          await sendNotification(
            "Claude Monitor - \u4F1A\u8BDD\u5F02\u5E38\u7EC8\u6B62",
            `\u9879\u76EE: ${session.project}`,
            "Basso"
          );
        } catch (err) {
          console.error("Failed to send notification:", err);
        }
      }
    }
  }, intervalMs);
}
function stopZombieChecker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log("Zombie checker stopped");
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// src/daemon/index.ts
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.port;
var httpServer = createServer();
initWebSocket(httpServer);
var originalRegister = sessionStore.register.bind(sessionStore);
var originalUpdate = sessionStore.update.bind(sessionStore);
var originalDelete = sessionStore.delete.bind(sessionStore);
sessionStore.register = (req) => {
  const session = originalRegister(req);
  broadcast({ type: "session_update", session });
  return session;
};
sessionStore.update = (pid, status, message) => {
  const session = originalUpdate(pid, status, message);
  if (session) {
    broadcast({ type: "session_update", session });
  }
  return session;
};
sessionStore.delete = (pid) => {
  const result = originalDelete(pid);
  if (result) {
    broadcast({ type: "session_removed", pid });
  }
  return result;
};
httpServer.listen(PORT, () => {
  console.log(`Claude Monitor Daemon started on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  startZombieChecker(DEFAULT_CONFIG.checkInterval);
});
var shutdown = () => {
  console.log("Shutting down gracefully...");
  stopZombieChecker();
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
//# sourceMappingURL=daemon.js.map