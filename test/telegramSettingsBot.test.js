import test from "node:test";
import assert from "node:assert/strict";
import { TelegramSettingsBot } from "../src/telegramSettingsBot.js";

const timeframes = [{ key: "M15", label: "M15", seconds: 900 }];
const instruments = [
  {
    symbol: "frxEURUSD",
    displayName: "EUR/USD",
    market: "Forex",
    category: "currency_pairs",
    isOpen: true
  },
  {
    symbol: "NAS100",
    displayName: "Nasdaq 100",
    market: "Indices",
    category: "nas_us100",
    isOpen: true
  }
];
function makeSettingsStore() {
  return {
    stopped: false,
    enabled: new Set(),
    isEnabled(chatId, symbol, timeframeKey) {
      return this.enabled.has(`${chatId}:${symbol}:${timeframeKey}`);
    },
    toggle: () => true,
    setTimeframeForInstruments(chatId, symbols, timeframeKey, enabled) {
      for (const symbol of symbols) {
        const key = `${chatId}:${symbol}:${timeframeKey}`;
        if (enabled) this.enabled.add(key);
        else this.enabled.delete(key);
      }
      return symbols.length;
    },
    stopAll() {
      this.stopped = true;
    },
    enabledSelections: () => []
  };
}

test("shows category menu first", () => {
  const bot = new TelegramSettingsBot({
    notifier: fakeNotifier(),
    settingsStore: makeSettingsStore(),
    instruments,
    timeframes,
    allowedChatIds: ["123"]
  });

  assert.match(bot.mainText(), /Choose a command or open a market group/);
  assert.equal(bot.mainKeyboard().inline_keyboard[0][0].text, "STATUS");
  assert.equal(bot.mainKeyboard().inline_keyboard[1][0].text, "SEND TEST ALERT");
  assert.equal(bot.mainKeyboard().inline_keyboard[2][0].text, "STOP ALL MONITORING");
  assert.equal(bot.mainKeyboard().inline_keyboard[3][0].text, "CURRENCIES: OFF");
  assert.equal(bot.mainKeyboard().inline_keyboard[4][0].text, "NAS / USTEC / US100: OFF");
});

test("clamps category menu page number", () => {
  const bot = new TelegramSettingsBot({
    notifier: fakeNotifier(),
    settingsStore: makeSettingsStore(),
    instruments,
    timeframes,
    allowedChatIds: ["123"]
  });

  assert.match(bot.categoryText("currency_pairs", 99), /Page 1 of 1/);
  assert.match(bot.categoryKeyboard("currency_pairs", 0, "123").inline_keyboard[0][0].text, /SET TIMEFRAMES FOR ALL CURRENCIES/);
});

test("bulk timeframe toggle enables a category and still allows mixed settings", async () => {
  const notifier = fakeNotifier();
  const settingsStore = makeSettingsStore();
  const bot = new TelegramSettingsBot({
    notifier,
    settingsStore,
    instruments,
    timeframes,
    allowedChatIds: ["123"]
  });

  await bot.handleCallback({
    id: "callback-bulk",
    data: "bulk_toggle:currency_pairs:M15",
    message: { chat: { id: 123 }, message_id: 1 }
  });

  assert.equal(settingsStore.isEnabled(123, "frxEURUSD", "M15"), true);
  assert.equal(bot.bulkTimeframeStatus(bot.categoryByKey("currency_pairs"), 123, "M15"), "ON");
  assert.match(notifier.callbackText, /M15 on for 1 instrument/);

  settingsStore.enabled.delete("123:frxEURUSD:M15");
  assert.equal(bot.bulkTimeframeStatus(bot.categoryByKey("currency_pairs"), 123, "M15"), "OFF");
});

test("answers stale instrument callback", async () => {
  const notifier = fakeNotifier();
  const settingsStore = makeSettingsStore();
  const bot = new TelegramSettingsBot({
    notifier,
    settingsStore,
    instruments,
    timeframes,
    allowedChatIds: ["123"]
  });

  await bot.handleCallback({
    id: "callback-1",
    data: "instrument:currency_pairs:99",
    message: { chat: { id: 123 }, message_id: 1 }
  });

  assert.equal(notifier.callbackText, "Instrument is no longer available");
});

test("status shows no active monitoring", () => {
  const bot = new TelegramSettingsBot({
    notifier: fakeNotifier(),
    settingsStore: makeSettingsStore(),
    instruments,
    timeframes,
    allowedChatIds: ["123"]
  });

  assert.match(bot.statusText(), /Nothing is active/);
});

test("stop confirm disables all monitoring", async () => {
  const notifier = fakeNotifier();
  const settingsStore = makeSettingsStore();
  const bot = new TelegramSettingsBot({
    notifier,
    settingsStore,
    instruments,
    timeframes,
    allowedChatIds: ["123"]
  });

  await bot.handleCallback({
    id: "callback-2",
    data: "stop_confirm",
    message: { chat: { id: 123 }, message_id: 1 }
  });

  assert.equal(settingsStore.stopped, true);
});

test("test alert sends a marked PNG alert through Telegram", async () => {
  const notifier = fakeNotifier();
  const bot = new TelegramSettingsBot({
    notifier,
    settingsStore: makeSettingsStore(),
    instruments,
    timeframes,
    allowedChatIds: ["123"]
  });

  await bot.handleCallback({
    id: "callback-test-alert",
    data: "test_alert",
    message: { chat: { id: 123 }, message_id: 1 }
  });

  assert.equal(notifier.photo.caption, "TEST ALERT — GOLD Bullish signal M15");
  assert.equal(notifier.photo.filename, "crt-test-alert.png");
  assert.equal(notifier.photo.imageBuffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(notifier.callbackText, "Test alert sent");
});

function fakeNotifier() {
  const notifier = {
    callbackText: "",
    photo: null,
    answerCallbackQuery: async (_id, text = "") => {
      notifier.callbackText = text;
    },
    editMessageWithKeyboard: async () => ({ ok: true }),
    sendPhoto: async (photo) => {
      notifier.photo = photo;
      return { ok: true };
    }
  };
  return notifier;
}
