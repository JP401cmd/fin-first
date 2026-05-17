// ── Budget-templates: Minimalistisch / Nibud / Uitgebreid ─────
//
// Drie voorgedefinieerde budget-categorisaties + bijbehorende
// procentuele allocaties op het netto-maandinkomen. Wordt gebruikt
// door:
//   · `components/app/app-setup/configs/budgetteren.config.tsx`
//     (sectie 2 van de Budgetteren-setup-gate)
//   · `components/app/budget-plan-editor-sheet.tsx` (template-picker
//     binnen de bestaande plan-editor)
//
// Verplaatst (mei 2026) uit `components/onboarding/onboarding-budgets.tsx`
// om hergebruik mogelijk te maken zonder dat de oude onboarding-component
// (die niet meer in de stappenvolgorde zit) moet blijven bestaan.

import type { ComponentType } from 'react'
import { Minus, List, ListTree, type LucideProps } from 'lucide-react'
import { BUDGET_SLUGS } from '@/lib/budget-data'

export type BudgetTemplateId = 'minimalistisch' | 'nibud' | 'uitgebreid'

export interface TemplateCategory {
  label: string
  icon: string
  /** Budget slugs included in this category */
  slugs: string[]
}

export interface BudgetTemplate {
  id: BudgetTemplateId
  name: string
  subtitle: string
  description: string
  icon: ComponentType<LucideProps>
  categories: TemplateCategory[]
}

const S = BUDGET_SLUGS

// ── Template 1: Minimalistisch ───────────────────────────────
const MINIMALISTISCH_CATEGORIES: TemplateCategory[] = [
  { label: 'Wonen', icon: '🏠', slugs: [S.HUUR_HYPOTHEEK, S.GAS_WATER_LICHT, S.VERZEKERINGEN_WONEN, S.GEMEENTELIJKE_LASTEN] },
  { label: 'Boodschappen', icon: '🛒', slugs: [S.BOODSCHAPPEN] },
  { label: 'Vervoer', icon: '🚗', slugs: [S.BRANDSTOF_OV] },
  { label: 'Vrije besteding', icon: '🎯', slugs: [S.KLEDING_OVERIGE] },
  { label: 'Sparen', icon: '💰', slugs: [S.SPAREN_NOODBUFFER, S.INVESTEREN_FIRE] },
]

// ── Template 2: Nibud-geïnspireerd ──────────────────────────
const NIBUD_CATEGORIES: TemplateCategory[] = [
  { label: 'Woonlasten', icon: '🏠', slugs: [S.HUUR_HYPOTHEEK, S.GAS_WATER_LICHT, S.GEMEENTELIJKE_LASTEN] },
  { label: 'Verzekeringen', icon: '🛡️', slugs: [S.VERZEKERINGEN_WONEN] },
  { label: 'Boodschappen & huishouden', icon: '🛒', slugs: [S.BOODSCHAPPEN, S.HUISHOUDEN_VERZORGING] },
  { label: 'Kinderen & zorg', icon: '👶', slugs: [S.KINDEREN_SCHOOL, S.MEDISCHE_KOSTEN] },
  { label: 'Vervoer', icon: '🚗', slugs: [S.BRANDSTOF_OV, S.AUTO_VASTE_LASTEN, S.FIETS_DEELVERVOER] },
  { label: 'Kleding & verzorging', icon: '👔', slugs: [S.KLEDING_OVERIGE, S.HUISHOUDEN_VERZORGING] },
  { label: 'Vrije tijd & vakantie', icon: '🎉', slugs: [S.UIT_ETEN_HORECA, S.VRIJE_TIJD_SPORT, S.VAKANTIE] },
  { label: 'Reserveringen & sparen', icon: '🏦', slugs: [S.SPAREN_NOODBUFFER, S.INVESTEREN_FIRE] },
  { label: 'Aflossingen', icon: '💳', slugs: [S.SCHULDEN_AFLOSSINGEN, S.EXTRA_AFLOSSING_HYPOTHEEK] },
]

