// lib/horizon/kernel-profile-basis.ts
//
// DE GRONDSLAG-INJECTIE VOOR DE KERNEL-PROFIELRIJ (ADR 0103)
// ───────────────────────────────────────────────────────────────────────────
// De horizon-kernel modelleert KASSTROOM: `buildInkomenUitgaven`
// (lib/horizon-kernel/adapter/params.ts) leest `net_monthly_income` ×12 als
// `nettoJaarinkomen`, en dat voedt via `cf.basissalaris` (bridge.ts) het
// pre-FIRE-kasstroomkanaal CF!D. De kern heeft dus BEDRAGEN nodig, geen
// verhouding — hij consumeert de spaarquote niet, en kan de grondslagbeslissing
// ook niet zelf nemen: het contract `ConvergentieRawProfileRow` draagt geen
// budgetsom en geen transactiereeks.
//
// Daarom injecteert de APP de al-geresolveerde bedragen in de rauwe profielrij,
// precies zoals daar al gebeurt met `yearly_essential_expenses` (een berekende
// waarde, geen DB-kolom). Het kernel-contract verandert NIET: dezelfde velden,
// alleen gevuld met het getal dat de rest van de app ook gebruikt.
//
// WAAROM DIT ÉÉN FUNCTIE IS: de kernel-context ontstaat op drie plaatsen — de
// SSR-loader, de client-mount-fetch en de client-refresh. Zolang de injectie
// daar los werd overgeschreven, kon SSR een andere FIRE-datum tonen dan de
// client na hydratie. Eén helper, drie call-sites, geen drift.

/** De twee velden die de kernel als kasstroom-basis leest. */
export interface KernelProfileBedragen {
  net_monthly_income?: number | null
  estimated_monthly_expenses?: number | null
}

/**
 * Vervang de RAUWE profielbedragen door de geresolveerde effectieve bedragen.
 *
 * `net_monthly_income` op `profiles` bestaat alleen voor de `manual`-grondslag;
 * een gebruiker op `budget` of `transaction` heeft daar meestal 0/null staan.
 * Zonder deze injectie rekent de kernel dan met €0 basissalaris terwijl
 * dashboard en cashflow een gezond effectief inkomen tonen.
 *
 * DE BLAST RADIUS IS BREDER DAN DAT ENE VELD: de helper overschrijft óók
 * `estimated_monthly_expenses`, en dát veld is bij vrijwel iedereen gevuld (de
 * onboarding-schatting). Bovendien wint bij grondslag `auto` — de waarde van
 * élke niet-gemigreerde rij, dus het gros van de gebruikers — de budget- of
 * transactiewaarde van de profielkolom. De projectie beweegt hier dus niet
 * alleen voor een smalle groep, maar voor iedereen wiens effectieve bedragen van
 * zijn profielkolommen afwijken.
 *
 * Idempotent: is de rij al geïnjecteerd met dezelfde effectieve bedragen, dan is
 * het resultaat gelijk — er is geen tweede resolutie en dus geen drift wanneer
 * zowel de loader als de consument 'm toepast.
 */
export function withResolvedKernelBedragen<T extends KernelProfileBedragen>(
  row: T,
  effective: { monthlyIncome: number; monthlyExpenses: number },
): T {
  return {
    ...row,
    net_monthly_income: effective.monthlyIncome,
    estimated_monthly_expenses: effective.monthlyExpenses,
  }
}
