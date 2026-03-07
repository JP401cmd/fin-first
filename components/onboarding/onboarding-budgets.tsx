'use client'

import { useState, useEffect, useMemo } from 'react'
import { User, Users, Briefcase, Sunset, Hand, LayoutTemplate, SlidersHorizontal, Coins, PiggyBank, Flame } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { FinnAvatar } from '@/components/app/avatars'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import { BudgetAmountEditor } from './budget-amount-editor'
import { getDefaultBudgets, BUDGET_SLUGS } from '@/lib/budget-data'
import { formatCurrency } from '@/lib/format'

// ── Profile-based template definitions ──────────────────────
type ProfileTemplateId = 'zuinig' | 'gebalanceerd' | 'fire'

interface CategoryBreakdown {
  label: string
  pct: number
  amount: number
}

interface ProfileTemplate {
  id: ProfileTemplateId
  name: string
  description: string
  icon: React.ComponentType<LucideProps>
  // Percentage allocations for main expense groups
  vaste: number   // Vaste lasten (wonen + vervoer)
  dagelijks: number // Dagelijkse uitgaven
  leuk: number    // Leuke dingen & lifestyle
  sparen: number  // Sparen & investeren
}

const PROFILE_TEMPLATES: Omit<ProfileTemplate, 'icon'>[] = [
  { id: 'zuinig', name: 'Zuinig', description: 'Focus op lage kosten, bewust leven', vaste: 0.55, dagelijks: 0.20, leuk: 0.10, sparen: 0.15 },
  { id: 'gebalanceerd', name: 'Gebalanceerd', description: 'Evenwicht tussen genieten en sparen', vaste: 0.45, dagelijks: 0.20, leuk: 0.15, sparen: 0.20 },
  { id: 'fire', name: 'Vrijheidsgericht', description: 'Maximaal sparen voor financiële vrijheid', vaste: 0.40, dagelijks: 0.15, leuk: 0.10, sparen: 0.35 },
]

const TEMPLATE_ICONS: Record<ProfileTemplateId, React.ComponentType<LucideProps>> = {
  zuinig: Coins,
  gebalanceerd: PiggyBank,
  fire: Flame,
}

