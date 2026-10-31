export function loadConfig(env = process.env) {
  return {
    gate: {
      cfdBaseUrl: env.GATE_CFD_BASE_URL || "https://api.gateio.ws/api/v4/tradfi"
    },
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN || "",
      chatId: env.TELEGRAM_CHAT_ID || "",
      allowedChatIds: listFromEnv(env.TELEGRAM_CHAT_IDS || env.TELEGRAM_CHAT_ID || "")
    },
    alerts: {
      historyRetentionDays: numberFromEnv(env.ALERT_HISTORY_RETENTION_DAYS, 90)
    },
    storage: {
      settingsPath: env.SETTINGS_PATH || defaultStoragePath(env, "settings.json"),
      alertHistoryPath: env.ALERT_HISTORY_PATH || defaultStoragePath(env, "alert-history.json")
    }
  };
}

function defaultStoragePath(env, filename) {
  if (env.RAILWAY_VOLUME_MOUNT_PATH) {
    return `${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/[\\/]+$/, "")}/${filename}`;
  }
  return `work/${filename}`;
}

function numberFromEnv(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function listFromEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
