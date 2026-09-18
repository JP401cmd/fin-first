/**
 * Leningdelen-groepering — één hypotheek, meerdere leningdelen.
 *
 * In Nederland is één hypotheek vrijwel altijd opgeknipt in leningdelen: losse
 * leningen onder één hypotheekschuld, elk met een eigen rente, aflossingsvorm
 * en rentevaste periode. Het datamodel (ADR 0140, migratie
 * `20260912150000_debts_hypotheek_leningdelen.sql`) legt dat vast met een
 * nullable `parent_debt_id` op `debts`: elk deel blijft een volwaardige rij,
 * de verwijzing groepeert ze.
 *
 * DE HARDE INVARIANT — de hoofdrij is ZELF een leningdeel.
 * De hoofdrij is geen leeg omhulsel met het groepstotaal erin; hij draagt
 * alleen zijn eigen saldo. Alle rekenmotoren (box1-renteaftrek, woonstrategie,
 * horizon-kernel) tellen álle mortgage-rijen op. Deze module telt daarom
 * uitsluitend voor de WEERGAVE op — de hoofdrij is gewoon één van de leden en
 * wordt nooit dubbel geteld. Een groepstotaal is exact de som over `leden`,
 * en `leden` bevat elke inputrij precies één keer.
 *
 * PRESENTATIE-ONLY: hier wordt geen bedrag herleid of herrekend. De host
 * levert de waardefunctie (`waardeVan`) en houdt daarmee zijn eigen
 * perspectief-weging (`shareOf` / `debtDisplayValue`) als enige bron — zelfde
 * afspraak als `eenvoudig-pill-items.ts`.
 *
 * EIGENAARSCHAP: de samengestelde FK `(parent_debt_id, user_id) →
 * (id, user_id)` maakt een verwijzing naar de schuld van iemand anders
 * onmogelijk. Deze module herhaalt die toets bewust in code (`user_id` moet
 * gelijk zijn) zodat een lijst die rijen van meerdere gebruikers bevat —
 * huishouden-perspectief met partnerschulden — nooit per ongeluk over
 * eigenaars heen groepeert.
 */

/** Minimale vorm die deze module van een schuld-rij nodig heeft. */
export interface LeningdeelRij {
  id: string
  user_id: string
  /** Hoofdrij van dezelfde hypotheek; NULL = zelfstandige schuld of hoofdrij. */
  parent_debt_id?: string | null
}

/**
 * Eén regel in de weergavelijst: óf een losse schuld, óf een hypotheek met
 * haar leningdelen.
 */
export type LeningdeelEntry<T> =
  | { kind: 'enkel'; debt: T }
  | {
      kind: 'groep'
      /** De hoofdrij — zelf óók een leningdeel, met alleen zijn eigen saldo. */
      hoofd: T
      /** De onderliggende delen, in invoervolgorde (zonder de hoofdrij). */
      delen: T[]
      /** Hoofdrij + delen, in invoervolgorde — dit is wat je rendert. */
      leden: T[]
      /** Som van `waardeVan` over `leden`. Nooit inclusief een groepstotaal. */
      totaal: number
    }

/**
 * Groepeert leningdelen onder hun hoofdrij, met behoud van de invoervolgorde.
 *
 * Een rij telt alleen als leningdeel wanneer élk van deze punten klopt:
 *  - `parent_debt_id` is gezet en wijst niet naar de rij zelf;
 *  - de hoofdrij zit in dezelfde lijst (een deel waarvan de hoofdrij is
 *    weggefilterd — ander type, inactief, saldo 0, partner-privacy — rendert
 *    als zelfstandige schuld, zodat er nooit een bedrag van het scherm valt);
 *  - de hoofdrij heeft dezelfde `user_id` (spiegelt de samengestelde FK);
 *  - de hoofdrij is zelf geen leningdeel (de database houdt de boom één niveau
 *    diep; deze controle is de defensieve dubbelganger daarvan).
 *
 * De groep verschijnt op de plek van de hoofdrij; de delen verdwijnen van hun
 * eigen plek en verschijnen ín de groep.
 */
export function groepeerLeningdelen<T extends LeningdeelRij>(
  debts: readonly T[],
  waardeVan: (debt: T) => number,
): LeningdeelEntry<T>[] {
  const byId = new Map<string, T>()
  for (const debt of debts) byId.set(debt.id, debt)

  const delenPerHoofd = new Map<string, T[]>()
  const isDeel = new Set<string>()

  for (const debt of debts) {
    const parentId = debt.parent_debt_id
    if (!parentId || parentId === debt.id) continue
    const hoofd = byId.get(parentId)
    if (!hoofd) continue
    if (hoofd.user_id !== debt.user_id) continue
    if (hoofd.parent_debt_id) continue
    const bestaand = delenPerHoofd.get(parentId)
    if (bestaand) bestaand.push(debt)
    else delenPerHoofd.set(parentId, [debt])
    isDeel.add(debt.id)
  }

  const entries: LeningdeelEntry<T>[] = []
  for (const debt of debts) {
    if (isDeel.has(debt.id)) continue
    const delen = delenPerHoofd.get(debt.id)
    if (!delen || delen.length === 0) {
      entries.push({ kind: 'enkel', debt })
      continue
    }
    const leden = [debt, ...delen]
    entries.push({
      kind: 'groep',
      hoofd: debt,
      delen,
      leden,
      totaal: leden.reduce((som, lid) => som + waardeVan(lid), 0),
    })
  }
  return entries
}

/** Alle rijen die een entry op het scherm zet, in renderselectie-volgorde. */
export function ledenVanEntry<T>(entry: LeningdeelEntry<T>): T[] {
  return entry.kind === 'groep' ? entry.leden : [entry.debt]
}

/**
 * Label voor het aantal leningdelen van een groep: "3 leningdelen".
 * De hoofdrij telt mee — hij is zelf een deel.
 */
export function leningdelenLabel(aantalLeden: number): string {
  return `${aantalLeden} ${aantalLeden === 1 ? 'leningdeel' : 'leningdelen'}`
}