// ── Template 3: Uitgebreid ──────────────────────────────────
const UITGEBREID_CATEGORIES: TemplateCategory[] = [
  { label: 'Wonen', icon: '🏠', slugs: [S.HUUR_HYPOTHEEK, S.GAS_WATER_LICHT, S.VERZEKERINGEN_WONEN, S.GEMEENTELIJKE_LASTEN] },
  { label: 'Boodschappen', icon: '🛒', slugs: [S.BOODSCHAPPEN] },
  { label: 'Huishouden & verzorging', icon: '🧴', slugs: [S.HUISHOUDEN_VERZORGING] },
  { label: 'Kinderen & school', icon: '👶', slugs: [S.KINDEREN_SCHOOL] },
  { label: 'Medische kosten', icon: '🏥', slugs: [S.MEDISCHE_KOSTEN] },
  { label: 'Brandstof & OV', icon: '⛽', slugs: [S.BRANDSTOF_OV] },
  { label: 'Auto vaste lasten', icon: '🚙', slugs: [S.AUTO_VASTE_LASTEN] },
  { label: 'Auto onderhoud', icon: '🔧', slugs: [S.AUTO_ONDERHOUD] },
  { label: 'Fiets & deelvervoer', icon: '🚲', slugs: [S.FIETS_DEELVERVOER] },
  { label: 'Uit eten & horeca', icon: '🍽️', slugs: [S.UIT_ETEN_HORECA] },
  { label: 'Vrije tijd & sport', icon: '⚽', slugs: [S.VRIJE_TIJD_SPORT] },
  { label: 'Vakantie', icon: '✈️', slugs: [S.VAKANTIE] },
  { label: 'Kleding & overige', icon: '👕', slugs: [S.KLEDING_OVERIGE] },
  { label: 'Sparen & noodbuffer', icon: '🏦', slugs: [S.SPAREN_NOODBUFFER] },
  { label: 'Investeren & FIRE', icon: '📈', slugs: [S.INVESTEREN_FIRE] },
  { label: 'Schulden & aflossingen', icon: '💳', slugs: [S.SCHULDEN_AFLOSSINGEN, S.EXTRA_AFLOSSING_HYPOTHEEK] },
]

// ── Template definities ──────────────────────────────────────

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: 'minimalistisch',
    name: 'Minimalistisch',
    subtitle: '5 categorieën',
    description: 'Zo min mogelijk categorieën, alleen de essentie. Ideaal als je overzicht wilt zonder details.',
    icon: Minus,
    categories: MINIMALISTISCH_CATEGORIES,
  },
  {
    id: 'nibud',
    name: 'Nibud-standaard',
    subtitle: '9 categorieën',
    description: 'Gebaseerd op het Nibud huishoudboekje. Breed maar herkenbaar voor Nederlandse huishoudens.',
    icon: List,
    categories: NIBUD_CATEGORIES,
  },
  {
    id: 'uitgebreid',
    name: 'Uitgebreid',
    subtitle: '16 categorieën',
    description: 'Gedetailleerde categorieën voor maximaal inzicht en controle over elke uitgave.',
    icon: ListTree,
    categories: UITGEBREID_CATEGORIES,
  },
]

// ── Allocatie-percentages per template ───────────────────────

/**
 * Verdeel een netto-maandinkomen over budget-slugs volgens een
 * percentage-mapping. Rounding-rest gaat naar de slug met de grootste
 * allocatie, zodat het totaal exact `netIncome` bedraagt.
 */
function distributeIncome(
  netIncome: number,
  alloc: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {
    [S.SALARIS_UITKERING]: netIncome,
    [S.TOESLAGEN_KINDERBIJSLAG]: 0,
    [S.TERUGGAVE_BELASTING]: 0,
    [S.OVERIGE_INKOMSTEN]: 0,
  }

  const allSlugs = [
    S.HUUR_HYPOTHEEK, S.GAS_WATER_LICHT, S.VERZEKERINGEN_WONEN, S.GEMEENTELIJKE_LASTEN,
    S.BOODSCHAPPEN, S.HUISHOUDEN_VERZORGING, S.KINDEREN_SCHOOL, S.MEDISCHE_KOSTEN,
    S.BRANDSTOF_OV, S.AUTO_VASTE_LASTEN, S.AUTO_ONDERHOUD, S.FIETS_DEELVERVOER,
    S.UIT_ETEN_HORECA, S.VRIJE_TIJD_SPORT, S.VAKANTIE, S.KLEDING_OVERIGE,
    S.SPAREN_NOODBUFFER, S.INVESTEREN_FIRE,
    S.SCHULDEN_AFLOSSINGEN, S.EXTRA_AFLOSSING_HYPOTHEEK,
  ]
  for (const slug of allSlugs) {
    result[slug] = 0
  }

  let total = 0
  let largestSlug = ''
  let largestAmount = 0
  for (const [slug, pct] of Object.entries(alloc)) {
    const amt = Math.round(netIncome * pct)
    result[slug] = amt
    total += amt
    if (amt > largestAmount) {
      largestAmount = amt
      largestSlug = slug
    }
  }

  const diff = netIncome - total
  if (diff !== 0 && largestSlug) {
    result[largestSlug] += diff
  }

  return result
}

