import test from "node:test";
import assert from "node:assert/strict";
import { hasFreshClosedCandle, msUntilNextBoundary } from "../src/scheduler.js";

test("schedules just after the next timeframe boundary", () => {
  const now = Date.UTC(2026, 0, 1, 10, 7, 30);
  const delay = msUntilNextBoundary(15 * 60, now);
  const nextCheck = now + delay;
  const expectedBoundary = Date.UTC(2026, 0, 1, 10, 15, 0);

  assert.equal(nextCheck, expectedBoundary + 1500);
});

test("schedules W1 just after the Monday UTC boundary", () => {
  const now = Date.UTC(2026, 0, 1, 10, 0, 0);
  const mondayOffsetSeconds = 4 * 24 * 60 * 60;
  const delay = msUntilNextBoundary(7 * 24 * 60 * 60, now, mondayOffsetSeconds);

  assert.equal(now + delay, Date.UTC(2026, 0, 5, 0, 0, 1, 500));
});

test("rejects stale Gate candles from a closed market", () => {
  const timeframeSeconds = 15 * 60;
  const nowEpoch = 100 * timeframeSeconds;

  assert.equal(
    hasFreshClosedCandle([{ epoch: 99 * timeframeSeconds }], timeframeSeconds, nowEpoch),
    true
  );
  assert.equal(
    hasFreshClosedCandle([{ epoch: 90 * timeframeSeconds }], timeframeSeconds, nowEpoch),
    false
  );
});
