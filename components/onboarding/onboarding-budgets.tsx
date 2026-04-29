'use client'

import { useState, useEffect } from 'react'
import { Hand, LayoutTemplate, SlidersHorizontal, Minus, List, ListTree } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import { BudgetAmountEditor } from './budget-amount-editor'
import { getDefaultBudgets, BUDGET_SLUGS } from '@/lib/budget-data'

// ── New category-based template definitions ──────────────────
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
  icon: React.ComponentType<LucideProps>
  categories: TemplateCategory[]
  /** Percentage allocations keyed by slug */
  allocations: Record<string, number>
}

const S = BUDGET_SLUGS

// ── Template 1: Minimalistisch ───────────────────────────────
// Max 5-6 main categories, no subcategories. Essential only.
const MINIMALISTISCH_CATEGORIES: TemplateCategory[] = [
  { label: 'Wonen', icon: '🏠', slugs: [S.HUUR_HYPOTHEEK, S.GAS_WATER_LICHT, S.VERZEKERINGEN_WONEN, S.GEMEENTELIJKE_LASTEN] },
  { label: 'Boodschappen', icon: '🛒', slugs: [S.BOODSCHAPPEN] },
  { label: 'Vervoer', icon: '🚗', slugs: [S.BRANDSTOF_OV] },
  { label: 'Vrije besteding', icon: '🎯', slugs: [S.KLEDING_OVERIGE] },
  { label: 'Sparen', icon: '💰', slugs: [S.SPAREN_NOODBUFFER, S.INVESTEREN_FIRE] },
]

// ── Template 2: Nibud-geïnspireerd ──────────────────────────
// ~8-10 categories based on Nibud huishoudboekje indeling.
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
// All detailed categories with subcategories.
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

// ── Allocation percentages per template ─────────────────────
// These define how net income is distributed. All expense percentages add up to ~1.0.

/**
 * Build amounts for a template such that all expense+savings slugs
 * sum to exactly netIncome. Rounding remainder goes to the largest slug.
 */
function distributeIncome(netIncome: number, alloc: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {
    [S.SALARIS_UITKERING]: netIncome,
    [S.TOESLAGEN_KINDERBIJSLAG]: 0,
    [S.TERUGGAVE_BELASTING]: 0,
    [S.OVERIGE_INKOMSTEN]: 0,
  }

  // All known expense/savings slugs default to 0
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

  // Apply allocations
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

  // Fix rounding: adjust largest slug so sum === netIncome
  const diff = netIncome - total
  if (diff !== 0 && largestSlug) {
    result[largestSlug] += diff
  }

  return result
}

function buildMinimalistAmounts(netIncome: number): Record<string, number> {
  // Total: 0.28+0.06+0.03+0.01+0.15+0.07+0.15+0.10+0.15 = 1.00
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
  // Total: 0.24+0.05+0.02+0.05+0.12+0.02+0.02+0.02+0.04+0.04+0.02+0.04+0.03+0.03+0.04+0.07+0.10+0.03+0.02 = 1.00
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
  // Total: 0.24+0.05+0.04+0.02+0.12+0.02+0.02+0.02+0.03+0.03+0.02+0.01+0.04+0.03+0.04+0.03+0.06+0.12+0.03+0.03 = 1.00
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

// ── Template definitions ─────────────────────────────────────

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: 'minimalistisch',
    name: 'Minimalistisch',
    subtitle: '5 categorieën',
    description: 'Zo min mogelijk categorieën, alleen de essentie. Ideaal als je overzicht wilt zonder details.',
    icon: Minus,
    categories: MINIMALISTISCH_CATEGORIES,
    allocations: {},
  },
  {
    id: 'nibud',
    name: 'Nibud-standaard',
    subtitle: '9 categorieën',
    description: 'Gebaseerd op het Nibud huishoudboekje. Breed maar herkenbaar voor Nederlandse huishoudens.',
    icon: List,
    categories: NIBUD_CATEGORIES,
    allocations: {},
  },
  {
    id: 'uitgebreid',
    name: 'Uitgebreid',
    subtitle: '16 categorieën',
    description: 'Gedetailleerde categorieën voor maximaal inzicht en controle over elke uitgave.',
    icon: ListTree,
    categories: UITGEBREID_CATEGORIES,
    allocations: {},
  },
]

export function buildTemplateAmounts(netIncome: number, templateId: BudgetTemplateId): Record<string, number> {
  switch (templateId) {
    case 'minimalistisch': return buildMinimalistAmounts(netIncome)
    case 'nibud': return buildNibudAmounts(netIncome)
    case 'uitgebreid': return buildUitgebreidAmounts(netIncome)
  }
}

// ── Subchoice type ─────────────────────────────────────────
type SubChoice = null | 'manual' | 'template'

