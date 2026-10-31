import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class AlertGate {
  constructor({ historyPath = "", historyRetentionDays = 90 } = {}) {
    this.historyPath = historyPath;
    this.retentionMs = historyRetentionDays * 24 * 60 * 60 * 1000;
    this.sent = this.load();
    this.prune(Date.now());
  }

  shouldSend(signal, now = Date.now()) {
    if (!signal) return false;
    this.prune(now);
    return !this.sent.has(signal.id);
  }

  markSent(signal, now = Date.now()) {
    if (!signal?.id) return;
    this.sent.set(signal.id, now);
    this.prune(now);
    this.save();
  }

  load() {
    if (!this.historyPath) return new Map();

    const backupPath = `${this.historyPath}.bak`;
    const readablePath = existsSync(this.historyPath)
      ? this.historyPath
      : existsSync(backupPath)
        ? backupPath
        : "";
    if (!readablePath) return new Map();

    try {
      const state = JSON.parse(readFileSync(readablePath, "utf8"));
      const entries = Object.entries(state?.sentSignals || {}).filter(
        ([id, sentAt]) => id && Number.isFinite(sentAt)
      );
      return new Map(entries);
    } catch (error) {
      console.error(`[alerts] Could not load alert history: ${error.message}`);
      return new Map();
    }
  }

  prune(now) {
    for (const [id, sentAt] of this.sent) {
      if (now - sentAt > this.retentionMs) this.sent.delete(id);
    }
  }

  save() {
    if (!this.historyPath) return;

    mkdirSync(dirname(this.historyPath), { recursive: true });
    const temporaryPath = `${this.historyPath}.${process.pid}.tmp`;
    const state = {
      version: 1,
      sentSignals: Object.fromEntries(this.sent)
    };
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
    replaceFile(temporaryPath, this.historyPath);
  }
}

function replaceFile(temporaryPath, targetPath) {
  const backupPath = `${targetPath}.bak`;

  try {
    renameSync(temporaryPath, targetPath);
    rmSync(backupPath, { force: true });
    return;
  } catch (error) {
    if (!existsSync(targetPath) || !["EEXIST", "EPERM"].includes(error.code)) throw error;
  }

  rmSync(backupPath, { force: true });
  renameSync(targetPath, backupPath);
  try {
    renameSync(temporaryPath, targetPath);
    rmSync(backupPath, { force: true });
  } catch (error) {
    if (!existsSync(targetPath) && existsSync(backupPath)) renameSync(backupPath, targetPath);
    throw error;
  }
}

export function formatSignalMessage({ signal, symbol, displayName = symbol, granularitySeconds }) {
  const instrument = String(displayName).toUpperCase();
  const direction = `${signal.direction.charAt(0).toUpperCase()}${signal.direction.slice(1).toLowerCase()}`;
  return `${instrument} ${direction} signal ${formatTimeframe(granularitySeconds)}`;
}

function formatTimeframe(seconds) {
  if (seconds === 900) return "M15";
  if (seconds === 1800) return "M30";
  if (seconds === 3600) return "H1";
  if (seconds === 7200) return "H2";
  if (seconds === 10800) return "H3";
  if (seconds === 14400) return "H4";
  if (seconds === 21600) return "H6";
  if (seconds === 28800) return "H8";
  if (seconds === 43200) return "H12";
  if (seconds === 86400) return "D1";
  if (seconds === 604800) return "W1";
  return `${seconds}s`;
}
