// lib/amount-input.ts
//
// DE canonieke lees- en schrijfregels voor een bedragveld — één bron voor de
// `<AmountInput>`-component (`components/app/amount-input.tsx`), voor
// server-side hercontrole, en voor de tests die vastleggen wat een veld
// accepteert.
//
// ── Waarom deze module bestaat (bevinding H9) ────────────────────────────────
//
// Vóór deze module deed elk bedragveld z'n eigen ding. Vijftien-plus bestanden
// droegen letterlijk `onChange={(e) => setX(e.target.value.replace(/[^0-9.,]/g,
// ''))}`. Dat stript per TOETSAANSLAG alles wat geen cijfer/punt/komma is —
// dus ook letters én het minteken — zonder de gebruiker ooit te vertellen dat
// er iets geweigerd is. Getest gedrag vóór de fix (`onboarding-inkomen.tsx`):
//
//   invoer `abc`   → veld blijft leeg, geen melding, "Verder" werkt gewoon
//   invoer `-500`  → er staat `500`, geen melding
//
// Zo belandde er €500 aan maanduitgaven in een profiel waarvan de gebruiker
// dacht dat hij "min 500" had ingevuld — en elk afgeleid cijfer rekende daarna
// door op die basis.
//
// De regel die dat dichtzet is niet "strip minder", maar: **weiger zichtbaar**.
// `sanitizeAmountInput` gooit nog steeds niets ongeldigs het veld in, maar geeft
// er altijd bij terug WAT er geweigerd is en WAAROM, zodat de aanroeper dat kan
// tonen. Een aanroeper die `reason` negeert, herbouwt de bug — vandaar dat het
// een verplicht veld op het resultaat is en geen optionele callback.
//
// ── Waarom drie bestaande parse-helpers hier NIET in opgaan ──────────────────
//
// Er coëxisteren vandaag drie parses met verschillend negatief-beleid:
// `parseBedragInput` (geen clamping), `parseBedrag` (clampt negatief stil naar
// 0) en `parseAmount` (staat negatief BEWUST toe — netto-vermogen-backfill kan
// legitiem negatief zijn). Die laatste is een echte domeinregel, geen
// slordigheid. Deze module vervangt ze daarom niet door één beleid, maar maakt
// het beleid een EXPLICIETE parameter (`AmountSignPolicy`): elk veld zegt zelf
// of negatief mag, en de gebruiker ziet het antwoord zodra hij een minteken
// typt. De uitrol over die bestaande aanroepers is bewust gefaseerd (zie het
// IMPLEMENTATIE-blok op kaart H9); deze module is fase 1.

/** Zegt of een veld negatieve bedragen accepteert. Altijd expliciet kiezen. */
export type AmountSignPolicy = 'positive-only' | 'allow-negative'

export interface AmountSanitizeResult {
  /** De invoer, ontdaan van tekens die niet in een bedrag horen. */
  value: string
  /** Geweigerde tekens, uniek, in volgorde van eerste voorkomen. */
  rejected: string[]
  /**
   * Client-veilige uitleg in de vorm "wat ging mis + hoe fix je het", of `null`
   * wanneer er niets geweigerd is. Toon deze altijd — hem negeren is precies
   * de bug die deze module dichtzet.
   */
  reason: string | null
}

/**
 * Scheidingstekens die een bedrag mag dragen. Beide blijven staan tijdens het
 * typen; welke van de twee de DECIMALE is, beslist pas `parseAmountInput`.
 * Tijdens het typen iets van die strekking beslissen zou betekenen dat het veld
 * de invoer verandert terwijl de gebruiker nog bezig is — de bug in het klein.
 */
const SEPARATORS = new Set([',', '.'])

const MINUS = '-'

/**
 * Filtert de invoer tot wat in een bedrag past, en RAPPORTEERT wat eruit ging.
 *
 * Toegestaan: cijfers, `,` en `.`, en — alleen bij `allow-negative` en alleen
 * als eerste teken — een `-`. Al het overige wordt geweigerd én benoemd.
 *
 * Een minteken op een andere positie dan vooraan is óók bij `allow-negative`
 * ongeldig (`5-0` is geen bedrag); dat levert dezelfde melding als een minteken
 * op een positief-only veld, want voor de gebruiker is de fix identiek.
 */
export function sanitizeAmountInput(
  raw: string,
  policy: AmountSignPolicy = 'positive-only',
): AmountSanitizeResult {
  const allowNegative = policy === 'allow-negative'
  let value = ''
  let minusRejected = false
  const rejected: string[] = []

  const reject = (ch: string) => {
    if (!rejected.includes(ch)) rejected.push(ch)
  }

  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      value += ch
      continue
    }
    if (SEPARATORS.has(ch)) {
      value += ch
      continue
    }
    if (ch === MINUS) {
      // Alleen vooraan, en alleen wanneer het veld negatief toestaat.
      if (allowNegative && value === '') {
        value += ch
      } else {
        minusRejected = true
        reject(ch)
      }
      continue
    }
    reject(ch)
  }

  return { value, rejected, reason: buildReason(rejected, minusRejected, allowNegative) }
}

/**
 * "Wat ging mis + hoe fix je het" — de UX-copy-regel, gedeeld zodat elk
 * bedragveld letterlijk dezelfde melding geeft.
 */
function buildReason(rejected: string[], minusRejected: boolean, allowNegative: boolean): string | null {
  if (rejected.length === 0) return null

  // Het minteken krijgt voorrang: dat is de melding die de gebruiker écht mist
  // (hij ziet een getal staan dat hij niet bedoelde), terwijl een geweigerde
  // letter zichzelf al verraadt doordat er niets verschijnt.
  if (minusRejected) {
    return allowNegative
      ? 'Een minteken kan alleen helemaal vooraan staan — het is niet overgenomen.'
      : 'Een negatief bedrag kan hier niet — het minteken is niet overgenomen. Vul een bedrag van 0 of hoger in.'
  }

  const overige = rejected.filter((ch) => ch !== MINUS)
  const zichtbaar = overige.map((ch) => (ch === ' ' ? 'spatie' : ch)).join(' ')
  return `Dit hoort niet in een bedrag en is niet overgenomen: ${zichtbaar}. Gebruik alleen cijfers en een komma.`
}

/**
 * Leest een bedrag-invoerstring als getal, of `null` bij leeg/ongeldig.
 *
 * NL-lezing, identiek aan het idioom dat de onboarding en de check-intake al
 * gebruiken (`parseBedragInput` / `parseBedrag`): een `.` of `,` die door exact
 * drie cijfers gevolgd wordt is een DUIZENDTALSCHEIDING en verdwijnt; de
 * resterende komma is de decimaal.
 *
 *   '45.000'    → 45000
 *   '2.150,50'  → 2150.5
 *   '12,5'      → 12.5
 *   '1.234'     → 1234   (duizendtal-lezing wint bewust van 1,234)
 *
 * `null` bij: leeg, alleen een minteken, of iets dat geen eindig getal oplevert.
 * Geen stille 0 — een aanroeper die niet kán rekenen hoort dat te weten, niet
 * ongemerkt met nul door te gaan.
 */
export function parseAmountInput(
  raw: string,
  policy: AmountSignPolicy = 'positive-only',
): number | null {
  const { value } = sanitizeAmountInput(raw, policy)
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === MINUS) return null

  const cleaned = trimmed.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  if (policy === 'positive-only' && n < 0) return null
  return n
}
