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
  collectDouble: 'Collect 2×',
  watchAd: 'Watch ad',
  notNow: 'Not now',
  adFailed: 'No ad right now. Try again later!',
  speedTitle: '2× wash speed',
  speedBody: 'Every wash goes twice as fast for 3 minutes.',
  convoyTitle: 'VIP convoy',
  convoyBody: 'Five golden VIP cars arrive, each paying 5× the best car.',
  refillTitle: 'Instant delivery',
  refillBody: 'Every station gets filled up with supplies right now.',
  finishTitle: 'Finish it now',
  finishBody: 'Pay what you have and the rest is on us: {pad} gets built now.',
  calendarTitle: 'Daily rewards',
  calendarBody: 'Come back every day for gems. Missing a day never resets it.',
  day: 'Day {n}',
  claim: 'Claim',
  claimed: 'Claimed',
  tomorrow: 'Come back tomorrow!',
  missionsTitle: 'Daily missions',
  missionsBody: 'New missions every day.',
  missionDone: 'Mission done! Claim it in 📋',
  carOfDay: 'Car of the Day: {name}! Pays 10×',
  boostActive: '2× speed!',
  m_wash: 'Wash {n} cars',
  m_handWash: 'Wash {n} cars by hand',
  m_earn: 'Earn {cash}',
  m_tips: 'Get {n} tips',
  m_upgrade: 'Buy {n} upgrades',
  m_vip: 'Serve {n} golden VIPs',
  m_monster: 'Wash {n} monster trucks',
  m_detail: 'Detail {n} cars',
  m_snack: 'Sell {n} snacks',
  m_fuel: 'Fill up {n} cars',
  m_combo: 'Serve {n} fuel + wash combos',
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

/** A string with {placeholders} filled in, e.g. t('day', { n: 3 }). */
export function t(key: StringKey, values: Record<string, string | number> = {}): string {
  const text: string = table[key] ?? EN[key];
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
