const DEFAULT_BASE_URL = "https://api.gateio.ws/api/v4/tradfi";
const NATIVE_INTERVALS = new Map([
  [900, "15m"],
  [3600, "1h"],
  [14400, "4h"],
  [86400, "1d"],
  [604800, "7d"]
]);

export async function fetchActiveInstruments({ baseUrl = gateBaseUrl(), timeoutMs = 15000 } = {}) {
  const payload = await requestJson(`${baseUrl}/symbols`, timeoutMs);
  const instruments = (payload.data?.list || []).map(mapGateInstrument);
  const symbols = new Set(instruments.map((instrument) => instrument.symbol));

  return instruments
    .filter((instrument) => !isLeveragedDuplicate(instrument.symbol, symbols))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function fetchCandles({
  symbol,
  granularitySeconds,
  count = 3,
  timeoutMs = 15000,
  baseUrl = gateBaseUrl()
}) {
  const nativeInterval = NATIVE_INTERVALS.get(granularitySeconds);
  if (nativeInterval) return fetchNativeCandles({ baseUrl, symbol, interval: nativeInterval, count, timeoutMs });

  const baseSeconds = baseGranularityFor(granularitySeconds);
  const baseInterval = NATIVE_INTERVALS.get(baseSeconds);
  if (!baseInterval) throw new Error(`Unsupported Gate CFD granularity: ${granularitySeconds}s`);

  const parts = granularitySeconds / baseSeconds;
  const baseCount = Math.min(500, count * parts + parts);
  const [baseCandles, dailyCandles] = await Promise.all([
    fetchNativeCandles({ baseUrl, symbol, interval: baseInterval, count: baseCount, timeoutMs }),
    fetchNativeCandles({ baseUrl, symbol, interval: "1d", count: 2, timeoutMs })
  ]);
  const sessionOffset = dailyCandles.at(-1)?.epoch % 86400 || 0;
  return aggregateCompleteCandles(baseCandles, granularitySeconds, baseSeconds, sessionOffset).slice(-count);
}

export async function fetchCandleBoundaryOffsets({ symbol, baseUrl = gateBaseUrl(), timeoutMs = 15000 }) {
  const [daily, weekly] = await Promise.all([
    fetchNativeCandles({ baseUrl, symbol, interval: "1d", count: 2, timeoutMs }),
    fetchNativeCandles({ baseUrl, symbol, interval: "7d", count: 2, timeoutMs })
  ]);
  return {
    sessionAnchorEpoch: daily.at(-1)?.epoch,
    weeklyAnchorEpoch: weekly.at(-1)?.epoch
  };
}

export function mapGateInstrument(raw) {
  return {
    symbol: raw.symbol,
    displayName: raw.symbol_desc || raw.symbol,
    market: marketName(raw.category_id),
    category: categoryFor(raw),
    isOpen: raw.status === "open",
    provider: "gate_cfd"
  };
}

export function normalizeGateCandles(rawCandles = []) {
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

export function aggregateCompleteCandles(candles, targetSeconds, baseSeconds, sessionOffset = 0) {
  const expected = targetSeconds / baseSeconds;
  const buckets = new Map();
  for (const candle of candles) {
    const epoch = Math.floor((candle.epoch - sessionOffset) / targetSeconds) * targetSeconds + sessionOffset;
    const bucket = buckets.get(epoch) || { epoch, items: [] };
    bucket.items.push(candle);
    buckets.set(epoch, bucket);
  }

  return [...buckets.values()]
    .filter(({ items }) => items.length === expected && items.every((item, index) =>
      index === 0 || item.epoch - items[index - 1].epoch === baseSeconds
    ))
    .map(({ epoch, items }) => ({
      epoch,
      open: items[0].open,
      high: Math.max(...items.map((item) => item.high)),
      low: Math.min(...items.map((item) => item.low)),
      close: items.at(-1).close
    }))
    .sort((a, b) => a.epoch - b.epoch);
}

async function fetchNativeCandles({ baseUrl, symbol, interval, count, timeoutMs }) {
  const url = `${baseUrl}/symbols/${encodeURIComponent(symbol)}/klines?kline_type=${interval}&limit=${Math.min(500, count)}`;
  const payload = await requestJson(url, timeoutMs);
  return normalizeGateCandles(payload.data?.list || []);
}

async function requestJson(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const payload = await response.json();
  if (!response.ok || payload.label) {
    throw new Error(`Gate CFD API error: ${payload.message || response.statusText}`);
  }
  return payload;
}

function baseGranularityFor(seconds) {
  if (seconds === 1800) return 900;
  if ([7200, 10800, 21600].includes(seconds)) return 3600;
  if ([28800, 43200].includes(seconds)) return 14400;
  return 0;
}

function categoryFor(raw) {
  if (raw.symbol === "XAUUSD") return "gold";
  if (raw.symbol === "NAS100") return "nas_us100";
  if (raw.symbol === "US30") return "us30_dow";
  return ({ 1: "metals", 2: "stocks", 3: "indices", 4: "currency_pairs", 5: "commodities" })[raw.category_id] || "other";
}

function marketName(categoryId) {
  return ({ 1: "Metals", 2: "Stocks", 3: "Indices", 4: "Forex", 5: "Commodities" })[categoryId] || "Other";
}

function isLeveragedDuplicate(symbol, symbols) {
  const base = symbol.replace(/(?:1000|500|200|100|50|20|10|5)$/, "");
  return base !== symbol && symbols.has(base);
}

function gateBaseUrl() {
  return process.env.GATE_CFD_BASE_URL || DEFAULT_BASE_URL;
}
