// LocalStorage-backed recents voor het command-palette.
// Houdt max 8 entries vast in LRU-volgorde. Alleen page- en item-resultaten
// — acties hergebruiken het statische register en hebben dus geen recents-
// representatie nodig (als je "Open chat" gisteren gebruikte, staat die altijd
// nog op dezelfde plek in het action-register).

import type { CommandItem, RecentEntry } from './types'

const STORAGE_KEY = 'trifinity.cmdk.recents'
const MAX_RECENTS = 8

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readRecents(): RecentEntry[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
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

export function writeRecents(entries: RecentEntry[]): void {
  if (!isBrowser()) return
  try {
    const trimmed = entries.slice(0, MAX_RECENTS)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // ignore — quota or disabled storage
  }
}

/** Verplaats een item naar boven (of voeg toe) in de recents-lijst. Acties slaan we niet op. */
export function pushRecent(item: CommandItem): void {
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
  const existing = readRecents().filter((r) => r.id !== item.id)
  writeRecents([entry, ...existing])
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
