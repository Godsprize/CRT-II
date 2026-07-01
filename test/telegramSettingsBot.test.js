import test from "node:test";
import assert from "node:assert/strict";
import { TelegramSettingsBot } from "../src/telegramSettingsBot.js";

const timeframes = [{ key: "15m", label: "15m", seconds: 900 }];
const instruments = [
  {
    symbol: "frxEURUSD",
    displayName: "EUR/USD",
    market: "Forex",
    category: "currency_pairs",
    isOpen: true
  },
  {
    symbol: "R_100",
    displayName: "Volatility 100 Index",
    market: "Derived",
    category: "deriv_indices",
    isOpen: true
  }
];
const settingsStore = {
  isEnabled: () => false,
  toggle: () => true
};

test("shows category menu first", () => {
  const bot = new TelegramSettingsBot({
    notifier: fakeNotifier(),
    settingsStore,
    instruments,
    timeframes,
    allowedChatId: "123"
  });

  assert.match(bot.mainText(), /Choose a market group/);
  assert.equal(bot.mainKeyboard().inline_keyboard[0][0].text, "CURRENCY PAIRS: OFF");
  assert.equal(bot.mainKeyboard().inline_keyboard[1][0].text, "DERIV INDICES: OFF");
});

test("clamps category menu page number", () => {
  const bot = new TelegramSettingsBot({
    notifier: fakeNotifier(),
    settingsStore,
    instruments,
    timeframes,
    allowedChatId: "123"
  });

  assert.match(bot.categoryText("currency_pairs", 99), /Page 1 of 1/);
});

test("answers stale instrument callback", async () => {
  const notifier = fakeNotifier();
  const bot = new TelegramSettingsBot({
    notifier,
    settingsStore,
    instruments,
    timeframes,
    allowedChatId: "123"
  });

  await bot.handleCallback({
    id: "callback-1",
    data: "instrument:currency_pairs:99",
    message: { chat: { id: 123 }, message_id: 1 }
  });

  assert.equal(notifier.callbackText, "Instrument is no longer available");
});

function fakeNotifier() {
  const notifier = {
    callbackText: "",
    answerCallbackQuery: async (_id, text = "") => {
      notifier.callbackText = text;
    },
    editMessageWithKeyboard: async () => ({ ok: true })
  };
  return notifier;
}
