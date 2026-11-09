import { aggregateCompleteCandles } from "./gateCfdClient.js";

const DEFAULT_BASE_URL = "https://api.gateio.ws/api/v4/futures/usdt";

export const CORE_CRYPTO_CONTRACTS = [
  "BTC_USDT", "ETH_USDT", "SOL_USDT", "XRP_USDT", "BNB_USDT", "ADA_USDT",
  "AVAX_USDT", "LINK_USDT", "DOT_USDT", "LTC_USDT", "BCH_USDT", "ZEC_USDT",
  "SUI_USDT", "TRX_USDT", "TON_USDT", "XLM_USDT", "UNI_USDT", "AAVE_USDT",
  "NEAR_USDT", "ETC_USDT"
];

export const MEME_CONTRACTS = [
  "DOGE_USDT", "SHIB_USDT", "PEPE_USDT", "BONK_USDT", "FLOKI_USDT", "WIF_USDT",
  "PENGU_USDT", "POPCAT_USDT", "TRUMP_USDT", "BRETT_USDT", "MOG_USDT", "TURBO_USDT"
];

const NATIVE_INTERVALS = new Map([
  [900, "15m"], [1800, "30m"], [3600, "1h"], [14400, "4h"],
  [28800, "8h"], [86400, "1d"], [604800, "7d"]
]);

export async function fetchActiveCryptoInstruments({
  baseUrl = futuresBaseUrl(),
  timeoutMs = 15000,
  coreContracts = configuredContracts("GATE_CRYPTO_CONTRACTS", CORE_CRYPTO_CONTRACTS),
  memeContracts = configuredContracts("GATE_MEME_CONTRACTS", MEME_CONTRACTS)
} = {}) {
  const wanted = new Map([
    ...coreContracts.map((name, index) => [name, { category: "crypto", index }]),
    ...memeContracts.map((name, index) => [name, { category: "meme_coins", index }])
  ]);

  const results = await Promise.allSettled(
    [...wanted.keys()].map((name) => fetchContract({ baseUrl, name, timeoutMs }))
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  const contracts = results.map((result) => result.value).filter(Boolean);

  return contracts
    .filter((contract) => wanted.has(contract.name) && !contract.in_delisting)
    .map((contract) => mapGateFuturesInstrument(contract, wanted.get(contract.name)))
    .sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
}

export async function fetchFuturesCandles({
  symbol,
  granularitySeconds,
  count = 3,
  timeoutMs = 15000,
  baseUrl = futuresBaseUrl()
}) {
  const nativeInterval = NATIVE_INTERVALS.get(granularitySeconds);
  if (nativeInterval) {
    return fetchNativeCandles({ baseUrl, symbol, interval: nativeInterval, count, timeoutMs });
  }

  const baseSeconds = baseGranularityFor(granularitySeconds);
  const baseInterval = NATIVE_INTERVALS.get(baseSeconds);
  if (!baseInterval) throw new Error(`Unsupported Gate futures granularity: ${granularitySeconds}s`);
  const parts = granularitySeconds / baseSeconds;
  const candles = await fetchNativeCandles({
    baseUrl,
    symbol,
    interval: baseInterval,
    count: Math.min(2000, count * parts + parts),
    timeoutMs
  });
  return aggregateCompleteCandles(candles, granularitySeconds, baseSeconds, 0).slice(-count);
}

export function mapGateFuturesInstrument(contract, { category, index }) {
  const ticker = contract.name.replace(/_USDT$/, "");
  return {
    symbol: contract.name,
    displayName: `${ticker} / USDT`,
    market: category === "meme_coins" ? "Meme coin perpetual" : "Crypto perpetual",
    category,
    order: index,
    isOpen: !contract.in_delisting,
    provider: "gate_futures"
  };
}

export function normalizeFuturesCandles(rawCandles = []) {
  return rawCandles
    .map((candle) => ({
      epoch: Number(candle.t),
      open: Number(candle.o),
      high: Number(candle.h),
      low: Number(candle.l),
      close: Number(candle.c)
    }))
    .filter((candle) => Object.values(candle).every(Number.isFinite))
    .sort((a, b) => a.epoch - b.epoch);
}

async function fetchNativeCandles({ baseUrl, symbol, interval, count, timeoutMs }) {
  const query = new URLSearchParams({ contract: symbol, interval, limit: String(Math.min(2000, count)) });
  return normalizeFuturesCandles(await requestJson(`${baseUrl}/candlesticks?${query}`, timeoutMs));
}

async function requestJson(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const payload = await response.json();
  if (!response.ok || payload.label) {
    const error = new Error(`Gate futures API error: ${payload.message || response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function fetchContract({ baseUrl, name, timeoutMs }) {
  const url = `${baseUrl}/contracts/${encodeURIComponent(name)}`;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestJson(url, timeoutMs);
    } catch (error) {
      if (error.status === 404) return null;
      lastError = error;
    }
  }
  throw lastError;
}

function baseGranularityFor(seconds) {
  if ([7200, 10800, 21600].includes(seconds)) return 3600;
  if (seconds === 43200) return 14400;
  return 0;
}

function configuredContracts(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return [...new Set(value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function futuresBaseUrl() {
  return process.env.GATE_FUTURES_BASE_URL || DEFAULT_BASE_URL;
}
