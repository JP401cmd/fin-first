// LocalStorage-backed recents voor het command-palette.
// Houdt max 8 entries vast in LRU-volgorde. Alleen page- en item-resultaten
// — acties hergebruiken het statische register en hebben dus geen recents-
// representatie nodig (als je "Open chat" gisteren gebruikte, staat die altijd
// nog op dezelfde plek in het action-register).
//
// PER ACCOUNT GESCOPED. Wat hier landt is geen navigatiegeschiedenis maar
// gebruikersinhoud: `label` is de door de gebruiker zelf ingetypte naam van een
// bezitting, schuld, budget, doel of levensgebeurtenis (zie de search-route), en
// `sublabel` zet het type erbij ("Schuld · Hypotheek"). Stond dit onder één vaste
// sleutel, dan zag het volgende account op hetzelfde toestel die namen in zijn
// palette staan zonder ook maar iets te doen. Zelfde fout als de krantcache had;
// scopen (niet alleen opruimen bij uitloggen) is de enige variant die ook standhoudt
// wanneer een sessie verloopt zonder dat /logout ooit bezocht wordt.

import type { CommandItem, RecentEntry } from './types'
import { CMDK_RECENTS_KEY_PREFIX as STORAGE_KEY_PREFIX } from '@/lib/browser-account-storage'

/** Sleutel van vóór de scoping — bevroren literal, geen alias van de prefix. */
const LEGACY_STORAGE_KEY = 'trifinity.cmdk.recents'
const MAX_RECENTS = 8

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readRecents(userId: string): RecentEntry[] {
  if (!isBrowser()) return []
  try {
    // De accountloze sleutel is van onbekende herkomst: weggooien, niet migreren.
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)

    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is RecentEntry =>
      p !== null
      && typeof p === 'object'
      && typeof (p as RecentEntry).id === 'string'
      && typeof (p as RecentEntry).label === 'string'
      && typeof (p as RecentEntry).ts === 'number',
    )
  } catch {
    return []
  }
}

export function writeRecents(userId: string, entries: RecentEntry[]): void {
  if (!isBrowser()) return
  try {
    const trimmed = entries.slice(0, MAX_RECENTS)
    window.localStorage.setItem(storageKey(userId), JSON.stringify(trimmed))
  } catch {
    // ignore — quota or disabled storage
  }
}

/** Verplaats een item naar boven (of voeg toe) in de recents-lijst. Acties slaan we niet op. */
export function pushRecent(userId: string, item: CommandItem): void {
  if (item.kind === 'action') return
  if (!item.href) return
  const entry: RecentEntry = {
    id: item.id,
    kind: item.kind,
    label: item.label,
    sublabel: item.sublabel,
    ts: Date.now(),
    href: item.href,
    module: item.module,
  }
  const existing = readRecents(userId).filter((r) => r.id !== item.id)
  writeRecents(userId, [entry, ...existing])
}

export function recentsToCommandItems(entries: RecentEntry[]): CommandItem[] {
  return entries.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    sublabel: r.sublabel,
    module: r.module,
    href: r.href,
  }))
}
