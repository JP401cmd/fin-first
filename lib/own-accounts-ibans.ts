/**
 * Client-zijde toegang tot de ontsleutelde IBANs van je eigen bankrekeningen.
 *
 * De tegenhanger van `GET /api/own-accounts/ibans`. Bestaat omdat de
 * encryptiesleutels server-only zijn: een `'use client'`-bestand kan
 * `decryptField` niet draaien, dus élke client-lezer van `bank_accounts.iban`
 * gaat vanaf nu via deze ene helper in plaats van via een eigen kolom-select.
 *
 * ## Twee varianten, en waarom dat verschil ertoe doet
 *
 * De IBAN heeft in deze app twee heel verschillende rollen, met heel
 * verschillende faalkosten:
 *
 *  - **Identifier** — herkennen dat een tegenpartij-IBAN een van je eigen
 *    rekeningen is (`buildOwnAccountIdentifiers` → `isOwnAccountTransfer`,
 *    en de paarkoppeling in `lib/transfer-matching.ts`). Ontbreekt hier één
 *    IBAN, dan telt een interne overboeking mee als échte inkomst én uitgave:
 *    de spaarquote is dan corrupt zonder dat er ergens een fout verschijnt.
 *    Gebruik {@link fetchOwnAccountIbansStrict} — die gooit bij élke
 *    onvolledigheid, zodat de aanroeper zichtbaar faalt in plaats van stil
 *    verkeerd te rekenen.
 *
 *  - **Weergave** — het IBAN-staartje naast een rekeningnaam. Hier is een
 *    ontbrekende IBAN een schoonheidsfoutje. Gebruik {@link fetchOwnAccountIbans}.
 *
 * Geen van beide varianten geeft ooit stilzwijgend een lege lijst terug bij een
 * netwerk- of serverfout: dat is precies de terugval die deze module bestaat om
 * te voorkomen.
 */

/** Eén rekening met ontsleutelde IBAN. Spiegelt de routerespons. */
export interface OwnAccountIban {
  id: string
  iban: string
  is_active: boolean
}

export interface OwnAccountIbansResult {
  accounts: OwnAccountIban[]
  /** Aantal rijen met een gevulde maar niet-ontsleutelbare `iban_encrypted`. */
  unreadable: number
}

/**
 * Haalt de eigen rekening-IBANs op. Gooit bij een netwerk-/serverfout — nooit
 * een lege lijst als "er zijn er geen".
 */
export async function fetchOwnAccountIbans(): Promise<OwnAccountIbansResult> {
  const res = await fetch('/api/own-accounts/ibans')
  if (!res.ok) {
    // De foutvorm is de gedeelde envelope (`{ error: string }`, ADR 0044). Een
    // onleesbare body mag deze helper niet in een tweede faalpad duwen.
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body && typeof body.error === 'string') detail = body.error
    } catch {
      // body niet leesbaar — de statuscode is genoeg context
    }
    throw new Error(`Eigen rekening-IBANs ophalen mislukt: ${detail}`)
  }
  const body = (await res.json()) as OwnAccountIbansResult
  return { accounts: body.accounts ?? [], unreadable: body.unreadable ?? 0 }
}

/**
 * Zelfde ophaal, maar weigert een ONVOLLEDIGE set. Voor elk pad dat de IBAN als
 * match-identifier gebruikt.
 *
 * Waarom `unreadable > 0` hier hard faalt en niet "de leesbare rijen zijn beter
 * dan niets": een niet-gekoppelde overboeking is herstelbaar (de rijen blijven
 * staan, een volgende ronde koppelt ze alsnog), maar een overboeking die als
 * inkomst/uitgave is weggeschreven vervuilt de spaarquote en valt niemand op.
 * Bij twijfel dus liever niets doen dan half doen.
 */
export async function fetchOwnAccountIbansStrict(): Promise<OwnAccountIban[]> {
  const { accounts, unreadable } = await fetchOwnAccountIbans()
  if (unreadable > 0) {
    throw new Error(
      `${unreadable} bankrekening-IBAN(s) niet te ontsleutelen — eigen-rekeningherkenning ` +
      `overgeslagen om te voorkomen dat interne overboekingen als inkomsten/uitgaven tellen`,
    )
  }
  return accounts
}

/** Map van rekening-id naar ontsleutelde IBAN. */
export function ibanById(accounts: OwnAccountIban[]): Map<string, string> {
  return new Map(accounts.map((a) => [a.id, a.iban]))
}
