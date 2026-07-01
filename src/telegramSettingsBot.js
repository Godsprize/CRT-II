export class TelegramSettingsBot {
  constructor({ notifier, settingsStore, instruments, timeframes, allowedChatId, pageSize = 10 }) {
    this.notifier = notifier;
    this.settingsStore = settingsStore;
    this.instruments = instruments;
    this.timeframes = timeframes;
    this.allowedChatId = allowedChatId ? String(allowedChatId) : "";
    this.pageSize = pageSize;
    this.categories = buildCategories(instruments);
    this.offset = undefined;
    this.stopped = false;
  }

  start() {
    if (!this.notifier.isConfigured()) {
      console.log("[telegram] Not configured. Settings interface is disabled.");
      return;
    }

    this.bootstrap();
  }

  async bootstrap() {
    try {
      await this.notifier.deleteWebhook();
      console.log("[telegram] Webhook cleared; polling for updates.");
    } catch (error) {
      console.error(`[telegram] Could not clear webhook: ${error.message}`);
    }

    this.loop();
  }

  stop() {
    this.stopped = true;
  }

  async loop() {
    while (!this.stopped) {
      try {
        const updates = await this.notifier.getUpdates({ offset: this.offset });
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch (error) {
        console.error(`[telegram] ${error.message}`);
        await sleep(5000);
      }
    }
  }

  async handleUpdate(update) {
    if (update.message) {
      await this.handleMessage(update.message);
    }

    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
    }
  }

  async handleMessage(message) {
    if (!this.isAllowedChat(message.chat.id)) return;
    const text = message.text || "";
    if (text.startsWith("/start") || text.startsWith("/settings")) {
      await this.notifier.sendMessageWithKeyboard(this.mainText(), this.mainKeyboard());
    }
  }

  async handleCallback(callback) {
    const chatId = callback.message?.chat?.id;
    if (!this.isAllowedChat(chatId)) return;

    const data = callback.data || "";
    if (data === "home") {
      await this.updateCallbackMessage(callback, this.mainText(), this.mainKeyboard());
      return;
    }

    if (data.startsWith("category:")) {
      const [, categoryKey, pageText = "0"] = data.split(":");
      const page = Number(pageText);
      await this.updateCallbackMessage(
        callback,
        this.categoryText(categoryKey, page),
        this.categoryKeyboard(categoryKey, page)
      );
      return;
    }

    if (data.startsWith("instrument:")) {
      const [, categoryKey, indexText] = data.split(":");
      const index = Number(indexText);
      const instrument = this.instrumentAt(index);
      if (!instrument) {
        await this.notifier.answerCallbackQuery(callback.id, "Instrument is no longer available");
        return;
      }
      await this.updateCallbackMessage(
        callback,
        this.instrumentText(instrument),
        this.instrumentKeyboard(instrument, index, categoryKey)
      );
      return;
    }

    if (data.startsWith("toggle:")) {
      const [, categoryKey, indexText, timeframeKey] = data.split(":");
      const index = Number(indexText);
      const instrument = this.instrumentAt(index);
      if (!instrument) {
        await this.notifier.answerCallbackQuery(callback.id, "Instrument is no longer available");
        return;
      }
      const enabled = this.settingsStore.toggle(instrument.symbol, timeframeKey);
      await this.updateCallbackMessage(
        callback,
        this.instrumentText(instrument),
        this.instrumentKeyboard(instrument, index, categoryKey),
        enabled === null ? "Unknown setting" : `${timeframeKey} ${enabled ? "on" : "off"}`
      );
    }
  }

  async updateCallbackMessage(callback, text, replyMarkup, callbackText = "") {
    await this.notifier.answerCallbackQuery(callback.id, callbackText);
    await this.notifier.editMessageWithKeyboard({
      chatId: callback.message.chat.id,
      messageId: callback.message.message_id,
      text,
      replyMarkup
    });
  }

  mainText() {
    return [
      "<b>CRT detector settings</b>",
      "Everything is off by default. Choose a market group."
    ].join("\n");
  }

  mainKeyboard() {
    return {
      inline_keyboard: this.categories
        .filter((category) => category.instruments.length > 0)
        .map((category) => [
          {
            text: `${category.label}: ${this.categoryStatus(category)}`,
            callback_data: `category:${category.key}:0`
          }
        ])
    };
  }

  categoryText(categoryKey, page = 0) {
    const category = this.categoryByKey(categoryKey);
    if (!category) return this.mainText();

    const totalPages = this.totalPages(category);
    const safePage = clamp(page, 0, totalPages - 1);
    return [
      `<b>${escapeHtml(category.label)}</b>`,
      "Select an instrument, then choose timeframes.",
      `Page ${safePage + 1} of ${totalPages}`
    ].join("\n");
  }

  categoryKeyboard(categoryKey, page = 0) {
    const category = this.categoryByKey(categoryKey);
    if (!category) return this.mainKeyboard();

    const safePage = clamp(page, 0, this.totalPages(category) - 1);
    const start = safePage * this.pageSize;
    const visible = category.instruments.slice(start, start + this.pageSize);
    const rows = visible.map((instrument) => [
      {
        text: `${this.instrumentStatus(instrument.symbol)} ${instrument.displayName}`,
        callback_data: `instrument:${category.key}:${this.instruments.indexOf(instrument)}`
      }
    ]);
    const nav = [];
    if (safePage > 0) nav.push({ text: "Prev", callback_data: `category:${category.key}:${safePage - 1}` });
    if (safePage < this.totalPages(category) - 1) {
      nav.push({ text: "Next", callback_data: `category:${category.key}:${safePage + 1}` });
    }
    if (nav.length > 0) rows.push(nav);
    rows.push([{ text: "Back", callback_data: "home" }]);

    return {
      inline_keyboard: rows
    };
  }

  instrumentText(instrument) {
    return [
      `<b>${escapeHtml(instrument.displayName)}</b>`,
      `Symbol: <code>${escapeHtml(instrument.symbol)}</code>`,
      `Market: ${escapeHtml(instrument.market)}`,
      `Exchange: ${instrument.isOpen ? "open" : "closed"}`,
      "Toggle the CRT scan timeframes for this instrument."
    ].join("\n");
  }

  instrumentKeyboard(instrument, index, categoryKey) {
    const category = this.categoryByKey(categoryKey) || this.categoryByKey(instrument.category);
    const indexInCategory = category?.instruments.findIndex((item) => item.symbol === instrument.symbol) ?? 0;
    const page = Math.floor(Math.max(0, indexInCategory) / this.pageSize);
    const backCategoryKey = category?.key || instrument.category || "other";
    return {
      inline_keyboard: [
        ...this.timeframes.map((timeframe) => [
          {
            text: `${this.settingsStore.isEnabled(instrument.symbol, timeframe.key) ? "ON" : "OFF"} ${timeframe.label}`,
            callback_data: `toggle:${backCategoryKey}:${index}:${timeframe.key}`
          }
        ]),
        [{ text: "Back", callback_data: `category:${backCategoryKey}:${page}` }]
      ]
    };
  }

  instrumentStatus(symbol) {
    const enabledCount = this.timeframes.filter((timeframe) =>
      this.settingsStore.isEnabled(symbol, timeframe.key)
    ).length;
    return enabledCount === 0 ? "OFF" : `${enabledCount} ON`;
  }

  instrumentAt(index) {
    return Number.isInteger(index) ? this.instruments[index] : null;
  }

  totalPages(category) {
    return Math.max(1, Math.ceil(category.instruments.length / this.pageSize));
  }

  categoryByKey(categoryKey) {
    return this.categories.find((category) => category.key === categoryKey);
  }

  categoryStatus(category) {
    const enabledCount = category.instruments.reduce(
      (sum, instrument) =>
        sum +
        this.timeframes.filter((timeframe) =>
          this.settingsStore.isEnabled(instrument.symbol, timeframe.key)
        ).length,
      0
    );
    return enabledCount === 0 ? "OFF" : `${enabledCount} ON`;
  }

  isAllowedChat(chatId) {
    return !this.allowedChatId || String(chatId) === this.allowedChatId;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function buildCategories(instruments) {
  const definitions = [
    { key: "currency_pairs", label: "CURRENCY PAIRS" },
    { key: "deriv_indices", label: "DERIV INDICES" },
    { key: "crypto", label: "CRYPTO" },
    { key: "indices", label: "INDICES" },
    { key: "commodities", label: "COMMODITIES" },
    { key: "other", label: "OTHER" }
  ];

  return definitions.map((definition) => ({
    ...definition,
    instruments: instruments.filter((instrument) => instrument.category === definition.key)
  }));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
