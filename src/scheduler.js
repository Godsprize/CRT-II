import { formatSignalMessage } from "./alertGate.js";
import { CHART_CANDLE_COUNT, renderCrtChartPng } from "./chartImage.js";
import { fetchActiveInstruments, fetchCandles } from "./gateCfdClient.js";
import { detectCrtFormation } from "./detectors/crtDetector.js";
import { scoreHtfContext } from "./htfScore.js";
import { higherTimeframeFor } from "./timeframes.js";

export class BoundaryScheduler {
  constructor({ config, settingsStore, instruments = [], timeframes, notifier, alertGate }) {
    this.config = config;
    this.settingsStore = settingsStore;
    this.instrumentBySymbol = new Map(instruments.map((instrument) => [instrument.symbol, instrument]));
    this.timeframes = timeframes;
    this.notifier = notifier;
    this.alertGate = alertGate;
    this.timers = [];
    this.running = new Set();
    this.marketStatusRefreshedAt = 0;
    this.marketStatusPromise = null;
  }

  start() {
    for (const timeframe of this.timeframes) {
      this.scheduleNext(timeframe);
    }
  }

  stop() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  scheduleNext(timeframe) {
    const delay = msUntilNextBoundary(
      timeframe.seconds,
      Date.now(),
      timeframe.boundaryOffsetSeconds || 0
    );
    const timer = setTimeout(async () => {
      await this.checkTimeframe(timeframe);
      this.scheduleNext(timeframe);
    }, delay);
    this.timers.push(timer);
    console.log(`[scheduler] ${timeframe.label} next check in ${Math.round(delay / 1000)}s`);
  }

  async checkTimeframe(timeframe) {
    const pairs = this.settingsStore.enabledPairsForTimeframe(timeframe.key);
    if (pairs.length === 0) {
      console.log(`[scheduler] ${timeframe.label}: no enabled instruments`);
      return;
    }

    if (!(await this.refreshMarketStatuses())) {
      console.error(`[scheduler] ${timeframe.label}: skipped because live Gate market status is unavailable`);
      return;
    }

    const openPairs = pairs.filter(({ instrument }) => this.instrumentBySymbol.get(instrument)?.isOpen);
    if (openPairs.length === 0) {
      console.log(`[scheduler] ${timeframe.label}: all enabled Gate markets are closed`);
      return;
    }

    const chatCount = openPairs.reduce((sum, pair) => sum + pair.chatIds.length, 0);
    console.log(`[scheduler] ${timeframe.label}: checking ${openPairs.length} open instrument(s) for ${chatCount} chat(s)`);
    await Promise.all(openPairs.map(({ instrument, chatIds }) => this.checkPair(instrument, timeframe, chatIds)));
  }

  async refreshMarketStatuses(now = Date.now()) {
    if (now - this.marketStatusRefreshedAt < 60_000) return true;
    if (!this.marketStatusPromise) {
      this.marketStatusPromise = fetchActiveInstruments()
        .then((instruments) => {
          this.instrumentBySymbol = new Map(instruments.map((instrument) => [instrument.symbol, instrument]));
          this.marketStatusRefreshedAt = Date.now();
          return true;
        })
        .catch((error) => {
          console.error(`[scheduler] Could not refresh Gate market status: ${error.message}`);
          return false;
        })
        .finally(() => {
          this.marketStatusPromise = null;
        });
    }
    return this.marketStatusPromise;
  }

  async checkPair(symbol, timeframe, chatIds) {
    const key = `${symbol}:${timeframe.key}`;
    if (this.running.has(key)) return;

    this.running.add(key);
    try {
      const candles = await fetchCandles({
        symbol,
        granularitySeconds: timeframe.seconds,
        count: CHART_CANDLE_COUNT + 2
      });

      const closedCandles = closedOnly(candles, timeframe.seconds);
      if (!hasFreshClosedCandle(closedCandles, timeframe.seconds)) {
        console.log(`[scheduler] ${symbol} ${timeframe.label}: latest candle is stale; market treated as closed`);
        return;
      }
      const signal = detectCrtFormation(closedCandles, { symbol, timeframe });
      if (!signal) return;

      signal.htf = await this.getHtfScore({ symbol, timeframe, signal });
      const instrument = this.instrumentBySymbol.get(symbol);

      const caption = formatSignalMessage({
        signal,
        symbol,
        displayName: instrument?.displayName || symbol,
        granularitySeconds: timeframe.seconds
      });
      const imageBuffer = renderCrtChartPng({ candles: closedCandles, signal });

      for (const chatId of chatIds) {
        const chatSignal = { ...signal, id: `${signal.id}:${chatId}` };
        if (!this.alertGate.shouldSend(chatSignal)) continue;

        await this.notifier.sendPhoto({
          chatId,
          imageBuffer,
          caption,
          filename: `crt-${symbol}-${timeframe.key}-${signal.candles.at(-1).epoch}.png`
        });
        this.alertGate.markSent(chatSignal);
      }
      console.log(`[alert] CRT ${signal.direction} ${instrument?.displayName || symbol} ${timeframe.label} -> ${chatIds.length} chat(s)`);
    } catch (error) {
      console.error(`[scheduler] ${symbol} ${timeframe.label}: ${error.message}`);
    } finally {
      this.running.delete(key);
    }
  }

  async getHtfScore({ symbol, timeframe, signal }) {
    const higherTimeframe = higherTimeframeFor(timeframe);
    if (!higherTimeframe) {
      return scoreHtfContext({ signal, timeframe, candles: [] });
    }

    const candles = await fetchCandles({
      symbol,
      granularitySeconds: higherTimeframe.seconds,
      count: 4
    });
    const closedCandles = closedOnly(candles, higherTimeframe.seconds);
    return scoreHtfContext({ signal, timeframe, candles: closedCandles });
  }
}

export function msUntilNextBoundary(timeframeSeconds, nowMs = Date.now(), boundaryOffsetSeconds = 0) {
  const intervalMs = timeframeSeconds * 1000;
  const offsetMs = boundaryOffsetSeconds * 1000;
  const next = Math.ceil((nowMs + 1 - offsetMs) / intervalMs) * intervalMs + offsetMs;
  return Math.max(1000, next - nowMs + 1500);
}

function closedOnly(candles, timeframeSeconds, nowEpoch = Math.floor(Date.now() / 1000)) {
  return candles.filter((candle) => candle.epoch + timeframeSeconds <= nowEpoch);
}

export function hasFreshClosedCandle(
  candles,
  timeframeSeconds,
  nowEpoch = Math.floor(Date.now() / 1000),
  graceSeconds = 5 * 60
) {
  const latest = candles.at(-1);
  if (!latest) return false;
  const age = nowEpoch - (latest.epoch + timeframeSeconds);
  return age >= 0 && age <= graceSeconds;
}
