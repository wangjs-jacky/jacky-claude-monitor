// src/config/index.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CONFIG, type Config } from '../types.js';

const CONFIG_DIR = join(process.env.HOME || '', '.claude-monitor');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * 加载配置（合并默认配置）
 */
export function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      const userConfig = JSON.parse(content) as Partial<Config>;
      return mergeConfig(DEFAULT_CONFIG, userConfig);
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * 保存配置
 */
export function saveConfig(config: Config): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Failed to save config:', err);
    throw err;
  }
}

/**
 * 深度合并配置
 */
function mergeConfig(defaults: Config, user: Partial<Config>): Config {
  return {
    ...defaults,
    ...user,
    floatingWindow: {
      ...defaults.floatingWindow,
      ...user.floatingWindow,
      scenarios: {
        ...defaults.floatingWindow.scenarios,
        ...user.floatingWindow?.scenarios,
      },
    },
    notifications: {
      ...defaults.notifications,
      ...user.notifications,
    },
  };
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * 重置为默认配置
 */
export function resetConfig(): void {
  saveConfig(DEFAULT_CONFIG);
}

/**
 * 更新部分配置
 */
export function updateConfig(updates: Partial<Config>): Config {
  const current = loadConfig();
  const updated = mergeConfig(current, updates);
  saveConfig(updated);
  return updated;
}
