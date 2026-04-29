/**
 * Snijpunt-berekening tussen opbouw-forward-curve en afbouw-required-curve.
 *
 * Maakt deel uit van de aggregatie-aanpak voor de test-pagina
 * (`/horizon/doorrekening-test/overzicht`). Zie plan
 * `doorrekening-overzicht-aggregatie.md` — "Aanbevolen aanpak → Stap 3" en
 * "Implementatie-fasen → Fase 2 → stap 5".
 *
 * ── Conceptueel ─────────────────────────────────────────────────────────
 *  - **Opbouw-curve**: wat de gebruiker *heeft* per leeftijd
 *    (`computeOpbouwProjection().yearlyRows[i].netWorth`).
 *  - **Required-curve**: wat de gebruiker *moet hebben* per leeftijd om de
 *    eind-strategie te halen
 *    (`computeAfbouwRequiredSchedule()[i].requiredPortfolio`).
 *  - **Kruising** = eerste leeftijd waar opbouw ≥ required.
 *
 * ── Assumpties ──────────────────────────────────────────────────────────
 *  1. `opbouwRows` en `requiredSchedule` hebben **dezelfde granulariteit**
 *     (één rij per leeftijd, jaarlijks) en overlappen minstens op
 *     `[currentAge, endAge]`. Extra rijen aan beide zijden worden genegeerd.
 *  2. Lookups via een lineaire scan — schaal is maximaal ~80 leeftijden,
 *     dus O(n) is ruim voldoende en simpeler dan een index-map.
 *  3. Leeftijden waar `requiredPortfolio === null` worden **overgeslagen**
 *     (bv. pensioen pre-AOW). De kruising kan dan pas vanaf de eerste
 *     non-null leeftijd optreden.
 *
 * ── Pensioen-specifiek ──────────────────────────────────────────────────
 * Voor pensioen-strategie wordt de kruising door de caller vastgezet op
 * AOW-leeftijd (geen zoekproces). Deze helper hoeft dat niet te weten;
 * hij rekent gewoon met de curves die binnenkomen. Maar voor een correcte
 * fractionele interpolatie kan de caller beter direct
 * {@link interpolateIntersection} aanroepen met de geforceerde discrete
 * AOW-leeftijd — zo blijf je onafhankelijk van waar `findIntersection` de
 * snijding wiskundig zou vinden (die kan iets eerder of later liggen).
 *
 * ── Fractionele formule ─────────────────────────────────────────────────
 * Dezelfde formule als `lib/fire-simulation.ts:544-556` om consistent
 * gedrag te krijgen met de productie-chart:
 *
 *   t       = (reqAtPrev − portfolioPrev) /
 *             ((portfolioAtCandidate − portfolioPrev) − (reqAtCandidate − reqAtPrev))
 *   result  = (age − 1) + clamp(t, 0, 1)
 *
 * Interpretatie: op `age − 1` is de portfolio (meestal) onder required; op
 * `age` erboven. We nemen aan dat beide curves binnen het jaar lineair
 * interpoleren — het snijpunt ligt op het `t`-deel van dat interval.
 */

export interface IntersectionResult {
  age: number | null
  fractional: number | null
}

type OpbouwRow = { age: number; netWorth: number }
type RequiredPoint = { age: number; requiredPortfolio: number | null }

/**
 * Zoek de eerste leeftijd waar de opbouw-curve de required-curve raakt of
 * overstijgt.
 *
 * @returns `{ age: null, fractional: null }` als er geen kruising bestaat
 *          binnen het overlap-bereik. Anders: discrete leeftijd én de
 *          fractionele variant (lineair geïnterpoleerd).
 *
 * Edge cases:
 *  - Kruising op `currentAge` (portfolio al ≥ required meteen): `fractional`
 *    is gelijk aan die currentAge exact — géén interpolatie terug naar
 *    `age − 1`, want er is geen vorige rij.
 *  - Leeftijd met `requiredPortfolio === null` wordt overgeslagen bij
 *    kandidaat-selectie. De "vorige" rij voor interpolatie is dan de
 *    directe index-buur in `opbouwRows`/`requiredSchedule`; als die `null`
 *    is valt de fractional terug op de discrete kandidaat-leeftijd.
 */
