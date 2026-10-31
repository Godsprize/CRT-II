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
  const instrument = String(displayName).toUpperCase();
  const direction = `${signal.direction.charAt(0).toUpperCase()}${signal.direction.slice(1).toLowerCase()}`;
  return `${instrument} ${direction} signal ${formatTimeframe(granularitySeconds)}`;
}

function formatTimeframe(seconds) {
  if (seconds === 900) return "M15";
  if (seconds === 1800) return "M30";
  if (seconds === 3600) return "H1";
  if (seconds === 7200) return "H2";
  if (seconds === 10800) return "H3";
  if (seconds === 14400) return "H4";
  if (seconds === 21600) return "H6";
  if (seconds === 28800) return "H8";
  if (seconds === 43200) return "H12";
  if (seconds === 86400) return "D1";
  if (seconds === 604800) return "W1";
  return `${seconds}s`;
}
