/**
 * `lib/tax-lifetime` — levenslange belastingdruk als **rapportagelaag naast**
 * de horizon-projectie (Fase 3, fiscale optimizer).
 *
 * Twee publieke ingangen:
 *  - `computeLifetimeTax` — de reeks zelf. Rekent BOVENOP de unified-jaarrijen,
 *    koppelt niets terug in de kernel-cashflow, en gebruikt
 *    `lib/box1-tax.ts#computeBox1Tax` als enige tariefmotor. Zie `lifetime-tax.ts`
 *    voor de volledige redenering en de modelkeuzes.
 *  - `runVariantenSweep` — de VERGELIJK-laag: drie onttrekkingsvolgordes op één
 *    levenslange-belasting-as, met het FIRE- en buffer-veto en het verplichte
 *    eindvermogen. Zie `varianten-sweep.ts`; de server-snapshot zit in
 *    `varianten-sweep-loader.ts` (bewust NIET vanuit deze index geëxporteerd — die
 *    module is server-only, de rest is worker-veilig puur).
 */

export {
  computeLifetimeTax,
  type LifetimeTaxOptions,
  type LifetimeTaxRowInput,
  type LifetimeTaxSeries,
  type LifetimeTaxYearRow,
} from './lifetime-tax'

export {
  runVariantenSweep,
  finaliseerVarianten,
  bepaalDiskwalificatie,
  kiesWinnaar,
  buildVariantProfile,
  variantenSweepInputHash,
  VARIANT_SPECS,
  REFERENTIE_VARIANT_ID,
  FIRE_LATER_TOLERANTIE_JAAR,
  GELIJKSPEL_TOLERANTIE_EUR,
  type VariantId,
  type VariantSpec,
  type VariantDiskwalificatie,
  type VariantUitkomst,
  type VariantenSweepResultaat,
  type VariantenSweepSnapshot,
} from './varianten-sweep'
