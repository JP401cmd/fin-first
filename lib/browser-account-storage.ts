// ── Account-gebonden browseropslag opruimen bij een identiteitswissel ────────
//
// localStorage hoort bij het TOESTEL, niet bij de sessie. `supabase.auth.signOut()`
// wist de sessie maar laat alles wat de app zelf wegschreef staan — en op een
// gedeelde browser (partners, een testaccount naast een echt account) leest het
// volgende account dat gewoon terug. Zo werd de nieuwseditie van het ene account
// bij het andere getoond.
//
// TWEE LAGEN. De primaire verdediging is de sleutel per user_id scopen: dat doen
// de krantcache (`components/berichten/nieuws-only-client.tsx`) en de
// command-palette-recents (`lib/command-palette/recents.ts`), de twee sleutels die
// daadwerkelijk gebruikersinhoud renderden. Deze module is de tweede laag voor
// opslag die niet gescoped is — concepten en sessies die simpelweg niet bij de
// volgende gebruiker horen te belanden.
//
// WAAROM BIJ INLOGGEN EN NIET (ALLEEN) BIJ UITLOGGEN. Opruimen-bij-uitloggen dekt
// per definitie het meest voorkomende geval niet: A gooit de browser dicht of laat
// zijn sessie verlopen, B logt in. Er wordt dan nooit een uitlogpad doorlopen. De
// app kende bovendien vier uitgangen (`/logout`, "uitloggen op alle apparaten",
// sessie-verloop, account verwijderen) en een purge die aan één ervan hing zag er
// compleet uit. `purgeOnIdentityChange` hangt daarom aan de binnenkomst, waar er
// maar één van is, en vergelijkt met de laatst bekende gebruiker.
//
// WAT HIER NIET IN HOORT: weergavevoorkeuren per apparaat (ingeklapte secties,
// view-modes, gekozen palet, chatpaneel vastgezet). Die zijn bewust toestelgebonden
// en bevatten geen gegevens van de gebruiker.

/**
 * Prefix van de krantcache. Hier canoniek, want deze module moet 'm kunnen
 * opruimen: stond de literal los in beide bestanden, dan zou hernoemen de purge
 * stil laten stoppen met dekken — geen compile-fout, geen rode test.
 */
export const NEWS_CACHE_KEY_PREFIX = 'trifinity_news_cache'

/** Prefix van de command-palette-recents; zelfde reden als hierboven. */
export const CMDK_RECENTS_KEY_PREFIX = 'trifinity.cmdk.recents'

/** Onder welke sleutel we onthouden wie hier het laatst ingelogd was. */
const LAST_USER_KEY = 'trifinity_last_user'

/** Sleutels met gegevens of concepten van één specifiek account. */
const ACCOUNT_DATA_KEYS = [
  'fintwo_import_session', // hervat-marker: bankrekening-id, bestandsnaam, rij-hashes
  'trifinity_onboarding_draft', // legacy onboarding-concept (staat sinds aug 2026 server-side)
  'trifinity_onboarding_welcome_seen', // hoort bij de persoon, niet bij het toestel
  'vrijheidscheck_draft', // ingevulde vrijheidscheck
  'trifinity-chat-wft-accepted', // instemming met de Wft-disclaimer — per persoon
  'trifinity_perspective', // gekozen huishoud-perspectief
  'trifinity_coach_dismissed_suggestions',
  'trifinity_coach_bubble_dismissed',
] as const

/** Sleutelfamilies waarvan élke variant accountgegevens draagt. */
const ACCOUNT_DATA_PREFIXES = [
  NEWS_CACHE_KEY_PREFIX, // de krant — zowel de gescopede als de oude sleutel
  CMDK_RECENTS_KEY_PREFIX, // namen van bezittingen, schulden en doelen
  'budget-edit-draft-',
  'budget-new-draft',
  'tf-celebrated:', // gevierde financiële mijlpalen
] as const

/**
 * Verwijder alle account-gebonden browseropslag. Faal-zacht: in- en uitloggen mag
 * nooit stranden omdat localStorage geblokkeerd of vol is.
 */
export function purgeAccountScopedStorage(): void {
  try {
    for (const key of ACCOUNT_DATA_KEYS) localStorage.removeItem(key)

    // Prefix-families los langs, want die sleutels dragen een id of user_id.
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && ACCOUNT_DATA_PREFIXES.some((p) => key.startsWith(p))) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)

    // De navigatiestapel draagt paginatitels van bezochte detailpagina's en
    // overleeft een uitlog→inlog in hetzelfde tabblad.
    sessionStorage.removeItem('fintwo:nav-stacks')

    // De perspectief-cookie hoort bij het localStorage-equivalent hierboven en
    // is zwaarder: hij is een jaar geldig en stuurt het server-side dataladen
    // (getServerPerspective → loadLeverScores). RLS voorkomt een lek, maar zonder
    // dit draait de volgende gebruiker vanaf de eerste render in een
    // huishoud-perspectief dat hij nooit gekozen heeft.
    document.cookie = 'tf_perspective=; path=/; max-age=0; samesite=lax'
  } catch {
    // Opslag niet beschikbaar — in-/uitloggen gaat gewoon door.
  }
}

/**
 * Ruim op zodra er een ánder account op dit toestel verschijnt dan de vorige keer.
 * Draait bij elke app-render; doet niets zolang dezelfde gebruiker terugkomt.
 */
export function purgeOnIdentityChange(userId: string): void {
  try {
    const previous = localStorage.getItem(LAST_USER_KEY)
    if (previous === userId) return
    // Alleen opruimen bij een échte wissel. Bij de allereerste keer (previous ===
    // null) valt er niets van een ander op te ruimen, maar purgen is dan gratis en
    // dekt het geval dat de marker ooit handmatig gewist is.
    purgeAccountScopedStorage()
    localStorage.setItem(LAST_USER_KEY, userId)
  } catch {
    // Opslag niet beschikbaar — de app moet gewoon door.
  }
}
