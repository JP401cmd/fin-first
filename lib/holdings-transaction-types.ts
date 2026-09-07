// lib/holdings-transaction-types.ts
// ---------------------------------------------------------------------------
// De types die een regel in `investment_transactions` / `crypto_transactions`
// kan dragen — en de twee dingen die élke consument van zo'n regel nodig heeft:
// hoe hij heet op het scherm, en waar hij staat binnen één datum.
//
// WAAROM DIT BESTAAT
// Toen `transfer_in`/`transfer_out` erbij kwamen (splitsingen en conversies uit
// de DEGIRO-transactie-export) bleken zes consumenten stil in de verkeerde tak
// te vallen: `typeConfig[tx.type] || typeConfig.buy` toonde beide benen van een
// splitsing als "Koop" — groen, met plusteken — en drie replay-lussen die
// alleen `buy`/`sell` kenden bevroren het aantal op de splitsdatum. Geen van die
// zes gaf een compile-fout: een lookup met `|| default` en een if-keten over
// stringliteralen zijn per definitie compile-blind.
//
// De afspraak is daarom: wie op het TYPE van een transactieregel beslist,
// gebruikt een `Record<HoldingTxType, …>`. Dat is exhaustief, dus een volgende
// type-uitbreiding wordt een compile-fout op elke plek die 'm nog niet kent —
// hetzelfde mechanisme waarmee `FUNCTION_SERVICE_MAP` de ArchiMate-plaat eerlijk
// houdt. Een terugval naar `buy` is nooit goed: een onbekend type als "Koop"
// tonen is de foutvorm zelf.
// ---------------------------------------------------------------------------

/**
 * Alle types die de app kent. De DB-kolom is vrije tekst (en oude/externe rijen
 * dragen ook `reward`, `deposit`, `fee`), dus dit is de bekende verzameling —
 * niet een garantie dat er niets anders binnenkomt. Vandaar `isHoldingTxType`.
 */
export const HOLDING_TX_TYPES = [
  'buy',
  'sell',
  'dividend',
  'split',
  'transfer_in',
  'transfer_out',
] as const

export type HoldingTxType = (typeof HOLDING_TX_TYPES)[number]

const KNOWN: ReadonlySet<string> = new Set(HOLDING_TX_TYPES)

/** Is dit een type dat wij kennen? Vernauwt het string-type voor de maps. */
export function isHoldingTxType(value: unknown): value is HoldingTxType {
  return typeof value === 'string' && KNOWN.has(value)
}

/**
 * Het label op het scherm. Eén bron, zodat de importvoorbeschouwing, het
 * transactielogboek en de waardegrafiek dezelfde woorden gebruiken.
 *
 * `transfer_*` heet bewust NIET "Koop"/"Verkoop": er is niets gehandeld, en die
 * labels zouden een opbrengst en een nieuwe inleg suggereren die er niet zijn.
 */
export const TX_TYPE_LABEL: Record<HoldingTxType, string> = {
  buy: 'Koop',
  sell: 'Verkoop',
  dividend: 'Dividend',
  split: 'Split',
  transfer_in: 'Splitsing / conversie (in)',
  transfer_out: 'Splitsing / conversie (uit)',
}

/**
 * Het teken vóór het bedrag. Een corporate action is winst noch verlies en
 * krijgt daarom géén teken — een `+` of `−` zou hier precies de beweging
 * suggereren die niet heeft plaatsgevonden.
 */
export const TX_TYPE_SIGN: Record<HoldingTxType, '+' | '-' | ''> = {
  buy: '+',
  sell: '-',
  dividend: '+',
  split: '',
  transfer_in: '',
  transfer_out: '',
}

/** Wat we tonen voor een type dat wij niet kennen. Nooit "Koop". */
export const UNKNOWN_TX_LABEL = 'Onbekend type'

/**
 * Volgorde BINNEN één datum.
 *
 * De canonieke engine (`computePositionFromTransactions`) sorteert op datum en
 * die sort is stabiel, dus binnen één datum besliste tot nu toe de
 * invoervolgorde. Voor een forward split op dezelfde ISIN dragen beide benen
 * dezelfde datum, en er is in de database niets dat ze ordent:
 * `investment_transactions.id` is een random uuid en `created_at` is voor alle
 * rijen van één upsert identiek. De consumenten vragen bovendien drie
 * verschillende sorteringen (`date ASC, created_at ASC`, géén `order()`, en
 * `date DESC`), dus de uitkomst was nondeterministisch — en fout zodra het
 * in-been vóór het uit-been landde: de engine telde de stukken dan even dubbel
 * en middelde de kostprijs over te veel stuks (EUR 400 inleg in plaats van
 * EUR 300 bij een 2-voor-1 split).
 *
 * Daarom: wat de positie VERLAAT gaat vóór wat er binnenkomt. Al het andere
 * houdt rang 0 en blijft dus onderling in de volgorde waarin het binnenkwam —
 * we ordenen alleen wat we moeten ordenen.
 */
export const SAME_DAY_ORDER: Record<HoldingTxType, number> = {
  transfer_out: -1,
  buy: 0,
  sell: 0,
  dividend: 0,
  split: 0,
  transfer_in: 1,
}

/** De rang van een ruwe (mogelijk onbekende) type-waarde uit de database. */
export function sameDayOrder(type: unknown): number {
  const lower = typeof type === 'string' ? type.toLowerCase() : ''
  return isHoldingTxType(lower) ? SAME_DAY_ORDER[lower] : 0
}
