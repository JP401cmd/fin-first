/**
 * Concept-model van één pensioenpot (life_events met event_type='pension') zoals de
 * pensioenpot-editor 'm bewerkt: omzetten van en naar een LifeEvent, de standaard voor
 * een nieuwe pot, het effectieve maandbedrag en de toegestane uitkeringsduur per type.
 *
 * Puur (geen IO, geen React) en ongewijzigd verhuisd uit de pensioen-strategie-editor
 * (TPR-15), zodat dezelfde pot-body zowel in de strategie-modal als in de plan-review
 * kan renderen. Labels zijn gewone strings: `eventFromPot`/het typewissel-gedrag lezen
 * `TYPE_LABEL` en horen er dus bij.
 */

import {
  annuitizePension,
  normalizePensionType,
  type CanonicalPensionType,
  type LifeEvent,
} from '@/lib/horizon-data'

export const TYPE_LABEL: Record<CanonicalPensionType, string> = {
  bedrijf: 'Bedrijfspensioen',
  lijfrente_levenslang: 'Levenslange lijfrente',
  lijfrente_bancair: 'Bancaire lijfrente',
  tijdelijke_oudedagslijfrente: 'Tijdelijke oudedagslijfrente',
}

export const TYPE_SUB: Record<CanonicalPensionType, string> = {
  bedrijf: 'Levenslange uitkering via je werkgever (mijnpensioenoverzicht.nl).',
  lijfrente_levenslang: 'Pot vervalt bij overlijden tenzij partneruitkering.',
  lijfrente_bancair: 'Wettelijk minimaal 20 jaar; restant gaat naar erfgenamen.',
  tijdelijke_oudedagslijfrente: 'Minimaal 5 jaar vanaf AOW. Plafond € 27.192/jr (2026).',
}

export const TYPE_ORDER: CanonicalPensionType[] = [
  'bedrijf',
  'lijfrente_levenslang',
  'lijfrente_bancair',
  'tijdelijke_oudedagslijfrente',
]

export const TIJDELIJKE_PLAFOND = 27192

export type Duur = 'levenslang' | '20' | '10' | '5'

export function allowedDuur(t: CanonicalPensionType): Duur[] {
  switch (t) {
    case 'bedrijf':
    case 'lijfrente_levenslang':
      return ['levenslang']
    case 'lijfrente_bancair':
      return ['20']
    case 'tijdelijke_oudedagslijfrente':
      return ['5', '10']
  }
}

export const DUUR_LABEL: Record<Duur, string> = {
  levenslang: 'Levenslang',
  '20': '20 jaar',
  '10': '10 jaar',
  '5': '5 jaar',
}

export interface PotDraft {
  id: string | null
  name: string
  pensioenType: CanonicalPensionType
  ingangLeeftijd: number
  invoermodus: 'maand' | 'pot'
  brutoBedrag: number
  inlegBedrag: number
  uitkeringsduur: Duur
  isGeindexeerd: boolean
  partnerUitkeringPct: number
}

export function potFromEvent(ev: LifeEvent): PotDraft {
  const m = (ev.metadata ?? {}) as Record<string, unknown>
  const pensioenType = normalizePensionType(m.pensioenType as string | undefined)
  // Een duur die niet bij het type past (legacy `banksparen` zonder duur → levenslang) is in
  // het formulier niet te kiezen: begin dan op de eerste toegestane duur van het type.
  const toegestaan = allowedDuur(pensioenType)
  const duur = m.uitkeringsduur as Duur | undefined
  return {
    id: ev.id,
    name: ev.name,
    pensioenType,
    ingangLeeftijd: Number(m.ingangLeeftijd ?? ev.target_age ?? 67),
    invoermodus: Number(m.inlegBedrag ?? 0) > 0 ? 'pot' : 'maand',
    brutoBedrag: Number(m.brutoBedrag ?? ev.monthly_income_change ?? 0),
    inlegBedrag: Number(m.inlegBedrag ?? 0),
    uitkeringsduur: duur && toegestaan.includes(duur) ? duur : toegestaan[0]!,
    // Zelfde terugval als de kern (`m.isGeindexeerd ?? ev.is_indexed`): een UPO-pot zonder
    // die sleutel is geïndexeerd; zonder deze terugval zette opslaan dat stil op "nee".
    isGeindexeerd: Boolean(m.isGeindexeerd ?? ev.is_indexed ?? false),
    partnerUitkeringPct: Number(m.partnerUitkeringPct ?? 70),
  }
}

/** Beginstand van een nieuwe pot. `brutoBedrag` = het voorbeeldbedrag (de modal: 675). */
export function newPot(ingang: number, brutoBedrag = 675): PotDraft {
  return {
    id: null,
    name: 'Bedrijfspensioen',
    pensioenType: 'bedrijf',
    ingangLeeftijd: ingang,
    invoermodus: 'maand',
    brutoBedrag,
    inlegBedrag: 0,
    uitkeringsduur: 'levenslang',
    isGeindexeerd: false,
    partnerUitkeringPct: 70,
  }
}

export function effectiveMonthly(p: PotDraft): number {
  if (p.invoermodus === 'pot') {
    return annuitizePension({
      inlegBedrag: p.inlegBedrag,
      ingangLeeftijd: p.ingangLeeftijd,
      uitkeringsduur: p.uitkeringsduur,
      partnerUitkeringPct: p.pensioenType === 'lijfrente_levenslang' ? p.partnerUitkeringPct : undefined,
    })
  }
  return Math.round(p.brutoBedrag)
}

export function eventFromPot(p: PotDraft): LifeEvent {
  return {
    id: p.id ?? 'pension-draft',
    name: p.name,
    event_type: 'pension',
    target_age: p.ingangLeeftijd,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: effectiveMonthly(p),
    duration_months: p.uitkeringsduur === 'levenslang' ? 0 : Number(p.uitkeringsduur) * 12,
    icon: p.pensioenType === 'bedrijf' ? 'Landmark' : 'PiggyBank',
    is_active: true,
    sort_order: 0,
    is_indexed: p.isGeindexeerd,
    metadata: {
      pensioenType: p.pensioenType,
      ingangLeeftijd: p.ingangLeeftijd,
      brutoBedrag: p.brutoBedrag,
      inlegBedrag: p.invoermodus === 'pot' ? p.inlegBedrag : 0,
      uitkeringsduur: p.uitkeringsduur,
      isGeindexeerd: p.isGeindexeerd,
      partnerUitkeringPct: p.partnerUitkeringPct,
      source: 'pension-strategy',
    },
  }
}