function buildProfileAmounts(netIncome: number, template: Omit<ProfileTemplate, 'icon'>): Record<string, number> {
  const S = BUDGET_SLUGS
  const r = (pct: number) => Math.round(netIncome * pct)

  // Vaste lasten: split into wonen (80%) and vervoer (20%)
  const vasteTotal = r(template.vaste)
  const wonenTotal = Math.round(vasteTotal * 0.80)
  const vervoerTotal = Math.round(vasteTotal * 0.20)

  // Dagelijkse uitgaven
  const dagelijksTotal = r(template.dagelijks)

  // Leuke dingen
  const leukTotal = r(template.leuk)

  // Sparen
  const sparenTotal = r(template.sparen)

  return {
    // Inkomen
    [S.SALARIS_UITKERING]: netIncome,
    [S.TOESLAGEN_KINDERBIJSLAG]: 0,
    [S.TERUGGAVE_BELASTING]: 0,
    [S.OVERIGE_INKOMSTEN]: 0,
    // Vaste lasten wonen
    [S.HUUR_HYPOTHEEK]: Math.round(wonenTotal * 0.65),
    [S.GAS_WATER_LICHT]: Math.round(wonenTotal * 0.18),
    [S.VERZEKERINGEN_WONEN]: Math.round(wonenTotal * 0.12),
    [S.GEMEENTELIJKE_LASTEN]: Math.round(wonenTotal * 0.05),
    // Vervoer
    [S.BRANDSTOF_OV]: Math.round(vervoerTotal * 0.40),
    [S.AUTO_VASTE_LASTEN]: Math.round(vervoerTotal * 0.35),
    [S.AUTO_ONDERHOUD]: Math.round(vervoerTotal * 0.15),
    [S.FIETS_DEELVERVOER]: Math.round(vervoerTotal * 0.10),
    // Dagelijkse uitgaven
    [S.BOODSCHAPPEN]: Math.round(dagelijksTotal * 0.70),
    [S.HUISHOUDEN_VERZORGING]: Math.round(dagelijksTotal * 0.12),
    [S.KINDEREN_SCHOOL]: Math.round(dagelijksTotal * 0.10),
    [S.MEDISCHE_KOSTEN]: Math.round(dagelijksTotal * 0.08),
    // Leuke dingen
    [S.UIT_ETEN_HORECA]: Math.round(leukTotal * 0.30),
    [S.VRIJE_TIJD_SPORT]: Math.round(leukTotal * 0.25),
    [S.VAKANTIE]: Math.round(leukTotal * 0.25),
    [S.KLEDING_OVERIGE]: Math.round(leukTotal * 0.20),
    // Sparen
    [S.SPAREN_NOODBUFFER]: Math.round(sparenTotal * 0.35),
    [S.INVESTEREN_FIRE]: Math.round(sparenTotal * 0.65),
    // Schulden (default 0)
    [S.SCHULDEN_AFLOSSINGEN]: 0,
    [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0,
  }
}

function getBreakdown(netIncome: number, template: Omit<ProfileTemplate, 'icon'>): CategoryBreakdown[] {
  return [
    { label: 'Vaste lasten', pct: template.vaste, amount: Math.round(netIncome * template.vaste) },
    { label: 'Dagelijks', pct: template.dagelijks, amount: Math.round(netIncome * template.dagelijks) },
    { label: 'Leuk', pct: template.leuk, amount: Math.round(netIncome * template.leuk) },
    { label: 'Sparen', pct: template.sparen, amount: Math.round(netIncome * template.sparen) },
  ]
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
}: {
  amounts: Record<string, number>
  onChange: (amounts: Record<string, number>) => void
  netIncome: number
  householdType: string
  numberOfChildren: number
  onNext: () => void
  onBack: () => void
  saving?: boolean // kept for backwards compat but no longer used from preferences flow
}) {
  const [subChoice, setSubChoice] = useState<SubChoice>(null)
  const [selectedProfileTemplate, setSelectedProfileTemplate] = useState<ProfileTemplateId | null>(null)

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

  // Compute breakdowns for all profile templates
  const profileBreakdowns = useMemo(() => {
    const income = netIncome || 2500 // Fallback if no income set
    return PROFILE_TEMPLATES.map((t) => ({
      ...t,
      breakdown: getBreakdown(income, t),
    }))
  }, [netIncome])

  function handleProfileTemplateSelect(templateId: ProfileTemplateId) {
    const template = PROFILE_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    const income = netIncome || 2500
    const newAmounts = buildProfileAmounts(income, template)
    onChange(newAmounts)
    setSelectedProfileTemplate(templateId)
    setSubChoice('manual') // Go to manual editor so user can review/adjust
  }

  return (
    <div className="pb-20 sm:pb-0">
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-6">
        <StepProgress current="budgetten" />
      </div>

      <div className="mb-6 flex items-start gap-3">
        <div className="shrink-0"><FinnAvatar size={48} /></div>
        <SpeechBubble>Een budget vertaalt je inkomen naar bewuste keuzes. Elke euro die je bespaart is opgeslagen vrijheidstijd &mdash; tijd die je later kunt besteden aan wat jij écht belangrijk vindt. Maar het is niet verplicht: jij bepaalt het tempo.</SpeechBubble>
      </div>

      {/* Budget choice: skip, template, or manual */}
      {subChoice === null && (
        <div className="space-y-3">
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
                  Kies een profiel dat bij je past
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

      {/* Profile-based template selection */}
      {subChoice === 'template' && (
        <div className="space-y-3">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Kies een budgetprofiel
          </p>
          {profileBreakdowns.map((template) => {
            const Icon = TEMPLATE_ICONS[template.id]
            return (
              <button
                key={template.id}
                onClick={() => handleProfileTemplateSelect(template.id)}
                className="group w-full rounded-xl border-2 border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left transition-all hover:border-kern-300 hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kern-50 group-hover:bg-kern-100">
                    <Icon className="h-5 w-5 text-kern-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[var(--ink)]">{template.name}</h3>
                      <svg className="ml-2 h-4 w-4 shrink-0 text-[var(--ink-4)] group-hover:text-kern-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ink-3)]">{template.description}</p>
                    {/* Category breakdown */}
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {template.breakdown.map((cat) => (
                        <div key={cat.label} className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--ink-3)]">{cat.label}</span>
                          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
                            {formatCurrency(cat.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Percentage bar */}
                    <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full">
                      {template.breakdown.map((cat, i) => {
                        const colors = ['bg-amber-400', 'bg-teal-400', 'bg-purple-400', 'bg-emerald-500']
                        return (
                          <div
                            key={cat.label}
                            className={`${colors[i]} transition-all`}
                            style={{ width: `${cat.pct * 100}%` }}
                          />
                        )
                      })}
                    </div>
                    <div className="mt-1 flex gap-3">
                      {template.breakdown.map((cat, i) => {
                        const colors = ['text-amber-600', 'text-teal-600', 'text-purple-600', 'text-emerald-600']
                        return (
                          <span key={cat.label} className={`text-[9px] font-medium ${colors[i]}`}>
                            {cat.label} {Math.round(cat.pct * 100)}%
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
          <button
            onClick={() => setSubChoice(null)}
            className="w-full min-h-[44px] rounded-lg border border-[var(--border-md)] px-4 py-2.5 text-sm font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)]"
          >
            Terug
          </button>
        </div>
      )}

      {/* Manual editor */}
      {subChoice === 'manual' && (
        <div className="space-y-4">
          {selectedProfileTemplate && (
            <div className="flex items-center gap-2 rounded-lg border border-kern-200 bg-kern-50 px-3 py-2 text-[11px] text-kern-700">
              <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-kern-500" />
              <span>Template: <strong>{PROFILE_TEMPLATES.find((t) => t.id === selectedProfileTemplate)?.name}</strong> — Pas de bedragen aan naar jouw situatie</span>
            </div>
          )}
          <BudgetAmountEditor
            amounts={amounts}
            onChange={onChange}
            netIncome={netIncome}
          />

          {/* Sticky nav on mobile */}
          <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/80 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
            <button
              onClick={() => setSubChoice(null)}
              className="flex-1 min-h-[44px] rounded-lg border border-[var(--border-ed)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)]"
            >
              Terug
            </button>
            <button
              onClick={onNext}
              disabled={saving}
              className="flex-1 min-h-[44px] rounded-lg bg-kern-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-kern-700 active:bg-kern-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Opslaan & verder'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
