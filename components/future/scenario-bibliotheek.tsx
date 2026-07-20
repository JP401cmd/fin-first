'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Baby,
  Home,
  Briefcase,
  Clock,
  HeartHandshake,
  Gift,
  Truck,
  Plane,
  Plus,
  X,
  Hammer,
  Car,
  GraduationCap,
  Landmark,
  TrendingDown,
  Heart,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * ScenarioBibliotheek — plan F-3 (Tier-3 #19): vooraf gemodelleerde
 * levensgebeurtenissen die met één klik toegevoegd kunnen worden aan
 * de tijdas met realistische NL-defaults.
 *
 * Plan-citaat: "Eén klik om toe te voegen aan tijdas met realistische
 * defaults. Documentatie van aannames." — defaults staan inline in de
 * template-definities zodat ze auditbaar zijn.
 *
 * Flow:
 *  1. User klikt op "Snel toevoegen" button → opent dialog
 *  2. Dialog toont 8 template-cards (kind, huis, ZZP, deeltijd, etc.)
 *  3. Klik op template → mini-prompt voor "over hoeveel jaar?"
 *  4. Insert via supabase client → router.refresh() → event verschijnt
 *     in GebeurtenissenView + op tijdas
 *  5. User kan via bestaande horizon-flow het event verder verfijnen
 *
 * Niet-destructief: bestaande horizon-client behoudt zijn eigen form-
 * flow voor handmatige events. Deze bibliotheek is een snelkoppeling.
 */

type ScenarioTemplate = {
  key: string
  label: string
  description: string
  Icon: LucideIcon
  /** Default jaren vanaf nu (gebruiker kan aanpassen in dialog). */
  defaultYearsFromNow: number
  /** Defaults voor de life_event-insert. */
  defaults: {
    event_type: string
    icon: string
    /** Eenmalige kosten (positief) of opbrengst (negatief), in EUR. */
    one_time_cost: number
    /** Maandelijkse kosten-delta, in EUR (positief = meer kosten). */
    monthly_cost_change: number
    /** Maandelijkse inkomens-delta, in EUR (positief = meer inkomen). */
    monthly_income_change: number
    /** Duur van de maandelijkse delta, in maanden (0 = eenmalig). */
    duration_months: number
    is_indexed: boolean
  }
}

const TEMPLATES: ScenarioTemplate[] = [
  {
    key: 'tweede-kind',
    label: 'Tweede kind',
    description: 'Eenmalige startkosten + maandelijkse extra uitgaven gedurende ~18 jaar.',
    Icon: Baby,
    defaultYearsFromNow: 2,
    defaults: {
      event_type: 'child',
      icon: 'child',
      one_time_cost: 5000,
      monthly_cost_change: 350,
      monthly_income_change: 0,
      duration_months: 216, // 18 jaar
      is_indexed: true,
    },
  },
  {
    key: 'huis-kopen',
    label: 'Huis kopen',
    description: 'Aanschafkosten (overdrachtsbelasting + notaris + verbouwing).',
    Icon: Home,
    defaultYearsFromNow: 5,
    defaults: {
      event_type: 'housing_purchase',
      icon: 'home',
      one_time_cost: 30000,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      is_indexed: true,
    },
  },
  {
    key: 'zzp-start',
    label: 'ZZP starten',
    description: 'Eerste jaar onzeker — voorzichtige inkomensdip ingerekend.',
    Icon: Briefcase,
    defaultYearsFromNow: 1,
    defaults: {
      event_type: 'career_change',
      icon: 'briefcase',
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: -500,
      duration_months: 12,
      is_indexed: false,
    },
  },
  {
    key: 'deeltijd-4d',
    label: 'Deeltijd 4 dagen',
    description: '20% inkomensdaling (4/5 dagen) — vaak permanent voor zorg-balans.',
    Icon: Clock,
    defaultYearsFromNow: 3,
    defaults: {
      event_type: 'career_change',
      icon: 'clock',
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: -700,
      duration_months: 0, // 0 = permanent voor unified projection
      is_indexed: true,
    },
  },
  {
    key: 'erfenis',
    label: 'Erfenis',
    description: 'Eenmalige opbrengst — bedrag aanpasbaar na toevoegen.',
    Icon: HeartHandshake,
    defaultYearsFromNow: 15,
    defaults: {
      event_type: 'inheritance',
      icon: 'heart',
      one_time_cost: -50000,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      is_indexed: true,
    },
  },
  {
    key: 'schenking',
    label: 'Schenking',
    description: 'Eenmalige gift van ouders — vaak rond aankoop huis.',
    Icon: Gift,
    defaultYearsFromNow: 2,
    defaults: {
      event_type: 'inheritance',
      icon: 'gift',
      one_time_cost: -10000,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      is_indexed: true,
    },
  },
  {
    key: 'verhuizing',
    label: 'Verhuizing',
    description: 'Verhuiskosten + nieuwe inrichting.',
    Icon: Truck,
    defaultYearsFromNow: 4,
    defaults: {
      event_type: 'misc',
      icon: 'truck',
      one_time_cost: 15000,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      is_indexed: true,
    },
  },
  {
    key: 'wereldreis',
    label: 'Wereldreis',
    description: 'Eenmalige reiskosten + 6 mnd geen inkomen.',
    Icon: Plane,
    defaultYearsFromNow: 3,
    defaults: {
      event_type: 'world_trip',
      icon: 'plane',
      one_time_cost: 15000,
      monthly_cost_change: 0,
      monthly_income_change: -3000,
      duration_months: 6,
      is_indexed: true,
    },
  },
  {
    key: 'verbouwing',
    label: 'Verbouwing',
    description: 'Keuken, badkamer, dakkapel of uitbouw — eenmalig.',
    Icon: Hammer,
    defaultYearsFromNow: 3,
    defaults: {
      event_type: 'renovation',
      icon: 'hammer',
      one_time_cost: 40000,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      is_indexed: true,
    },
  },
  {
    key: 'studie',
    label: 'Studie of opleiding',
    description: 'Eenmalige collegegeld + tijdelijk minder werken.',
    Icon: GraduationCap,
    defaultYearsFromNow: 2,
    defaults: {
      event_type: 'study',
      icon: 'graduation',
      one_time_cost: 8000,
      monthly_cost_change: 0,
      monthly_income_change: -500,
      duration_months: 24,
      is_indexed: false,
    },
  },
  {
    key: 'auto-kopen',
    label: 'Auto kopen',
    description: 'Eenmalige aanschaf + maandelijkse onderhoudslasten.',
    Icon: Car,
    defaultYearsFromNow: 2,
    defaults: {
      event_type: 'car_purchase',
      icon: 'car',
      one_time_cost: 25000,
      monthly_cost_change: 200,
      monthly_income_change: 0,
      duration_months: 0,
      is_indexed: true,
    },
  },
  {
    key: 'huis-verkopen',
    label: 'Huis verkopen',
    description: 'Eenmalige opbrengst (na hypotheek-aflossing).',
    Icon: Home,
    defaultYearsFromNow: 10,
    defaults: {
      event_type: 'house_sale',
      icon: 'home',
      one_time_cost: -100000,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      is_indexed: true,
    },
  },
  {
    key: 'vroeg-pensioen',
    label: 'Eerder met pensioen',
    description: 'Stoppen met werken vóór AOW-leeftijd.',
    Icon: Heart,
    defaultYearsFromNow: 15,
    defaults: {
      event_type: 'early_retirement',
      icon: 'heart',
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: -3000,
      duration_months: 0,
      is_indexed: true,
    },
  },
  {
    key: 'aow-start',
    label: 'AOW start',
    description: 'Maandelijkse AOW-uitkering vanaf AOW-leeftijd.',
    Icon: Landmark,
    defaultYearsFromNow: 25,
    defaults: {
      event_type: 'aow',
      icon: 'landmark',
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: 1500,
      duration_months: 0,
      is_indexed: true,
    },
  },
  {
    key: 'werkloosheid',
    label: 'Werkloosheid',
    description: 'Tijdelijk minder inkomen — voorbereiden op buffer-test.',
    Icon: TrendingDown,
    defaultYearsFromNow: 1,
    defaults: {
      event_type: 'werkloosheid',
      icon: 'trending-down',
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: -1500,
      duration_months: 6,
      is_indexed: false,
    },
  },
  {
    key: 'sabbatical',
    label: 'Sabbatical',
    description: '12 maanden geen inkomen — voor reizen of studeren.',
    Icon: Plane,
    defaultYearsFromNow: 6,
    defaults: {
      event_type: 'career_change',
      icon: 'plane',
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: -3000,
      duration_months: 12,
      is_indexed: false,
    },
  },
]

export function ScenarioBibliotheek({ currentAge }: { currentAge: number | null }) {
  const [open, setOpen] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function addScenario(template: ScenarioTemplate) {
    if (currentAge == null) {
      setError('Geboortejaar ontbreekt — vul je profiel aan om scenario toe te voegen.')
      return
    }
    setSavingKey(template.key)
    setError(null)
    try {
      const supabase = createClient()
      const targetAge = Math.round(currentAge + template.defaultYearsFromNow)
      const { error: insertError } = await supabase.from('life_events').insert({
        name: template.label,
        event_type: template.defaults.event_type,
        target_age: targetAge,
        target_date: null,
        one_time_cost: template.defaults.one_time_cost,
        monthly_cost_change: template.defaults.monthly_cost_change,
        monthly_income_change: template.defaults.monthly_income_change,
        duration_months: template.defaults.duration_months,
        icon: template.defaults.icon,
        is_active: true,
        is_indexed: template.defaults.is_indexed,
        sort_order: 999,
      })
      if (insertError) {
        setError(`Opslaan mislukt: ${insertError.message}`)
        setSavingKey(null)
        return
      }
      setOpen(false)
      setSavingKey(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout')
      setSavingKey(null)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        Levensgebeurtenis toevoegen
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Scenario-bibliotheek"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4 pb-[calc(1rem+var(--safe-area-bottom,0px))]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                  Toevoegen aan tijdas
                </div>
                <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
                  Levensgebeurtenis toevoegen
                </h2>
                <p className="text-xs text-[var(--ink-3)] mt-1">
                  Kies een gebeurtenis hieronder — of laat Fin een
                  passend scenario voor je opstellen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Sluiten"
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </header>

            {/* Fin-route: gepersonaliseerde levensgebeurtenis via AI-chat */}
            <Link
              href="/toekomst/whatif"
              onClick={() => setOpen(false)}
              className="mb-4 flex items-center gap-3 rounded-xl border border-horizon-300 bg-horizon-50/60 px-4 py-3 hover:border-horizon-500 hover:bg-horizon-50 transition-colors"
            >
              <span className="inline-flex w-9 h-9 shrink-0 rounded-lg bg-horizon-100 items-center justify-center">
                <Sparkles className="w-4 h-4 text-horizon-700" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Vraag het Fin
                </p>
                <p className="text-[11px] text-[var(--ink-3)] leading-snug">
                  Beschrijf je situatie — Fin stelt een passende gebeurtenis voor met realistische bedragen.
                </p>
              </div>
            </Link>

            {error && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto">
              {TEMPLATES.map((template) => {
                const Icon = template.Icon
                const saving = savingKey === template.key
                return (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => addScenario(template)}
                    disabled={saving || savingKey !== null}
                    className="flex flex-col items-start text-left rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-[var(--ink-3)] hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-wait"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[var(--subtle)] flex items-center justify-center mb-2">
                      <Icon className="w-4 h-4 text-[var(--ink-2)]" aria-hidden="true" />
                    </span>
                    <h3 className="text-sm font-semibold text-[var(--ink)] mb-1">
                      {template.label}
                    </h3>
                    <p className="text-[11px] text-[var(--ink-3)] leading-snug flex-1">
                      {template.description}
                    </p>
                    <span className="mt-2 text-[10px] font-mono text-[var(--ink-4)]">
                      Default: over {template.defaultYearsFromNow}j
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="mt-4 text-[11px] italic text-[var(--ink-3)]">
              Toegevoegde scenario&apos;s krijgen `target_age = huidige leeftijd
              + default-jaren`. Pas datum, bedragen of duur aan via /toekomst
              voor jouw situatie.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

/** Exporteer TEMPLATES voor unit-tests die de defaults willen verifiëren. */
export { TEMPLATES as _SCENARIO_TEMPLATES }
