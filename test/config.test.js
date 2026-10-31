import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("uses Railway volume mount path for settings when available", () => {
  const config = loadConfig({
    RAILWAY_VOLUME_MOUNT_PATH: "/data/"
  });

  assert.equal(config.storage.settingsPath, "/data/settings.json");
  assert.equal(config.storage.alertHistoryPath, "/data/alert-history.json");
});

test("allows explicit settings path override", () => {
  const config = loadConfig({
    RAILWAY_VOLUME_MOUNT_PATH: "/data",
    SETTINGS_PATH: "/custom/settings.json"
  });

  assert.equal(config.storage.settingsPath, "/custom/settings.json");
});

test("allows explicit alert history configuration", () => {
  const config = loadConfig({
    ALERT_HISTORY_PATH: "/custom/alerts.json",
    ALERT_HISTORY_RETENTION_DAYS: "45"
  });

  assert.equal(config.storage.alertHistoryPath, "/custom/alerts.json");
  assert.equal(config.alerts.historyRetentionDays, 45);
});

test("parses multiple Telegram chat ids", () => {
  const config = loadConfig({
    TELEGRAM_CHAT_IDS: "123, 456"
  });

  assert.deepEqual(config.telegram.allowedChatIds, ["123", "456"]);
});
