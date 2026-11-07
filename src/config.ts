import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import type { ThemeName } from './theme.ts';

export interface Config {
  theme: ThemeName;
  lineNumbers: boolean;
  width: number;
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'mdt', 'config.toml');
}

export function loadConfig(path = configPath()): Config {
  const config: Config = { theme: 'dark', lineNumbers: false, width: 0 };
  let raw: Record<string, unknown>;
  try {
    raw = parse(readFileSync(path, 'utf8'));
  } catch {
    return config;
  }
  if (raw.theme === 'dark' || raw.theme === 'light') config.theme = raw.theme;
  if (typeof raw.line_numbers === 'boolean') config.lineNumbers = raw.line_numbers;
  if (typeof raw.width === 'number' && raw.width >= 0) config.width = Math.floor(raw.width);
  return config;
}
