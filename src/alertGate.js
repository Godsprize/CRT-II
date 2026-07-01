export class AlertGate {
  constructor({ cooldownSeconds }) {
    this.cooldownMs = cooldownSeconds * 1000;
    this.sent = new Map();
  }

  shouldSend(signal, now = Date.now()) {
    if (!signal) return false;
    const lastSentAt = this.sent.get(signal.id) || 0;
    return now - lastSentAt >= this.cooldownMs;
  }

  markSent(signal, now = Date.now()) {
    this.sent.set(signal.id, now);
  }
}

export function formatSignalMessage({ signal, symbol, displayName = symbol, granularitySeconds }) {
  const latest = signal.candles.at(-1);
  const thirdOpenTime = new Date((latest.epoch + granularitySeconds) * 1000).toISOString();
  const priority = signal.htf?.alignment === "aligned";

  return [
    priority ? "🚨 <b>A+ SETUP - CRT detected</b>" : "<b>CRT detected</b>",
    `<b>${escapeHtml(displayName)}</b> | ${formatTimeframe(granularitySeconds)} | ${escapeHtml(signal.direction)}`,
    ...formatHtf(signal.htf),
    `Second candle close: ${latest.close}`,
    `Candle 3 open: ${thirdOpenTime}`
  ].join("\n");
}

function formatHtf(htf) {
  if (!htf) return [];
  if (htf.alignment === "unavailable") {
    return ["HTF: unavailable"];
  }

  const scoreText = htf.score > 0 ? `+${htf.score}` : String(htf.score);
  return [
    `HTF: ${htf.timeframe.label} ${htf.bias} | ${htf.alignment} (${scoreText})`
  ];
}

function formatTimeframe(seconds) {
  if (seconds === 900) return "15m";
  if (seconds === 1800) return "30m";
  if (seconds === 3600) return "1h";
  if (seconds === 14400) return "4h";
  if (seconds === 86400) return "1D";
  return `${seconds}s`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
