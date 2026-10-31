import test from "node:test";
import assert from "node:assert/strict";
import { aggregateCompleteCandles, mapGateInstrument, normalizeGateCandles } from "../src/gateCfdClient.js";
import { applyGateMt5BoundaryOffsets, timeframeByKey } from "../src/timeframes.js";

test("maps Gate CFD forex and headline index symbols", () => {
  assert.equal(mapGateInstrument({ symbol: "EURUSD", symbol_desc: "EUR/USD", category_id: 4, status: "open" }).category, "currency_pairs");
  assert.equal(mapGateInstrument({ symbol: "NAS100", symbol_desc: "Nasdaq 100", category_id: 3, status: "open" }).category, "nas_us100");
  assert.equal(mapGateInstrument({ symbol: "US30", symbol_desc: "Dow Jones 30", category_id: 3, status: "closed" }).category, "us30_dow");
});

test("normalizes Gate CFD OHLC candles", () => {
  assert.deepEqual(normalizeGateCandles([{ t: 900, o: "10", h: "12", l: "9", c: "11" }]), [
    { epoch: 900, open: 10, high: 12, low: 9, close: 11 }
  ]);
});

test("aggregates only complete MT5-aligned candle groups", () => {
  const candles = Array.from({ length: 5 }, (_, index) => ({
    epoch: index * 900,
    open: 10 + index,
    high: 12 + index,
    low: 9 + index,
    close: 11 + index
  }));
  const result = aggregateCompleteCandles(candles, 1800, 900, 0);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { epoch: 0, open: 10, high: 13, low: 9, close: 12 });
});

test("applies Gate MT5 candle boundaries to scheduler timeframes", () => {
  applyGateMt5BoundaryOffsets({ sessionAnchorEpoch: 75600, weeklyAnchorEpoch: 334800 });
  assert.equal(timeframeByKey("H4").boundaryOffsetSeconds, 3600);
  assert.equal(timeframeByKey("D1").boundaryOffsetSeconds, 75600);
  assert.equal(timeframeByKey("W1").boundaryOffsetSeconds, 334800);
});
