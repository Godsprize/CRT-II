import test from "node:test";
import assert from "node:assert/strict";
import { formatSignalMessage } from "../src/alertGate.js";

test("formats a minimal one-line signal caption", () => {
  const message = formatSignalMessage({
    signal: {
      direction: "bullish",
      htf: {
        timeframe: { label: "1h" },
        bias: "bullish",
        alignment: "aligned",
        score: 15
      },
      candles: [{ epoch: 1000, close: 123.45 }]
    },
    symbol: "R_100",
    displayName: "Volatility 100",
    granularitySeconds: 900
  });

  assert.equal(message, "VOLATILITY 100 Bullish signal M15");
});

test("formats the weekly timeframe", () => {
  const message = formatSignalMessage({
    signal: { direction: "bearish", candles: [] },
    symbol: "XAUUSD",
    displayName: "Gold",
    granularitySeconds: 7 * 24 * 60 * 60
  });

  assert.equal(message, "GOLD Bearish signal W1");
});
