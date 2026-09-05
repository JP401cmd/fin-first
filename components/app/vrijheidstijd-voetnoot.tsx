'use client'

import { formatFreedomRateFootnote, type FreedomRateSource } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/**
 * VrijheidstijdVoetnoot — de wisselkoers naast een tijdgetal (UR3-08).
 *
 * ══ Waarom dit component bestaat ═════════════════════════════════════════
 *
 * Veertien oppervlakken toonden een vrijheidstijd zonder erbij te zeggen
 * waar die tijd vandaan komt; de vier die het wél deden zaten allemaal in
 * belasting-/cashflow-context — juist niet waar een beginner begint. Geen van
 * de drie persona's uit de audit van 5 sep 2026 kwam er ooit achter dat
 * vrijheidstijd niets meer is dan bedrag ÷ dagtarief.
 *
 * De ZIN bestond al: `formatFreedomRateFootnote` in lib/format.ts. Wat
 * ontbrak was een dráger die 'm overal identiek rendert. Dit component is die
 * drager — en bewust niets meer:
 *
 *  1. **Geen tweede formulering.** De helper blijft het enige huis van de
 *     tekst. Wie hier een eigen `formatCurrency(dailyRate)` zou schrijven,
 *     maakt een tweede waarheid over dezelfde koers.
 *  2. **Geen nieuw tijdgetal.** Eigenaarsbesluit 2 (12 jul 2026): de
 *     vrijheidstijd-vertaling breidt niet uit. Dit component rendert
 *     uitsluitend de KOERS, nooit een vrijheidstijd — het hoort dus alleen
 *     dáár waar al een tijdgetal staat.
 *  3. **Maskering is niet delegeerbaar.** De koers maakt een gemaskeerd
 *     bedrag terugrekenbaar (ADR 0091 laag 4), dus leest dit component
 *     `useMaskedAmounts()` ZÉLF in plaats van `masked` als prop met default
 *     te accepteren. Eén vergeten prop zou anders een privacylek zijn.
 *  4. **Onbekend is geen nul (ADR 0131).** `source: 'none'` — of een tarief
 *     van 0 — levert `null`. Een tijdgetal dat op een onbekende grondslag
 *     rust krijgt geen wisselkoers naast zich, want die zou een meting
 *     suggereren die er niet is.
 *
 * ══ Waar hij NIET hoort ══════════════════════════════════════════════════
 *
 * Onder een **runway**-getal (de kop op /overzicht, de deelkaart, de
 * briefing-mail). Dat is sinds ADR 0126 D1 een andere grootheid: een
 * kernel-projectie met rendement, AOW en belasting, geen deling door een
 * dagtarief. Een dagtarief-voetnoot zou daar een onjuiste claim zijn. Die
 * oppervlakken krijgen een eigen zin (eigenaarsbesluit B, latere fase).
 */
export function VrijheidstijdVoetnoot({
  dailyRate,
  source,
  vorm = 'regel',
  className,
}: {
  /** Het canonieke dagtarief (€/dag) uit de bundel — nooit hier berekend. */
  dailyRate: number | null | undefined
  /**
   * Herkomst van dat tarief (`recentDailyExpenseRateFromRows(...).source`).
   * Ontbreekt hij op een bundel, dan is de terugval `'transactions'` bij een
   * tarief > 0 — dezelfde terugval als hub-kansen en het cashflow-blok.
   */
  source?: FreedomRateSource
  /**
   * `'regel'` = losse voetnootregel onder een blok ("Tegen je dagtarief van
   * € 105 per dag — je uitgaven over de afgelopen 12 maanden.").
   * `'inline'` = compact achter een tijdlabel ("bij € 105/dag").
   */
  vorm?: 'regel' | 'inline'
  className?: string
}) {
  const { masked } = useMaskedAmounts()
  const rate = typeof dailyRate === 'number' && Number.isFinite(dailyRate) ? dailyRate : 0
  const tekst = formatFreedomRateFootnote(
    rate,
    source ?? (rate > 0 ? 'transactions' : 'none'),
    masked,
    vorm === 'inline' ? 'short' : 'long',
  )

  if (!tekst) return null

  // Monospace 10px in --ink-3: dezelfde voetnoot-stijl als hub-kansen en het
  // cashflow-instellingenblok, zodat de koers overal als hetzelfde soort
  // bijschrift leest en niet als een nieuwe mededeling.
  const basis = 'font-mono text-[10px] leading-relaxed text-[var(--ink-3)]'

  if (vorm === 'inline') {
    return <span className={`${basis} ${className ?? ''}`.trim()}>{tekst}</span>
  }

  return <p className={`${basis} ${className ?? ''}`.trim()}>{tekst}</p>
}
