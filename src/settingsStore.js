import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export class SettingsStore {
  constructor({ path, instruments, timeframes }) {
    this.path = path;
    this.instruments = instruments;
    this.timeframes = timeframes;
    this.state = this.load();
  }

  load() {
    const base = this.defaultState();
    if (!existsSync(this.path)) {
      this.save(base);
      return base;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8"));
      return this.normalize(parsed);
    } catch {
      this.save(base);
      return base;
    }
  }

  defaultState() {
    return {
      instruments: Object.fromEntries(
        this.instruments.map((instrument) => [
          instrument,
          Object.fromEntries(this.timeframes.map((timeframe) => [timeframe.key, false]))
        ])
      )
    };
  }

  normalize(state) {
    const base = this.defaultState();
    for (const instrument of this.instruments) {
      for (const timeframe of this.timeframes) {
        base.instruments[instrument][timeframe.key] = Boolean(
          state?.instruments?.[instrument]?.[timeframe.key]
        );
      }
    }
    this.save(base);
    return base;
  }

  save(state = this.state) {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(state, null, 2)}\n`);
  }

  enabledPairsForTimeframe(timeframeKey) {
    return this.instruments
      .filter((instrument) => this.state.instruments[instrument]?.[timeframeKey])
      .map((instrument) => ({ instrument, timeframeKey }));
  }

  toggle(instrument, timeframeKey) {
    if (!this.state.instruments[instrument] || !(timeframeKey in this.state.instruments[instrument])) {
      return null;
    }

    this.state.instruments[instrument][timeframeKey] =
      !this.state.instruments[instrument][timeframeKey];
    this.save();
    return this.state.instruments[instrument][timeframeKey];
  }

  isEnabled(instrument, timeframeKey) {
    return Boolean(this.state.instruments[instrument]?.[timeframeKey]);
  }
}
