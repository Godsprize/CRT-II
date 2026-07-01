export const TIMEFRAMES = [
  { key: "15m", label: "15m", seconds: 15 * 60 },
  { key: "30m", label: "30m", seconds: 30 * 60 },
  { key: "1h", label: "1h", seconds: 60 * 60 },
  { key: "4h", label: "4h", seconds: 4 * 60 * 60 },
  { key: "1D", label: "1D", seconds: 24 * 60 * 60 }
];

export function timeframeByKey(key) {
  return TIMEFRAMES.find((timeframe) => timeframe.key === key);
}

export function timeframeLabelFromSeconds(seconds) {
  return TIMEFRAMES.find((timeframe) => timeframe.seconds === seconds)?.label || `${seconds}s`;
}

export function higherTimeframeFor(timeframe) {
  const map = {
    "15m": "1h",
    "30m": "4h",
    "1h": "4h",
    "4h": "1D"
  };
  return timeframeByKey(map[timeframe.key]);
}
