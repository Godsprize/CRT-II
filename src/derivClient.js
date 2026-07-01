import { normalizeHistoricalCandles, normalizeOhlc, upsertCandle } from "./candles.js";

export async function fetchCandles({
  appId,
  symbol,
  granularitySeconds,
  count = 3,
  timeoutMs = 15000
}) {
  const request = {
    ticks_history: symbol,
    adjust_start_time: 1,
    count,
    end: "latest",
    start: 1,
    style: "candles",
    granularity: granularitySeconds
  };

  return new Promise((resolve, reject) => {
    const url = `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`;
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out fetching ${symbol} ${granularitySeconds}s candles`));
    }, timeoutMs);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(request));
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      clearTimeout(timeout);
      socket.close();

      if (message.error) {
        reject(new Error(`Deriv API error: ${message.error.message}`));
        return;
      }

      resolve(normalizeHistoricalCandles(message.candles));
    });

    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error(`Unable to connect to Deriv for ${symbol}`));
    });
  });
}

export async function fetchActiveInstruments({ appId, timeoutMs = 15000 }) {
  const message = await derivRequest({
    appId,
    request: { active_symbols: "brief" },
    timeoutMs,
    errorLabel: "active instruments"
  });

  return (message.active_symbols || [])
    .map(mapActiveSymbolForMenu)
    .filter((instrument) => instrument.symbol)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function mapActiveSymbolForMenu(symbol) {
  return {
    symbol: symbol.symbol,
    displayName: displayNameWithAlias(symbol),
    market: symbol.market_display_name || symbol.market || "Other",
    category: categoryFor(symbol.market_display_name || symbol.market || "Other"),
    isOpen: symbol.exchange_is_open !== 0
  };
}

function categoryFor(market) {
  if (market === "Forex") return "currency_pairs";
  if (market === "Derived") return "deriv_indices";
  if (market === "Cryptocurrencies") return "crypto";
  if (market === "Stock Indices") return "indices";
  if (market === "Commodities") return "commodities";
  return "other";
}

function displayNameWithAlias(symbol) {
  const aliases = {
    OTC_NDX: "US Tech 100 / NAS100",
    OTC_DJI: "Wall Street 30 / US30",
    OTC_SPC: "US 500 / SPX500"
  };
  if (aliases[symbol.symbol]) return aliases[symbol.symbol];
  return cleanDisplayName(symbol.display_name || symbol.symbol);
}

function cleanDisplayName(displayName) {
  return displayName.replace(/\s+Index$/u, "");
}

async function derivRequest({ appId, request, timeoutMs, errorLabel }) {
  return new Promise((resolve, reject) => {
    const url = `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`;
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out fetching ${errorLabel}`));
    }, timeoutMs);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(request));
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      clearTimeout(timeout);
      socket.close();

      if (message.error) {
        reject(new Error(`Deriv API error: ${message.error.message}`));
        return;
      }

      resolve(message);
    });

    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error(`Unable to connect to Deriv for ${errorLabel}`));
    });
  });
}

export class DerivClient {
  constructor({ appId, symbol, granularitySeconds, candleCount }) {
    this.appId = appId;
    this.symbol = symbol;
    this.granularitySeconds = granularitySeconds;
    this.candleCount = candleCount;
    this.socket = null;
    this.candles = [];
  }

  connect({ onCandles, onStatus = console.log }) {
    const url = `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(this.appId)}`;
    this.socket = new WebSocket(url);

    this.socket.addEventListener("open", () => {
      onStatus(`Connected to Deriv for ${this.symbol}`);
      this.socket.send(JSON.stringify(this.historyRequest()));
    });

    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.error) {
        throw new Error(`Deriv API error: ${message.error.message}`);
      }

      if (message.msg_type === "candles") {
        this.candles = normalizeHistoricalCandles(message.candles).slice(-this.candleCount);
        onCandles(this.candles);
      }

      if (message.msg_type === "ohlc") {
        this.candles = upsertCandle(
          this.candles,
          normalizeOhlc(message.ohlc),
          this.candleCount
        );
        onCandles(this.candles);
      }
    });

    this.socket.addEventListener("close", () => {
      onStatus("Deriv socket closed");
    });

    this.socket.addEventListener("error", (error) => {
      onStatus(`Deriv socket error: ${error.message || "unknown error"}`);
    });
  }

  close() {
    this.socket?.close();
  }

  historyRequest() {
    return {
      ticks_history: this.symbol,
      adjust_start_time: 1,
      count: this.candleCount,
      end: "latest",
      start: 1,
      style: "candles",
      granularity: this.granularitySeconds,
      subscribe: 1
    };
  }
}
