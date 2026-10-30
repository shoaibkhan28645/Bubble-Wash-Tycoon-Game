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
  buildTitle: 'Building: {name}',
  buildBody: '{time} to go. Watch an ad to halve the wait, or finish it now with gems.',
  buildBodyHalved: '{time} to go. Finish it now with gems.',
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
  m_fuel: 'Fill up {n} cars',
  m_combo: 'Serve {n} combos',
  m_snack: 'Sell {n} snacks at the Mini-Mart',
  guideWash: 'Stand by the car to wash it',
  guideCash: 'Pick up your cash',
  guideShelf: 'Grab soap from the shelf',
  guideSoapBay: 'Bring the soap to the bay',
  guideFuel: 'Fill up this car',
  guideUpgrade: 'Upgrade your wash bay',
  guideBuild: 'Stand here to build it',
  firstCombo: 'Combo! Fuel and a wash pay more',
  hired: '{name} hired: {adds}',
  contractsTitle: 'Contracts board',
  contractsBody: 'Big jobs from local fleets. Finish them before the time runs out!',
  contractsSign: 'Contracts',
  contractDone: 'Contract done! Claim it at the contracts board',
  contractNew: 'New contract in {time}',
  contractLeft: '{time} left',
  contractNone: 'More contracts come as your car wash grows.',
  goalsTitle: 'Town goals',
  goalsBody: 'Reach every goal to open the road to the next town. Each one earns a franchise star.',
  goalsBar: 'Goals {done}/{total}',
  goalsClaim: 'Claim!',
  goalsAll: 'All goals reached!',
  goalDone: 'Town goal reached! Claim it in 🏁',
  goalsOpen: 'Every town goal reached! The road to Beach Boardwalk is open',
  franchiseStars: 'Franchise stars: {n}',
  goal_fuel: 'Open the fuel station',
  goal_mart: 'Open the Mini-Mart',
  goal_contracts: 'Finish {n} contracts',
  goal_stars: 'Reach a {n}-star rating',
  goal_combos: 'Serve {n} combos',
  goal_tunnel: 'Open the brush tunnel',
  goal_garage: 'Open the detailing garage',
  goal_landmark: 'Build the Duck Fountain',
  task_wash: 'Wash {n} cars',
  'task_wash:hatchback': 'Wash {n} hatchbacks',
  'task_wash:sedan': 'Wash {n} sedans',
  'task_wash:pickup': 'Wash {n} pickups',
  'task_wash:suv': 'Wash {n} SUVs',
  'task_wash:minivan': 'Wash {n} minivans',
  'task_wash:sports': 'Wash {n} sports cars',
  'task_wash:monster': 'Wash {n} monster trucks',
  task_fuel: 'Fill up {n} cars',
  task_snack: 'Sell {n} snacks',
  task_combo: 'Serve {n} combos',
  task_wax: 'Wax {n} cars',
  task_detail: 'Detail {n} cars',
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
