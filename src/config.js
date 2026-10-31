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
      cooldownSeconds: numberFromEnv(env.ALERT_COOLDOWN_SECONDS, 300)
    },
    storage: {
      settingsPath: env.SETTINGS_PATH || defaultSettingsPath(env)
    }
  };
}

function defaultSettingsPath(env) {
  if (env.RAILWAY_VOLUME_MOUNT_PATH) {
    return `${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/[\\/]+$/, "")}/settings.json`;
  }
  return "work/settings.json";
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