function buildMinimalistAmounts(netIncome: number): Record<string, number> {
  return distributeIncome(netIncome, {
    [S.HUUR_HYPOTHEEK]: 0.28,
    [S.GAS_WATER_LICHT]: 0.06,
    [S.VERZEKERINGEN_WONEN]: 0.03,
    [S.GEMEENTELIJKE_LASTEN]: 0.01,
    [S.BOODSCHAPPEN]: 0.15,
    [S.BRANDSTOF_OV]: 0.07,
    [S.KLEDING_OVERIGE]: 0.15,
    [S.SPAREN_NOODBUFFER]: 0.10,
    [S.INVESTEREN_FIRE]: 0.15,
  })
}

function buildNibudAmounts(netIncome: number): Record<string, number> {
  return distributeIncome(netIncome, {
    [S.HUUR_HYPOTHEEK]: 0.24,
    [S.GAS_WATER_LICHT]: 0.05,
    [S.GEMEENTELIJKE_LASTEN]: 0.02,
    [S.VERZEKERINGEN_WONEN]: 0.05,
    [S.BOODSCHAPPEN]: 0.12,
    [S.HUISHOUDEN_VERZORGING]: 0.02,
    [S.KINDEREN_SCHOOL]: 0.02,
    [S.MEDISCHE_KOSTEN]: 0.02,
    [S.BRANDSTOF_OV]: 0.04,
    [S.AUTO_VASTE_LASTEN]: 0.04,
    [S.FIETS_DEELVERVOER]: 0.02,
    [S.KLEDING_OVERIGE]: 0.04,
    [S.UIT_ETEN_HORECA]: 0.03,
    [S.VRIJE_TIJD_SPORT]: 0.03,
    [S.VAKANTIE]: 0.04,
    [S.SPAREN_NOODBUFFER]: 0.07,
    [S.INVESTEREN_FIRE]: 0.10,
    [S.SCHULDEN_AFLOSSINGEN]: 0.03,
    [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0.02,
  })
}

function buildUitgebreidAmounts(netIncome: number): Record<string, number> {
  return distributeIncome(netIncome, {
    [S.HUUR_HYPOTHEEK]: 0.24,
    [S.GAS_WATER_LICHT]: 0.05,
    [S.VERZEKERINGEN_WONEN]: 0.04,
    [S.GEMEENTELIJKE_LASTEN]: 0.02,
    [S.BOODSCHAPPEN]: 0.12,
    [S.HUISHOUDEN_VERZORGING]: 0.02,
    [S.KINDEREN_SCHOOL]: 0.02,
    [S.MEDISCHE_KOSTEN]: 0.02,
    [S.BRANDSTOF_OV]: 0.03,
    [S.AUTO_VASTE_LASTEN]: 0.03,
    [S.AUTO_ONDERHOUD]: 0.02,
    [S.FIETS_DEELVERVOER]: 0.01,
    [S.UIT_ETEN_HORECA]: 0.04,
    [S.VRIJE_TIJD_SPORT]: 0.03,
    [S.VAKANTIE]: 0.04,
    [S.KLEDING_OVERIGE]: 0.03,
    [S.SPAREN_NOODBUFFER]: 0.06,
    [S.INVESTEREN_FIRE]: 0.12,
    [S.SCHULDEN_AFLOSSINGEN]: 0.03,
    [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0.03,
  })
}

export function buildTemplateAmounts(
  netIncome: number,
  templateId: BudgetTemplateId,
): Record<string, number> {
  switch (templateId) {
    case 'minimalistisch': return buildMinimalistAmounts(netIncome)
    case 'nibud': return buildNibudAmounts(netIncome)
    case 'uitgebreid': return buildUitgebreidAmounts(netIncome)
  }
}
