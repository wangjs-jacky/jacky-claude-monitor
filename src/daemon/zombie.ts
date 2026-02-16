// src/daemon/zombie.ts
import { sessionStore } from './store.js';
import { sendNotification } from '../notify/index.js';
import { DEFAULT_CONFIG } from '../types.js';

let checkInterval: ReturnType<typeof setInterval> | null = null;

/**
 * 启动僵尸进程检测
 */
export function startZombieChecker(intervalMs: number = DEFAULT_CONFIG.checkInterval): void {
  if (checkInterval) {
    console.log('Zombie checker already running');
    return;
  }

  console.log(`Starting zombie checker (interval: ${intervalMs}ms)`);

  checkInterval = setInterval(async () => {
    const sessions = sessionStore.getAll();

    for (const session of sessions) {
      if (!isProcessAlive(session.pid)) {
        console.log(`Detected zombie session: PID ${session.pid} (${session.project})`);
        sessionStore.delete(session.pid);

        // 发送通知
        try {
          await sendNotification(
            'Claude Monitor - 会话异常终止',
            `项目: ${session.project}`,
            'Basso'
          );
        } catch (err) {
          console.error('Failed to send notification:', err);
        }
      }
    }
  }, intervalMs);
}

/**
 * 停止僵尸进程检测
 */
export function stopZombieChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('Zombie checker stopped');
  }
}

/**
 * 检查进程是否存活
 */
function isProcessAlive(pid: number): boolean {
  try {
    // 发送信号 0 检查进程是否存在
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
