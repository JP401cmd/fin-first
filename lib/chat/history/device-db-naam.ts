/**
 * De naam van de IndexedDB-database waarin de apparaatrug van de
 * gespreksgeschiedenis woont (W-004).
 *
 * WAAROM EEN EIGEN MODULE. Twee bestanden moeten deze naam kennen:
 * `device-store.ts` (die opent 'm) en `lib/browser-account-storage.ts` (die
 * gooit 'm weg bij een identiteitswissel). Stond de literal los in beide, dan
 * zou hernoemen de purge stil laten stoppen met dekken — geen compile-fout,
 * geen rode test; exact de reden dat `NEWS_CACHE_KEY_PREFIX` óók canoniek staat.
 *
 * En waarom niet gewoon uit `device-store.ts` importeren? Omdat
 * `browser-account-storage.ts` via `AccountStorageGuard` in de app-shell zit:
 * die import zou de complete IndexedDB-rug de hoofdbundel in trekken, terwijl
 * die juist in het lui geladen chat-chunk hoort. Eén constante is gratis.
 */
export const CHAT_DEVICE_DB_NAAM = 'trifinity-chat'
