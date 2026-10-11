import { TRANSLATIONS } from "../data/translations.js?v=v0.3.89";

export class I18n {
  constructor(language = "zh-CN") {
    this.language = TRANSLATIONS[language] ? language : "zh-CN";
  }

  setLanguage(language) {
    if (TRANSLATIONS[language]) this.language = language;
    document.documentElement.lang = this.language;
  }

  t(key, params = {}) {
    const table = TRANSLATIONS[this.language] ?? TRANSLATIONS["zh-CN"];
    const fallback = TRANSLATIONS["zh-CN"];
    let text = table[key] ?? fallback[key] ?? key;
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }
}
