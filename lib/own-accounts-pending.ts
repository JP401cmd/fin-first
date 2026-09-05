// lib/own-accounts-pending.ts
//
// "Deze transactie ziet eruit als een overboeking naar je eigen rekening, maar
// staat nog als uitgave geboekt." Eén predicaat, gedeeld door de banner en de
// per-rij-markering op /core/cash — die stonden als twee losse condities in
// `cash-account-view.tsx` en konden dus uit elkaar lopen.
//
// ── Waarom dit predicaat is verruimd (UR3-02) ────────────────────────────────
// Tot deze wijziging sloten beide condities transacties met een reeds gezet
// `budget_id` UIT. Gevolg: ging de herkenning bij import of sync éénmaal mis,
// dan verdween de transactie PERMANENT uit het vizier van de enige
// laagdrempelige correctieroute in de app. Wat overbleef was de verborgen
// Instellingen-route (`lib/own-accounts-reclassify.ts`), die een beginner niet
// zoekt omdat hij niet weet dat er iets te zoeken valt. Precies dat maakte de
// gemelde bug onoplosbaar in plaats van hinderlijk.
//
// De guard die daarvoor in de plaats komt is smaller en preciezer:
// `category_source === 'manual'`. Dat is de waarde die een KEUZE VAN DE
// GEBRUIKER markeert — direct gezet door `TransferConfirmSheet` (de knop
// waarmee je de suggestie wegwuift), én doorgegeven wanneer een
// `category_corrections`-regel matcht (`lib/parsers/categorize.ts`, prioriteit
// 1). Dat tweede pad is bewust meegenomen en heeft een staart: wuif je de
// suggestie voor één tegenpartij weg, dan maakt de sheet daar een correctie-
// regel van, en blijven ook TOEKOMSTIGE boekingen van diezelfde tegenpartij
// buiten de banner. Dat is dezelfde belofte als elders in de app ("ik heb dit
// al beantwoord"), geen omissie.
//
// Automatisch toegekende bronnen ('rule', 'ai', 'import', 'propagated') zijn
// géén antwoord van de gebruiker en blijven herstelbaar — dat is precies het
// geval uit de melding.

import { isOwnAccountTransfer } from '@/lib/parsers/categorize'
import type { OwnAccountIdentifiers } from '@/lib/own-accounts'

/**
 * Hoeveel kandidaten er hoogstens in één controle-ronde gaan.
 *
 * De banner draait op de transacties van de getoonde MAAND, dus de bovengrens
 * is al begrensd; deze cap is de tweede rem voor een maand met veel historie
 * (bv. direct na een eerste sync van meerdere jaren). De banner blijft het
 * volledige aantal noemen — de cap begrenst alleen de doorloop, niet de
 * boodschap, anders zou de gebruiker denken dat de rest al goed staat.
 */
export const PENDING_TRANSFER_REVIEW_CAP = 25

/** De velden die het predicaat leest — bewust minimaal, zodat elke lezer past. */
export type PendingTransferCandidate = {
  budget_id: string | null
  category_source?: string | null
  counterparty_iban: string | null
  counterparty_name: string | null
  transaction_type: string | null
  /** Eigenaar van de rij; in huishoudweergave staan hier ook partnerrijen tussen. */
  user_id?: string | null
}

/**
 * Is dit een eigen-rekening-overboeking die nog als gewone transactie geboekt
 * staat, en waar de gebruiker zich nog niet over heeft uitgesproken?
 *
 * @param ownerUserId wie er kijkt. Alleen eigen rijen zijn kandidaat: de
 *   UPDATE-policy op `transactions` is eigen-rij ("Users update own
 *   transactions"), dus een partnerrij aanbieden ter bevestiging levert een
 *   knop die per definitie nul rijen raakt — én toont een boeking van de
 *   partner in een lijst die daar niet voor bedoeld is. Weglaten = geen
 *   eigenaarsfilter (voor aanroepers die al op één gebruiker gescoped zijn).
 */
export function isPendingOwnAccountTransfer(
  tx: PendingTransferCandidate,
  ids: OwnAccountIdentifiers,
  ownerUserId?: string | null,
): boolean {
  // Al als verschuiving geboekt: niets te herstellen.
  if (tx.transaction_type === 'transfer' || tx.transaction_type === 'joint_transfer') return false
  // Niet van deze kijker: niet herstelbaar en niet van hem om te zien.
  if (ownerUserId && tx.user_id && tx.user_id !== ownerUserId) return false
  // De gebruiker heeft hier zelf een budget bij gekozen — dat is een antwoord,
  // geen openstaande vraag.
  if (tx.category_source === 'manual') return false
  // Zonder tegenpartij is er niets om op te matchen.
  if (!tx.counterparty_iban && !tx.counterparty_name) return false
  return isOwnAccountTransfer(tx.counterparty_iban, ids.ibans, tx.counterparty_name, ids.namePatterns)
}

/**
 * Verzamel de kandidaten voor de herstelbanner.
 *
 * @returns `items` — de (gecapte) lijst die de controle-sheet doorloopt;
 *          `total` — het werkelijke aantal, voor de tekst in de banner.
 */
export function collectPendingOwnAccountTransfers<T extends PendingTransferCandidate>(
  transactions: T[],
  ids: OwnAccountIdentifiers,
  ownerUserId?: string | null,
  cap: number = PENDING_TRANSFER_REVIEW_CAP,
): { items: T[]; total: number } {
  const matches = transactions.filter((t) => isPendingOwnAccountTransfer(t, ids, ownerUserId))
  return { items: matches.slice(0, cap), total: matches.length }
}