// ── Component ──────────────────────────────────────────────
export function OnboardingBudgets({
  amounts,
  onChange,
  netIncome,
  householdType,
  numberOfChildren,
  onNext,
  onBack,
  saving = false,
  subStep,
}: {
  amounts: Record<string, number>
  onChange: (amounts: Record<string, number>) => void
  netIncome: number
  householdType: string
  numberOfChildren: number
  onNext: () => void
  onBack: () => void
  saving?: boolean
  subStep?: { current: number; total: number }
}) {
  const [subChoice, setSubChoice] = useState<SubChoice>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<BudgetTemplateId | null>(null)

  // Initialize with defaults if empty
  const hasAmounts = Object.keys(amounts).length > 0
  useEffect(() => {
    if (hasAmounts) return
    const defaults: Record<string, number> = {}
    for (const parent of getDefaultBudgets()) {
      if (parent.children) {
        for (const child of parent.children) {
          defaults[child.slug] = child.default_limit
        }
      }
    }
    onChange(defaults)
  }, [hasAmounts, onChange])

  function handleTemplateSelect(templateId: BudgetTemplateId) {
    const income = netIncome || 2500
    const newAmounts = buildTemplateAmounts(income, templateId)
    onChange(newAmounts)
    setSelectedTemplate(templateId)
    setSubChoice('manual') // Go to manual editor so user can review/adjust
  }

  return (
    <div className="pb-20 sm:pb-0">
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors duration-150"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-8">
        <StepProgress currentPhase="instellen" subStep={subStep} />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Budgettering</p>

      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0"><WillDots size={48} /></div>
        <SpeechBubble>Een budget vertaalt je inkomen naar bewuste keuzes. Elke euro die je bespaart is opgeslagen vrijheidstijd &mdash; tijd die je later kunt besteden aan wat jij echt belangrijk vindt. Maar het is niet verplicht: jij bepaalt het tempo.</SpeechBubble>
      </div>

      {/* Budget choice: skip, template, or manual */}
      {subChoice === null && (
        <div className="space-y-4">
          <button
            onClick={onNext}
            disabled={saving}
            className="group w-full min-h-[60px] rounded-xl border-2 border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 text-left transition-all hover:border-[var(--border-md)] hover:shadow-md active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] group-hover:bg-[var(--border-ed)]">
                <Hand className="h-5 w-5 text-[var(--ink-3)]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Nee, niet nu</h3>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  Default budgetten worden op de achtergrond aangemaakt
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setSubChoice('template')}
            className="group w-full min-h-[60px] rounded-xl border-2 border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 text-left transition-all hover:border-kern-300 hover:shadow-md active:scale-[0.99] active:border-kern-400"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kern-50 group-hover:bg-kern-100">
                <LayoutTemplate className="h-5 w-5 text-kern-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Ja, met een template</h3>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  Kies een opzet die bij je past
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setSubChoice('manual')}
            className="group w-full min-h-[60px] rounded-xl border-2 border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 text-left transition-all hover:border-kern-300 hover:shadow-md active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kern-50 group-hover:bg-kern-100">
                <SlidersHorizontal className="h-5 w-5 text-kern-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Ja, handmatig</h3>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  Stel elk budget zelf in
                </p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Category-based template selection */}
      {subChoice === 'template' && (
        <div className="space-y-4">
          <p className="label-editorial mb-4 text-[var(--ink-3)]">
            Kies een budgetopzet
          </p>
          {BUDGET_TEMPLATES.map((template) => {
            const Icon = template.icon
            return (
              <button
                key={template.id}
                onClick={() => handleTemplateSelect(template.id)}
                className="group w-full rounded-xl border-2 border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left transition-all hover:border-kern-300 hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kern-50 group-hover:bg-kern-100">
                    <Icon className="h-5 w-5 text-kern-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--ink)]">{template.name}</h3>
                        <span className="rounded-full bg-[var(--subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                          {template.subtitle}
                        </span>
                      </div>
                      <svg className="ml-2 h-4 w-4 shrink-0 text-[var(--ink-4)] group-hover:text-kern-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ink-3)]">{template.description}</p>
                    {/* Category list (NO amounts shown) */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {template.categories.map((cat) => (
                        <span
                          key={cat.label}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]"
                        >
                          <span className="text-[10px]">{cat.icon}</span>
                          {cat.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
          <button
            onClick={() => setSubChoice(null)}
            className="w-full min-h-[44px] rounded-xl border border-[var(--border-md)] px-4 py-2.5 text-sm font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)] transition-colors duration-150"
          >
            Terug
          </button>
        </div>
      )}

      {/* Manual editor */}
      {subChoice === 'manual' && (
        <div className="space-y-4">
          {selectedTemplate && (
            <div className="flex items-center gap-2 rounded-lg border border-kern-200 bg-kern-50 px-3 py-2 text-[11px] text-kern-700">
              <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-kern-500" />
              <span>Template: <strong>{BUDGET_TEMPLATES.find((t) => t.id === selectedTemplate)?.name}</strong> — Pas de bedragen aan naar jouw situatie</span>
            </div>
          )}
          <BudgetAmountEditor
            amounts={amounts}
            onChange={onChange}
            netIncome={netIncome}
          />

          {/* Sticky nav on mobile */}
          <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
            <button
              onClick={() => setSubChoice(null)}
              className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-ed)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)] transition-colors duration-150"
            >
              Terug
            </button>
            <button
              onClick={onNext}
              disabled={saving}
              className="flex-1 min-h-[44px] rounded-xl bg-kern-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-kern-700 active:bg-kern-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Opslaan & verder'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
