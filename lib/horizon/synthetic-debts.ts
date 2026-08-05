/**
 * Synthetische schuldpotten — de ENIGE plek waar ze een naam krijgen.
 *
 * De horizon-kernel-bridge levert `UnifiedProjectionRow.debtBalances` met twee
 * soorten sleutels:
 *  - het `id` van een echte `Debt`-rij uit de database, en
 *  - een SYNTHETISCHE sleutel voor een pot die het model zelf opent en die dus
 *    géén databaserij heeft: `'tekort-lening'` (overbrugging bij een
 *    liquiditeitstekort) en `'opeethypotheek'` (de opnames tegen de overwaarde
 *    bij de opeethypotheek-strategie, ADR 0029).
 *
 * Elke UI die over `debtBalances` itereert liep daardoor tegen dezelfde bug aan:
 * de sleutel staat niet in de `Debt`-lijst, dus valt de weergave terug op een
 * UUID-afkapping (`'opeethypotheek'.slice(0, 8)` → "opeethyp") of wordt de rij
 * stilletjes weggefilterd terwijl het bedrag wél in `row.totalDebts` zit.
 *
 * Deze module is de gedeelde bron: één map, twee consumenten
 * (`phase-detail-table.tsx` en `horizon-year-details-sheet.tsx`). Komt er een
 * derde synthetische pot bij, dan is dit de enige plek die bij moet — en beide
 * oppervlakken volgen automatisch.
 *
 * Pure module: geen React, geen Supabase.
 */
import type { DebtType } from '@/lib/debt-data'

/** De synthetische `debtBalances`-sleutels die de kernel-bridge kan produceren. */
export type SyntheticDebtKey = 'tekort-lening' | 'opeethypotheek'

export interface SyntheticDebtDescriptor {
  /** Naam zoals de gebruiker 'm leest (kop van de regel / kolom "Lening"). */
  name: string
  /** Korte typeaanduiding onder de naam — spiegelt `DEBT_TYPE_LABELS` bij echte schulden. */
  typeLabel: string
  /**
   * Bestaand `DebtType`-token, UITSLUITEND voor icoon + kleur. De pot is géén
   * schuld van dat type in de database; dit is puur presentatie zodat de rij in
   * dezelfde visuele familie valt als de echte schulden ernaast.
   */
  debtType: DebtType
}

/**
 * Naamgeving volgt de tekst die elders in de app al gebruikt wordt:
 * "Tekort-lening" (de melding op /toekomst, horizon-client.tsx) en
 * "Opeethypotheek" (`HOUSING_STRATEGY_LABELS.reverse_mortgage`) — één woord per
 * concept, geen tweede variant.
 */
export const SYNTHETIC_DEBT_LABELS: Record<SyntheticDebtKey, SyntheticDebtDescriptor> = {
  'tekort-lening': {
    name: 'Tekort-lening',
    typeLabel: 'Overbrugging',
    debtType: 'other',
  },
  opeethypotheek: {
    name: 'Opeethypotheek',
    typeLabel: 'Hypotheek',
    debtType: 'mortgage',
  },
}

/** Is dit een synthetische pot (dus géén `Debt`-id uit de database)? */
export function isSyntheticDebtKey(debtId: string): debtId is SyntheticDebtKey {
  return Object.prototype.hasOwnProperty.call(SYNTHETIC_DEBT_LABELS, debtId)
}

/** Beschrijving van een synthetische pot, of `null` voor een gewoon `Debt`-id. */
export function syntheticDebtDescriptor(debtId: string): SyntheticDebtDescriptor | null {
  return isSyntheticDebtKey(debtId) ? SYNTHETIC_DEBT_LABELS[debtId] : null
}

/**
 * Leesbaar label voor een `debtBalances`-sleutel, in vaste volgorde:
 *   1. de naam uit de meegegeven `Debt`-map (echte schuld),
 *   2. de synthetische naam uit deze module,
 *   3. pas dán de UUID-afkapping — die hoort alleen nog te vallen bij een écht
 *      onbekend id, nooit meer bij een modelpot.
 */
export function resolveDebtLabel(
  debtId: string,
  debtLabelMap: Record<string, string>,
): string {
  const fromDebts = debtLabelMap[debtId]
  if (fromDebts) return fromDebts
  const synthetic = syntheticDebtDescriptor(debtId)
  if (synthetic) return synthetic.name
  return debtId.slice(0, 8)
}
