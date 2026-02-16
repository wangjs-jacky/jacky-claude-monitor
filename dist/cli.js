#!/usr/bin/env node

// src/cli/index.ts
import { exec, spawn } from "child_process";
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

// src/cli/index.ts
var execAsync = promisify(exec);
var DAEMON_URL = `http://localhost:${DEFAULT_CONFIG.port}`;
var colors = {
  reset: "\x1B[0m",
  green: "\x1B[32m",
  red: "\x1B[31m",
  yellow: "\x1B[33m",
  cyan: "\x1B[36m",
  dim: "\x1B[2m"
};
function log(message) {
  console.log(message);
}
function logSuccess(message) {
  console.log(`${colors.green}\u2713${colors.reset} ${message}`);
}
function logError(message) {
  console.error(`${colors.red}\u2717${colors.reset} ${message}`);
}
function logInfo(message) {
  console.log(`${colors.cyan}\u2139${colors.reset} ${message}`);
}
async function isDaemonRunning() {
  try {
    const response = await fetch(`${DAEMON_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}
async function startCommand() {
  const running = await isDaemonRunning();
  if (running) {
    logError("\u5B88\u62A4\u8FDB\u7A0B\u5DF2\u5728\u8FD0\u884C\u4E2D");
    process.exit(1);
  }
  logInfo("\u6B63\u5728\u542F\u52A8\u5B88\u62A4\u8FDB\u7A0B...");
  const daemon = spawn("node", ["dist/daemon.js"], {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd()
  });
  daemon.unref();
  await new Promise((resolve) => setTimeout(resolve, 1e3));
  const nowRunning = await isDaemonRunning();
  if (nowRunning) {
    logSuccess("\u5B88\u62A4\u8FDB\u7A0B\u5DF2\u542F\u52A8");
    logInfo(`API \u5730\u5740: ${DAEMON_URL}`);
  } else {
    logError("\u5B88\u62A4\u8FDB\u7A0B\u542F\u52A8\u5931\u8D25");
    process.exit(1);
  }
}
async function stopCommand() {
  const running = await isDaemonRunning();
  if (!running) {
    logError("\u5B88\u62A4\u8FDB\u7A0B\u672A\u8FD0\u884C");
    process.exit(1);
  }
  try {
    const { stdout } = await execAsync(`lsof -ti:${DEFAULT_CONFIG.port}`);
    const pids = stdout.trim().split("\n").filter(Boolean);
    for (const pid of pids) {
      process.kill(parseInt(pid, 10), "SIGTERM");
    }
    logSuccess("\u5B88\u62A4\u8FDB\u7A0B\u5DF2\u505C\u6B62");
  } catch {
    logError("\u505C\u6B62\u5B88\u62A4\u8FDB\u7A0B\u5931\u8D25");
    process.exit(1);
  }
}
async function statusCommand() {
  const running = await isDaemonRunning();
  if (!running) {
    log("\u5B88\u62A4\u8FDB\u7A0B\u72B6\u6001: \u672A\u8FD0\u884C");
    return;
  }
  try {
    const response = await fetch(`${DAEMON_URL}/api/health`);
    const data = await response.json();
    if (data.success) {
      log("\u5B88\u62A4\u8FDB\u7A0B\u72B6\u6001: \u8FD0\u884C\u4E2D");
      log(`API \u5730\u5740: ${DAEMON_URL}`);
      log(`\u6D3B\u8DC3\u4F1A\u8BDD: ${data.data.sessions}`);
    }
  } catch {
    logError("\u83B7\u53D6\u72B6\u6001\u5931\u8D25");
  }
}
async function listCommand() {
  const running = await isDaemonRunning();
  if (!running) {
    logError("\u5B88\u62A4\u8FDB\u7A0B\u672A\u8FD0\u884C");
    process.exit(1);
  }
  try {
    const response = await fetch(`${DAEMON_URL}/api/sessions`);
    const data = await response.json();
    if (!data.success || data.data.length === 0) {
      log("\u6CA1\u6709\u6D3B\u8DC3\u7684\u4F1A\u8BDD");
      return;
    }
    log(`
\u6D3B\u8DC3\u4F1A\u8BDD (${data.data.length}):
`);
    for (const session of data.data) {
      const statusIcon = session.status === "waiting" ? "\u23F3" : "\u25B6\uFE0F";
      const statusColor = session.status === "waiting" ? colors.yellow : colors.green;
      log(`${statusIcon} ${colors.cyan}${session.project}${colors.reset}`);
      log(`   PID: ${session.pid} | \u7EC8\u7AEF: ${session.terminal}`);
      log(`   \u72B6\u6001: ${statusColor}${session.status}${colors.reset}`);
      log(`   \u76EE\u5F55: ${colors.dim}${session.cwd}${colors.reset}`);
      if (session.message) {
        log(`   \u6D88\u606F: ${session.message}`);
      }
      log("");
    }
  } catch {
    logError("\u83B7\u53D6\u4F1A\u8BDD\u5217\u8868\u5931\u8D25");
  }
}
function showHelp() {
  log(`
${colors.cyan}Claude Monitor${colors.reset} - Claude Code \u4F1A\u8BDD\u76D1\u63A7\u5DE5\u5177

\u7528\u6CD5:
  claude-monitor <command> [options]

\u547D\u4EE4:
  start     \u542F\u52A8\u5B88\u62A4\u8FDB\u7A0B
  stop      \u505C\u6B62\u5B88\u62A4\u8FDB\u7A0B
  status    \u67E5\u770B\u5B88\u62A4\u8FDB\u7A0B\u72B6\u6001
  list      \u5217\u51FA\u6240\u6709\u6D3B\u8DC3\u4F1A\u8BDD
  help      \u663E\u793A\u5E2E\u52A9\u4FE1\u606F

\u793A\u4F8B:
  claude-monitor start
  claude-monitor list
`);
}
async function main() {
  const command = process.argv[2] || "help";
  switch (command) {
    case "start":
      await startCommand();
      break;
    case "stop":
      await stopCommand();
      break;
    case "status":
      await statusCommand();
      break;
    case "list":
      await listCommand();
      break;
    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;
    default:
      logError(`\u672A\u77E5\u547D\u4EE4: ${command}`);
      showHelp();
      process.exit(1);
  }
}
main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
//# sourceMappingURL=cli.js.map