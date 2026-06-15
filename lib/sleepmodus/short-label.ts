/**
 * Verkort een (vaak lange) budgetnaam tot een leesbaar micro-label voor de
 * Sleepmodus-spaarvarkens, waar maar ~2 korte regels passen. Gecureerde korte
 * vormen voor de bekende template-namen; generieke fallback knipt nette namen
 * op de eerste scheiding (',', ' & ' of ' / ') zodra de naam te lang is — nooit
 * midden in een woord en zonder '…'. De volledige naam blijft elders (title /
 * aria-label) beschikbaar. Pure functie (geen React/DB) → testbaar.
 */

/** Bekende template-namen → gecureerde korte vorm (lowercase-key, trim-tolerant). */
const CURATED: Record<string, string> = {
  'gas, water, licht': 'Gas & licht',
  'telefoon, internet & tv': 'Telefoon & tv',
  'verzekeringen wonen & gezondheid': 'Verzekeringen',
  'gemeentelijke & overige vaste lasten': 'Gemeente & overig',
  'onderhoud huis & tuin': 'Onderhoud',
  'inventaris & apparaten': 'Inventaris',
  'abonnementen & contributies': 'Abonnementen',
}

/** Boven deze lengte proberen we een naam netjes in te korten. */
const MAX_LEN = 16

export function shortBudgetLabel(name: string): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return trimmed

  const curated = CURATED[trimmed.toLowerCase()]
  if (curated) return curated

  if (trimmed.length <= MAX_LEN) return trimmed

  // Knip op de eerste betekenisvolle scheiding en behoud het eerste deel —
  // zo verdwijnt "& overige …" netjes i.p.v. een afkapping midden in een woord.
  const head = trimmed.split(/\s*[,&/]\s*/)[0]?.trim() ?? trimmed
  if (head.length >= 3 && head.length < trimmed.length) return head

  return trimmed
}
