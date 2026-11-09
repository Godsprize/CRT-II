import test from "node:test";
import assert from "node:assert/strict";
import {
  CORE_CRYPTO_CONTRACTS,
  MEME_CONTRACTS,
  mapGateFuturesInstrument,
  normalizeFuturesCandles
} from "../src/gateFuturesClient.js";

test("curated futures lists include ZEC and major meme contracts", () => {
  assert.ok(CORE_CRYPTO_CONTRACTS.includes("ZEC_USDT"));
  for (const symbol of ["DOGE_USDT", "SHIB_USDT", "PEPE_USDT", "BONK_USDT"]) {
    assert.ok(MEME_CONTRACTS.includes(symbol));
  }
});

test("maps active futures contracts into separate Telegram categories", () => {
  assert.deepEqual(
    mapGateFuturesInstrument({ name: "PEPE_USDT", in_delisting: false }, { category: "meme_coins", index: 2 }),
    {
      symbol: "PEPE_USDT",
      displayName: "PEPE / USDT",
      market: "Meme coin perpetual",
      category: "meme_coins",
      order: 2,
      isOpen: true,
      provider: "gate_futures"
    }
  );
});

test("normalizes Gate futures candles chronologically", () => {
  assert.deepEqual(normalizeFuturesCandles([
    { t: 200, o: "2", h: "3", l: "1", c: "2.5" },
    { t: 100, o: "1", h: "2", l: "0.5", c: "1.5" }
  ]), [
    { epoch: 100, open: 1, high: 2, low: 0.5, close: 1.5 },
    { epoch: 200, open: 2, high: 3, low: 1, close: 2.5 }
  ]);
});
