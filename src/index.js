import { AlertGate } from "./alertGate.js";
import { loadConfig } from "./config.js";
import { fetchActiveInstruments, fetchCandleBoundaryOffsets, fetchCandles } from "./gateCfdClient.js";
import { loadEnvFile } from "./envFile.js";
import { fetchActiveCryptoInstruments, fetchFuturesCandles } from "./gateFuturesClient.js";
import { BoundaryScheduler } from "./scheduler.js";
import { SettingsStore } from "./settingsStore.js";
import { TelegramNotifier } from "./telegram.js";
import { TelegramSettingsBot } from "./telegramSettingsBot.js";
import { applyGateMt5BoundaryOffsets, TIMEFRAMES } from "./timeframes.js";

loadEnvFile();

let settingsBot;
let cfdScheduler;
let cryptoScheduler;

function shutdown(signal) {
  console.log(`Stopping bot after ${signal}`);
  settingsBot?.stop();
  cfdScheduler?.stop();
  cryptoScheduler?.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const config = loadConfig();
const [cfdResult, cryptoResult] = await Promise.allSettled([
  fetchActiveInstruments(),
  fetchActiveCryptoInstruments()
]);
const cfdInstruments = startupInstruments(cfdResult, "CFD");
let cryptoInstruments = startupInstruments(cryptoResult, "crypto");
const boundarySymbol = cfdInstruments.find((instrument) => instrument.symbol === "EURUSD")?.symbol || cfdInstruments[0]?.symbol;
if (boundarySymbol) {
  try {
    applyGateMt5BoundaryOffsets(await fetchCandleBoundaryOffsets({ symbol: boundarySymbol }));
  } catch (error) {
    console.error(`[startup] CFD candle-boundary refresh failed; using default boundaries: ${error.message}`);
  }
}
let instruments = [...cfdInstruments, ...cryptoInstruments];
const instrumentSymbols = instruments.map((instrument) => instrument.symbol);
const notifier = new TelegramNotifier(config.telegram);
const alertGate = new AlertGate({
  ...config.alerts,
  historyPath: config.storage.alertHistoryPath
});
const settingsStore = new SettingsStore({
  path: config.storage.settingsPath,
  instruments: instrumentSymbols,
  timeframes: TIMEFRAMES,
  defaultChatId: config.telegram.chatId
});

settingsBot = new TelegramSettingsBot({
  notifier,
  settingsStore,
  instruments,
  timeframes: TIMEFRAMES,
  allowedChatIds: config.telegram.allowedChatIds,
  onRefreshCrypto: refreshCryptoLists
});

cfdScheduler = new BoundaryScheduler({
  config,
  settingsStore,
  instruments: cfdInstruments,
  timeframes: TIMEFRAMES,
  notifier,
  alertGate,
  fetchInstruments: fetchActiveInstruments,
  fetchMarketCandles: fetchCandles
});

const cryptoTimeframes = TIMEFRAMES.map((timeframe) => ({ ...timeframe, boundaryOffsetSeconds: 0 }));
cryptoScheduler = new BoundaryScheduler({
  config,
  settingsStore,
  instruments: cryptoInstruments,
  timeframes: cryptoTimeframes,
  notifier,
  alertGate,
  fetchInstruments: fetchActiveCryptoInstruments,
  fetchMarketCandles: fetchFuturesCandles,
  statusRefreshMs: 15 * 60_000
});

console.log("Starting Gate CFD and crypto CRT alert bot");
console.log(`Loaded ${cfdInstruments.length} Gate CFD instruments`);
console.log(`Loaded ${cryptoInstruments.length} Gate USDT perpetual instruments`);
console.log(`Timeframes=${TIMEFRAMES.map((timeframe) => timeframe.label).join(", ")}`);
console.log(`Settings path=${config.storage.settingsPath}`);
console.log(`Alert history path=${config.storage.alertHistoryPath}`);
console.log("All instruments and timeframes are off until enabled in Telegram.");

settingsBot.start();
cfdScheduler.start();
cryptoScheduler.start();

async function refreshCryptoLists() {
  cryptoInstruments = await fetchActiveCryptoInstruments();
  instruments = [...cfdInstruments, ...cryptoInstruments];
  settingsStore.updateInstruments(instruments.map((instrument) => instrument.symbol));
  settingsBot.updateInstruments(instruments);
  cryptoScheduler.updateInstruments(cryptoInstruments);
  return {
    crypto: cryptoInstruments.filter((instrument) => instrument.category === "crypto").length,
    memes: cryptoInstruments.filter((instrument) => instrument.category === "meme_coins").length
  };
}

function startupInstruments(result, market) {
  if (result.status === "fulfilled") return result.value;
  console.error(`[startup] ${market} market data is unavailable: ${result.reason?.message || result.reason}`);
  console.error(`[startup] Continuing without ${market}; the other market remains operational.`);
  return [];
}
