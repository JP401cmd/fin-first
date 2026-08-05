/**
 * `lib/tax-lifetime` — levenslange belastingdruk als **rapportagelaag naast**
 * de horizon-projectie (Fase 3, fiscale optimizer).
 *
 * Enige publieke ingang: `computeLifetimeTax`. De module rekent BOVENOP de
 * unified-jaarrijen, koppelt niets terug in de kernel-cashflow, en gebruikt
 * `lib/box1-tax.ts#computeBox1Tax` als enige tariefmotor. Zie
 * `lifetime-tax.ts` voor de volledige redenering en de modelkeuzes.
 */

export {
  computeLifetimeTax,
  type LifetimeTaxOptions,
  type LifetimeTaxRowInput,
  type LifetimeTaxSeries,
  type LifetimeTaxYearRow,
} from './lifetime-tax'
