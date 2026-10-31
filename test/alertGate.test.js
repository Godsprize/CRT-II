import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AlertGate, formatSignalMessage } from "../src/alertGate.js";

test("suppresses the same signal for the full retention period", () => {
  const gate = new AlertGate({ historyRetentionDays: 90 });
  const signal = { id: "crt:XAUUSD:M15:1000:bullish:123" };
  const sentAt = Date.now();

  assert.equal(gate.shouldSend(signal, sentAt), true);
  gate.markSent(signal, sentAt);
  assert.equal(gate.shouldSend(signal, sentAt + 30 * 24 * 60 * 60 * 1000), false);
});

test("persists duplicate suppression across bot restarts", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gate-alert-history-"));
  const historyPath = join(directory, "alert-history.json");
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const signal = { id: "crt:XAUUSD:M15:1000:bullish:123" };
  const secondSignal = { id: "crt:XAUUSD:M15:1900:bearish:123" };
  const sentAt = Date.now();
  const firstProcess = new AlertGate({ historyPath, historyRetentionDays: 90 });
  firstProcess.markSent(signal, sentAt);
  firstProcess.markSent(secondSignal, sentAt + 60_000);

  const restartedProcess = new AlertGate({ historyPath, historyRetentionDays: 90 });
  assert.equal(restartedProcess.shouldSend(signal, sentAt + 60_000), false);
  assert.equal(restartedProcess.shouldSend(secondSignal, sentAt + 60_000), false);
  assert.equal(JSON.parse(readFileSync(historyPath, "utf8")).sentSignals[signal.id], sentAt);
});

test("allows a signal again after alert history retention expires", () => {
  const gate = new AlertGate({ historyRetentionDays: 90 });
  const signal = { id: "crt:XAUUSD:M15:1000:bullish:123" };
  const sentAt = Date.UTC(2026, 0, 1);

  gate.markSent(signal, sentAt);
  assert.equal(gate.shouldSend(signal, sentAt + 91 * 24 * 60 * 60 * 1000), true);
});

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
