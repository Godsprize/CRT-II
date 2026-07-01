import test from "node:test";
import assert from "node:assert/strict";
import { mapActiveSymbolForMenu } from "../src/derivClient.js";

test("adds familiar aliases for major stock indices", () => {
  assert.equal(
    mapActiveSymbolForMenu({
      symbol: "OTC_NDX",
      display_name: "US Tech 100",
      market_display_name: "Stock Indices",
      exchange_is_open: 0
    }).displayName,
    "US Tech 100 / NAS100"
  );

  assert.equal(
    mapActiveSymbolForMenu({
      symbol: "OTC_DJI",
      display_name: "Wall Street 30",
      market_display_name: "Stock Indices",
      exchange_is_open: 0
    }).displayName,
    "Wall Street 30 / US30"
  );
});

test("cleans derived index display names", () => {
  assert.equal(
    mapActiveSymbolForMenu({
      symbol: "R_100",
      display_name: "Volatility 100 Index",
      market_display_name: "Derived",
      exchange_is_open: 1
    }).displayName,
    "Volatility 100"
  );
});

test("categorizes commodities separately", () => {
  assert.equal(
    mapActiveSymbolForMenu({
      symbol: "frxXAUUSD",
      display_name: "Gold/USD",
      market_display_name: "Commodities",
      exchange_is_open: 1
    }).category,
    "commodities"
  );
});
