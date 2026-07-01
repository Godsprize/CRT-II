import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("uses Railway volume mount path for settings when available", () => {
  const config = loadConfig({
    RAILWAY_VOLUME_MOUNT_PATH: "/data/"
  });

  assert.equal(config.storage.settingsPath, "/data/settings.json");
});

test("allows explicit settings path override", () => {
  const config = loadConfig({
    RAILWAY_VOLUME_MOUNT_PATH: "/data",
    SETTINGS_PATH: "/custom/settings.json"
  });

  assert.equal(config.storage.settingsPath, "/custom/settings.json");
});
