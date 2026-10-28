// UI text by language. English is required and is the fallback for every key.
const EN = {
  loading: 'Loading',
  welcomeBack: 'Welcome back!',
  staffEarned: 'Your staff earned this while you were away',
  collect: 'Collect',
  endTitle: "You've built every car wash!",
  endBody: 'More towns are coming soon. Your car wash keeps running in the meantime.',
  keepWashing: 'Keep washing',
  locked: 'Coming up',
} as const;

export type StringKey = keyof typeof EN;

const TABLES: Record<string, Partial<Record<StringKey, string>>> = {
  en: EN,
};

let table: Partial<Record<StringKey, string>> = EN;

/** Takes the tag from getLanguage(), e.g. "pt-BR"; falls back to the base language, then English. */
export function setLanguage(tag: string): void {
  const lower = tag.toLowerCase();
  table = TABLES[lower] ?? TABLES[lower.split('-')[0] ?? ''] ?? EN;
  document.documentElement.lang = table === EN ? 'en' : lower;
}

export function t(key: StringKey): string {
  return table[key] ?? EN[key];
}