export function findIntersection(
  opbouwRows: ReadonlyArray<OpbouwRow>,
  requiredSchedule: ReadonlyArray<RequiredPoint>
): IntersectionResult {
  const n = Math.min(opbouwRows.length, requiredSchedule.length)
  if (n === 0) return { age: null, fractional: null }

  for (let i = 0; i < n; i++) {
    const opbouw = opbouwRows[i]
    const required = requiredSchedule[i]

    // Sanity: leeftijden moeten matchen. Als de caller een niet-uitgelijnde
    // array doorgeeft, loggen we niets maar houden we ons aan de index —
    // dat is consistenter dan te proberen te mergen op age.
    if (required.requiredPortfolio === null) continue

    if (opbouw.netWorth >= required.requiredPortfolio) {
      // Kruising bij eerste kandidaat (i === 0) of direct na een null-reeks
      // waar geen vergelijkbare "vorige" bestaat → geen interpolatie.
      if (i === 0) {
        return { age: opbouw.age, fractional: opbouw.age }
      }

      const prevOpbouw = opbouwRows[i - 1]
      const prevRequired = requiredSchedule[i - 1]

      // Als de vorige rij geen required heeft kunnen we niet interpoleren —
      // val terug op de discrete kandidaat-leeftijd.
      if (prevRequired.requiredPortfolio === null) {
        return { age: opbouw.age, fractional: opbouw.age }
      }

      const fractional = interpolateIntersectionRaw(
        prevOpbouw.netWorth,
        opbouw.netWorth,
        prevRequired.requiredPortfolio,
        required.requiredPortfolio,
        opbouw.age
      )
      return { age: opbouw.age, fractional }
    }
  }

  return { age: null, fractional: null }
}

/**
 * Bereken de fractionele kruising voor een al-bekende discrete kruisings­leeftijd.
 *
 * Handig voor **pensioen-modus** waar de kruising geforceerd op AOW-leeftijd
 * staat: de caller geeft `discreteAge = aowAge` door en krijgt de lineair
 * geïnterpoleerde waarde binnen `(aowAge − 1, aowAge)`.
 *
 * Retourneert `discreteAge` (exact, geen interpolatie) als:
 *  - `discreteAge` niet voorkomt in de curves;
 *  - `discreteAge` gelijk is aan de eerste rij (geen vorige om tegen te interpoleren);
 *  - De vorige rij `requiredPortfolio === null` heeft.
 */
export function interpolateIntersection(
  opbouwRows: ReadonlyArray<OpbouwRow>,
  requiredSchedule: ReadonlyArray<RequiredPoint>,
  discreteAge: number
): number {
  const n = Math.min(opbouwRows.length, requiredSchedule.length)

  // Vind index van discreteAge in beide arrays (aangenomen: uitgelijnd).
  let idx = -1
  for (let i = 0; i < n; i++) {
    if (opbouwRows[i].age === discreteAge) {
      idx = i
      break
    }
  }

  if (idx <= 0) return discreteAge // niet gevonden of eerste rij

  const current = opbouwRows[idx]
  const currentReq = requiredSchedule[idx]
  const prev = opbouwRows[idx - 1]
  const prevReq = requiredSchedule[idx - 1]

  if (currentReq.requiredPortfolio === null) return discreteAge
  if (prevReq.requiredPortfolio === null) return discreteAge

  return interpolateIntersectionRaw(
    prev.netWorth,
    current.netWorth,
    prevReq.requiredPortfolio,
    currentReq.requiredPortfolio,
    current.age
  )
}

/**
 * Interne formule — zie JSDoc module-header voor afleiding. Clamped op
 * [0, 1] zodat numerieke ruis geen fractional buiten `(age − 1, age)` geeft.
 *
 * Degenerate geval `denom === 0`: beide curves lopen binnen het interval
 * parallel. Val terug op het midden (`0.5`) — dezelfde fallback als
 * `fire-simulation.ts:554`.
 */
function interpolateIntersectionRaw(
  portfolioPrev: number,
  portfolioAtCandidate: number,
  reqAtPrev: number,
  reqAtCandidate: number,
  candidateAge: number
): number {
  const portDiff = portfolioAtCandidate - portfolioPrev
  const reqDiff = reqAtCandidate - reqAtPrev
  const denom = portDiff - reqDiff
  const t = denom !== 0 ? (reqAtPrev - portfolioPrev) / denom : 0.5
  const clamped = Math.max(0, Math.min(1, t))
  return (candidateAge - 1) + clamped
}
