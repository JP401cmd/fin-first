'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  ChevronRight,
  User,
  Users,
  Briefcase,
  Sunset,
  Trash2,
  CalendarCheck,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from '@/lib/test-personas'
import { PersonaCard } from '@/components/app/persona-card'
import { useMobilePreview, DEVICE_PRESETS } from '@/components/app/beheer/mobile-preview-provider'
import { BUDGET_TEMPLATES, type BudgetTemplate } from '@/lib/budget-templates'
import { createClient } from '@/lib/supabase/client'
import { BottomSheet } from '@/components/app/bottom-sheet'

const TEMPLATE_ICONS: Record<string, LucideIcon> = { User, Users, Briefcase, Sunset }

const TABLE_LABELS: Record<string, string> = {
  profiles: 'Profiel',
  bank_accounts: 'Bankrekeningen',
  assets: 'Bezittingen',
  debts: 'Schulden',
  budgets: 'Budgetten',
  transactions: 'Transacties',
  goals: 'Doelen',
  life_events: 'Levensgebeurtenissen',
  recommendations: 'Aanbevelingen',
  actions: 'Acties',
  net_worth_snapshots: 'Vermogenssnapshots',
}

interface SeedStep {
  step: string
  progress: number
  table: string
  action: 'delete' | 'insert' | 'update'
  count?: number
}

interface SeedSummary {
  done: true
  summary: Record<string, number>
}

type SeedEvent = SeedStep | SeedSummary | { error: string }

export default function BeheerTestdataPage() {
  const router = useRouter()
  const mobilePreview = useMobilePreview()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Seed state
  const [seeding, setSeeding] = useState(false)
  const [seedProgress, setSeedProgress] = useState(0)
  const [seedStep, setSeedStep] = useState('')
  const [seedSteps, setSeedSteps] = useState<SeedStep[]>([])
  const [seedSummary, setSeedSummary] = useState<Record<string, number> | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [confirmPersona, setConfirmPersona] = useState<PersonaKey | null>(null)
  const [showOnboardingConfirm, setShowOnboardingConfirm] = useState(false)
  const [resettingOnboarding, setResettingOnboarding] = useState(false)

  // Budget template state
  const [detailTemplate, setDetailTemplate] = useState<BudgetTemplate | null>(null)
  const [confirmTemplate, setConfirmTemplate] = useState<BudgetTemplate | null>(null)
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [templateResult, setTemplateResult] = useState<{ name: string; inserted: number } | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)

  async function handleApplyTemplate(template: BudgetTemplate) {
    setConfirmTemplate(null)
    setApplyingTemplate(true)
    setTemplateResult(null)
    setTemplateError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Niet ingelogd')

      // 1. Get all existing budget IDs for this user
      const { data: existingBudgets } = await supabase
        .from('budgets')
        .select('id, parent_id')

      const allIds = (existingBudgets ?? []).map((b) => b.id)
      const childIds = (existingBudgets ?? []).filter((b) => b.parent_id).map((b) => b.id)
      const parentIds = (existingBudgets ?? []).filter((b) => !b.parent_id).map((b) => b.id)

      if (allIds.length > 0) {
        // 2. Nullify budget_id on transactions and splits
        await supabase.from('transactions').update({ budget_id: null }).in('budget_id', allIds)
        await supabase.from('transaction_splits').update({ budget_id: null }).in('budget_id', allIds)

        // 3. Delete dependent budget records
        await supabase.from('budget_rollovers').delete().in('budget_id', allIds)
        await supabase.from('budget_amounts').delete().in('budget_id', allIds)

        // 4. Delete child budgets first, then parents
        if (childIds.length > 0) {
          await supabase.from('budgets').delete().in('id', childIds)
        }
        if (parentIds.length > 0) {
          await supabase.from('budgets').delete().in('id', parentIds)
        }
      }

      // 5. Insert template budgets.
      // Plain `insert` — géén `upsert(onConflict)`: de unieke index op budgets is
      // een EXPRESSIE-index (user_id, slug, COALESCE(parent_id, '000…')) en die is
      // via PostgREST's kolom-only `on_conflict` principieel niet te targeten (42P10).
      // Stap 1-4 hierboven ruimen eerst op, dus er valt niets te "upserten".
      // Zelfde patroon als lib/seed-persona.ts:822-827.
      //
      // NB: de select op stap 1 filtert niet op `user_id` en leunt dus op RLS —
      // die levert eigen én gedeelde huishoudbudgetten. De opruiming is daarmee
      // niet strikt eigen-scoped (pre-existent, hier niet gewijzigd).
      const budgets = template.getBudgets()
      let insertedCount = 0
      const failures: string[] = []

      for (const parent of budgets) {
        const { data: parentRow, error: parentError } = await supabase
          .from('budgets')
          .insert({
            user_id: user.id,
            name: parent.name,
            slug: parent.slug,
            icon: parent.icon,
            description: parent.description,
            default_limit: parent.default_limit,
            budget_type: parent.budget_type,
            is_essential: parent.is_essential,
            priority_score: parent.priority_score,
            sort_order: parent.sort_order,
          })
          .select('id')
          .single()

        // Stil overslaan mag niet meer: vóór de fix faalde deze insert altijd
        // (42P10), dus was "0 ingevoegd" het enige signaal. Nu het pad werkt is
        // een gedeeltelijke mislukking anders niet van succes te onderscheiden.
        if (parentError || !parentRow) {
          failures.push(`${parent.slug}: ${parentError?.message ?? 'geen rij teruggekregen'}`)
          continue
        }
        insertedCount++

        if (parent.children && parent.children.length > 0) {
          const childRows = parent.children.map((child, idx) => ({
            user_id: user.id,
            parent_id: parentRow.id,
            name: child.name,
            slug: child.slug,
            icon: child.icon,
            description: child.description,
            default_limit: child.default_limit,
            budget_type: parent.budget_type,
            sort_order: idx,
          }))
          const { data: inserted, error: childError } = await supabase
            .from('budgets')
            .insert(childRows)
            .select('id')
          if (childError) failures.push(`${parent.slug} (subbudgetten): ${childError.message}`)
          insertedCount += inserted?.length ?? 0
        }
      }

      setTemplateResult({ name: template.name, inserted: insertedCount })
      if (failures.length > 0) {
        setTemplateError(`${failures.length} budget(ten) niet aangemaakt — ${failures.join('; ')}`)
      }
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setApplyingTemplate(false)
    }
  }

  async function handleSeed(personaKey: PersonaKey) {
    setConfirmPersona(null)
    setSeeding(true)
    setSeedProgress(0)
    setSeedStep('Starten...')
    setSeedSteps([])
    setSeedSummary(null)
    setSeedError(null)

    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: personaKey }),
      })

      if (!res.ok || !res.body) {
        throw new Error('Seed request mislukt')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          const event: SeedEvent = JSON.parse(line)

          if ('error' in event) {
            setSeedError(event.error)
            setSeeding(false)
            return
          }

          if ('done' in event && event.done) {
            setSeedSummary(event.summary)
            setSeedProgress(100)
            setSeedStep('Klaar!')
            setSeeding(false)
            return
          }

          if ('step' in event && 'progress' in event) {
            // Vangnet tegen een eventuele backend-drift: de balk toont nooit >100%.
            setSeedProgress(Math.min(100, event.progress))
            setSeedStep(event.step)
            setSeedSteps((prev) => [...prev, event as SeedStep])
          }
        }
      }
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Testdata Personas */}
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[var(--ink)]">Testdata laden</h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Selecteer een persona om de applicatie te vullen met testdata. Dit wist alle huidige data.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PERSONA_KEYS.map((key) => {
            const meta = PERSONAS[key].meta
            return (
              <PersonaCard
                key={key}
                meta={meta}
                showCta
                onSelect={() => setConfirmPersona(key)}
                disabled={seeding}
              />
            )
          })}
        </div>

        {/* Confirmation dialog */}
        {confirmPersona && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--scrim)]">
            <div className="mx-4 w-full max-w-md rounded-xl bg-[var(--paper)] p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-[var(--ink)]">Bevestiging</h3>
              <p className="mt-2 text-sm text-[var(--ink-2)]">
                Dit wist <span className="font-semibold text-red-600">AL</span> je huidige financiele data en vervangt het met de gegevens van{' '}
                <span className="font-semibold">{PERSONAS[confirmPersona].meta.name}</span>. Doorgaan?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setConfirmPersona(null)}
                  className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
                >
                  Annuleren
                </button>
                <button
                  onClick={() => handleSeed(confirmPersona)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                >
                  Bevestigen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {(seeding || seedSummary || seedError) && (
          <div className="mt-6 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--ink-2)]">
                {seeding ? 'Bezig met laden...' : seedError ? 'Fout opgetreden' : 'Voltooid'}
              </span>
              <span className="text-sm text-[var(--ink-3)]">{seedProgress}%</span>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  seedError ? 'bg-red-500' : seedProgress === 100 ? 'bg-green-500' : 'bg-amber-500'
                }`}
                style={{ width: `${seedProgress}%` }}
              />
            </div>

            <p className="mt-2 text-sm text-[var(--ink-3)]">{seedStep}</p>

            {seedError && (
              <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
                {seedError}
              </div>
            )}

            {seedSummary && (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-semibold text-[var(--ink-2)]">Samenvatting</h4>
                <div className="overflow-hidden rounded-lg border border-[var(--border-ed)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--subtle)]">
                        <th className="px-3 py-2 text-left font-medium text-[var(--ink-2)]">Tabel</th>
                        <th className="px-3 py-2 text-left font-medium text-[var(--ink-2)]">Actie</th>
                        <th className="px-3 py-2 text-right font-medium text-[var(--ink-2)]">Records</th>
                        <th className="px-3 py-2 text-center font-medium text-[var(--ink-2)]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {seedSteps
                        .filter((s) => s.action === 'insert' || s.action === 'update')
                        .map((s, i) => (
                        <tr key={i} className="hover:bg-[var(--subtle)]">
                          <td className="px-3 py-1.5 text-[var(--ink-2)] font-mono text-xs">{TABLE_LABELS[s.table] ?? s.table}</td>
                          <td className="px-3 py-1.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              s.action === 'insert' ? 'bg-green-50 text-green-700' :
                              'bg-blue-50 text-blue-700'
                            }`}>
                              {s.action === 'insert' ? 'Gevuld' : 'Bijgewerkt'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-[var(--ink-2)] font-mono text-xs">
                            {s.count ?? '-'}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <svg className="inline h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--ink-3)]">
                  {Object.entries(seedSummary).map(([key, count]) => (
                    <span key={key}>
                      <span className="font-medium text-[var(--ink-2)]">{TABLE_LABELS[key] ?? key}:</span> {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Test users management */}
      <TestUserManager />

      {/* Budget templates */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">Beheer — Testdata</p>
          <h3 className="mt-0.5 text-lg font-semibold text-[var(--ink)]">Budget templates laden</h3>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Vervang alle bestaande budgetten met een preset. Transacties worden ontkoppeld maar <em>niet</em> verwijderd.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BUDGET_TEMPLATES.map((template) => {
            const Icon = TEMPLATE_ICONS[template.icon] ?? User
            return (
              <button
                key={template.id}
                type="button"
                disabled={applyingTemplate || seeding}
                onClick={() => { setTemplateResult(null); setTemplateError(null); setDetailTemplate(template) }}
                className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left transition-all hover:border-kern-300 hover:shadow-[var(--s1)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-[var(--r-lg)] bg-kern-600" />
                <div className="mb-3 mt-1 flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-50">
                  <Icon className="h-4 w-4 text-kern-700" strokeWidth={1.5} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Template</p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{template.name}</p>
                <p className="mt-1 text-[11px] leading-snug text-[var(--ink-3)]">{template.description}</p>
                <div className="mt-3 flex items-center gap-0.5 text-[10px] font-semibold text-kern-700">
                  <span>Bekijk</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </button>
            )
          })}
        </div>

        {applyingTemplate && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--ink-3)]">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-kern-600" />
            <span>Template laden...</span>
          </div>
        )}

        {templateResult && (
          <div className="mt-4 flex items-center gap-2 rounded-[var(--r)] border border-kern-200 bg-kern-50 px-4 py-3 text-sm text-kern-700">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-kern-600" />
            <span>
              Template <strong>{templateResult.name}</strong> geladen — {templateResult.inserted} budgetten aangemaakt.
            </span>
          </div>
        )}

        {templateError && (
          <div className="mt-4 rounded-[var(--r)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {templateError}
          </div>
        )}
      </div>

      {/* Template detail BottomSheet */}
      {detailTemplate && (
        <BottomSheet
          open={!!detailTemplate}
          onClose={() => setDetailTemplate(null)}
          title={detailTemplate.name}
        >
          <div className="px-5 pb-6 pt-2">
            <p className="mb-4 text-sm text-[var(--ink-3)]">{detailTemplate.description}</p>

            {/* Kassabon-stijl budget overzicht */}
            <div className="mb-5 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 font-mono text-sm">
              <div className="border-b border-dashed border-[var(--border-ed)] px-4 pb-3 pt-4 text-center">
                <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Budget overzicht</p>
                <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">Categorieën &amp; maandlimieten</p>
              </div>

              <div className="px-4 py-3">
                {(() => {
                  const budgets = detailTemplate.getBudgets()
                  const income = budgets.filter((b) => b.budget_type === 'income')
                  const expense = budgets.filter((b) => b.budget_type === 'expense')
                  const savings = budgets.filter((b) => b.budget_type === 'savings')
                  const debt = budgets.filter((b) => b.budget_type === 'debt')
                  const totalIncome = income.reduce((s, b) => s + b.default_limit, 0)
                  const totalExpense = expense.reduce((s, b) => s + b.default_limit, 0)
                  const totalSavings = savings.reduce((s, b) => s + b.default_limit, 0)
                  const totalDebt = debt.reduce((s, b) => s + b.default_limit, 0)

                  const renderGroup = (items: typeof budgets, label: string) =>
                    items.length > 0 ? (
                      <div key={label} className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                        <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">{label}</p>
                        {items.map((b) => (
                          <div key={b.slug} className="flex justify-between py-0.5">
                            <span className="font-sans text-sm text-[var(--ink-2)]">
                              {b.name}
                              {b.children && b.children.length > 0 && (
                                <span className="ml-1 text-[10px] text-[var(--ink-4)]">({b.children.length} sub)</span>
                              )}
                            </span>
                            <span className="tabular-nums text-[var(--ink)]">
                              {b.default_limit > 0 ? `€\u00a0${b.default_limit.toLocaleString('nl-NL')}` : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null

                  return (
                    <>
                      {renderGroup(income, 'Inkomen')}
                      {renderGroup(expense, 'Uitgaven')}
                      {renderGroup(savings, 'Sparen')}
                      {renderGroup(debt, 'Schulden')}

                      <div className="mt-2 border-t-2 border-[var(--ink)] pt-2 space-y-0.5">
                        {totalIncome > 0 && (
                          <div className="flex justify-between font-bold">
                            <span className="font-sans text-[var(--ink)]">Totaal inkomen</span>
                            <span className="tabular-nums text-[var(--ink)]">€&nbsp;{totalIncome.toLocaleString('nl-NL')}</span>
                          </div>
                        )}
                        {totalExpense > 0 && (
                          <div className="flex justify-between font-bold">
                            <span className="font-sans text-[var(--ink)]">Totaal uitgaven</span>
                            <span className="tabular-nums text-[var(--ink)]">€&nbsp;{totalExpense.toLocaleString('nl-NL')}</span>
                          </div>
                        )}
                        {(totalSavings + totalDebt) > 0 && (
                          <div className="flex justify-between font-bold">
                            <span className="font-sans text-[var(--ink)]">Sparen &amp; schulden</span>
                            <span className="tabular-nums text-[var(--ink)]">€&nbsp;{(totalSavings + totalDebt).toLocaleString('nl-NL')}</span>
                          </div>
                        )}
                      </div>

                      <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
                        Maandlimieten op categorieniveau — sub-budgetten eronder
                      </p>
                    </>
                  )
                })()}
              </div>
            </div>

            {/* CTA */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDetailTemplate(null)}
                className="flex-1 rounded-[var(--r)] border border-[var(--border-md)] py-2.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
              >
                Annuleren
              </button>
              <button
                type="button"
                disabled={applyingTemplate}
                onClick={() => { setDetailTemplate(null); setConfirmTemplate(detailTemplate) }}
                className="flex-1 rounded-[var(--r)] bg-kern-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kern-700 disabled:opacity-50"
              >
                Template laden
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Template bevestigingsdialog */}
      {confirmTemplate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--scrim)]">
          <div className="mx-4 w-full max-w-md rounded-[var(--r-lg)] bg-[var(--paper)] p-6 shadow-[var(--s2)]">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Template laden</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Dit wist <span className="font-semibold text-orange-600">alle bestaande budgetten</span> en vervangt ze met de{' '}
              <span className="font-semibold">{confirmTemplate.name}</span>-template. Transacties blijven bewaard maar worden ontkoppeld. Doorgaan?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmTemplate(null)}
                className="rounded-[var(--r)] border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={() => handleApplyTemplate(confirmTemplate)}
                className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 transition-colors"
              >
                Bevestigen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding flow testen */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <h3 className="text-lg font-semibold text-[var(--ink)]">Onboarding flow testen</h3>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Wis alle data en doorloop de onboarding opnieuw als nieuwe gebruiker.
        </p>
        <button
          onClick={() => setShowOnboardingConfirm(true)}
          disabled={resettingOnboarding || seeding}
          className="mt-4 rounded-lg border border-teal-300 bg-teal-50 px-5 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resettingOnboarding ? 'Bezig met resetten...' : 'Onboarding starten'}
        </button>
      </div>

      {/* Onboarding confirmation dialog */}
      {showOnboardingConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--scrim)]">
          <div className="mx-4 w-full max-w-md rounded-xl bg-[var(--paper)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Onboarding testen</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Dit wist <span className="font-semibold text-red-600">al je financiele data</span> en
              stuurt je naar de onboarding flow als nieuwe gebruiker. Doorgaan?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowOnboardingConfirm(false)}
                className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={async () => {
                  setShowOnboardingConfirm(false)
                  setResettingOnboarding(true)
                  try {
                    const res = await fetch('/api/onboarding/reset', { method: 'POST' })
                    if (!res.ok) throw new Error('Reset failed')
                    router.push('/onboarding')
                  } catch {
                    setResettingOnboarding(false)
                    setMessage({ type: 'error', text: 'Onboarding reset mislukt.' })
                  }
                }}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
              >
                Bevestigen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check-in beheer */}
      <CheckinManager />

      {/* Mobile Preview */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <h3 className="text-lg font-semibold text-[var(--ink)]">Mobile Preview</h3>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Bekijk de app in een telefoon-frame om de mobile layout te testen op desktop.
        </p>

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => mobilePreview.setEnabled(!mobilePreview.enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              mobilePreview.enabled ? 'bg-kern-500' : 'bg-zinc-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-[var(--paper)] shadow-sm transition-transform ${
                mobilePreview.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm font-medium text-[var(--ink-2)]">
            {mobilePreview.enabled ? 'Actief' : 'Uit'}
          </span>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-[var(--ink-2)] mb-2">Device</p>
          <div className="flex flex-wrap gap-2">
            {DEVICE_PRESETS.map(d => (
              <button
                key={d.name}
                onClick={() => mobilePreview.setDevice(d)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  mobilePreview.device.name === d.name
                    ? 'border-kern-400 bg-kern-50 text-kern-700'
                    : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:border-[var(--border-md)] hover:bg-[var(--subtle)]'
                }`}
              >
                {d.name}
                <span className="ml-1 text-xs text-[var(--ink-3)]">{d.width}&times;{d.height}</span>
              </button>
            ))}
          </div>
        </div>

        {mobilePreview.enabled && (
          <p className="mt-4 text-xs text-kern-600">
            Preview is actief. Navigeer naar een pagina (bijv. /core) om de mobile weergave te testen.
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Check-in beheer ─────────────────────────────────────────────────── */
const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

function formatMonthLabel(monthKey: string): string {
  if (monthKey.includes('-')) {
    const [year, month] = monthKey.split('-')
    const idx = parseInt(month, 10) - 1
    if (idx >= 0 && idx < 12) return `${MONTH_NAMES[idx]} ${year}`
  }
  return monthKey
}

interface SnapshotInfo {
  key: string
  monthKey: string
  savedAt: string
  reflection: string
}

function CheckinManager() {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [completedMonths, setCompletedMonths] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/checkins')
      if (res.ok) {
        const data = await res.json()
        setSnapshots(data.snapshots || [])
        setCompletedMonths(data.completedMonths || [])
      }
    } catch { /* graceful */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(month: string) {
    setDeleting(month)
    try {
      await fetch('/api/admin/checkins', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })
      await load()
    } catch { /* graceful */ }
    setDeleting(null)
  }

  async function handleDeleteAll() {
    setConfirmDeleteAll(false)
    setDeleting('all')
    try {
      await fetch('/api/admin/checkins', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      await load()
    } catch { /* graceful */ }
    setDeleting(null)
  }

  // Extract month from snapshot key: checkin_snapshot_<uuid>_2026-03 → 2026-03
  function monthFromKey(key: string): string {
    const parts = key.split('_')
    return parts[parts.length - 1] || ''
  }

  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ink)]">Check-in beheer</h3>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Bekijk en verwijder check-in snapshots en maandmarkeringen.
          </p>
        </div>
        {snapshots.length > 0 && (
          <button
            onClick={() => setConfirmDeleteAll(true)}
            disabled={!!deleting}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            Alles wissen
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-3)]" />
          <span className="text-sm text-[var(--ink-3)]">Laden...</span>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-[var(--subtle)] p-4">
          <CalendarCheck className="h-5 w-5 text-[var(--ink-4)]" />
          <p className="text-sm text-[var(--ink-3)]">Geen check-in snapshots gevonden.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Completed months summary */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {completedMonths.map(m => (
              <span key={m} className="inline-flex rounded-full bg-kern-50 border border-kern-200 px-2 py-0.5 text-[10px] font-medium text-kern-700">
                {formatMonthLabel(m)}
              </span>
            ))}
          </div>

          {/* Snapshot list */}
          {snapshots.map(snap => {
            const month = monthFromKey(snap.key)
            return (
              <div key={snap.key} className="flex items-center gap-3 rounded-lg border border-[var(--border-ed)] p-3">
                <CalendarCheck className="h-4 w-4 text-kern-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--ink)] capitalize">
                    {formatMonthLabel(month)}
                  </p>
                  <p className="text-[11px] text-[var(--ink-3)] truncate">
                    {snap.savedAt ? new Date(snap.savedAt).toLocaleString('nl-NL') : '—'}
                    {snap.reflection && <> &middot; &ldquo;{snap.reflection.slice(0, 40)}{snap.reflection.length > 40 ? '...' : ''}&rdquo;</>}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(month)}
                  disabled={!!deleting}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-3)] hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  title={`Check-in ${formatMonthLabel(month)} verwijderen`}
                >
                  {deleting === month ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm delete all */}
      {confirmDeleteAll && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--scrim)]">
          <div className="mx-4 w-full max-w-md rounded-xl bg-[var(--paper)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Alle check-ins wissen?</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Dit verwijdert <span className="font-semibold text-red-600">alle</span> check-in snapshots, maandmarkeringen en voorkeuren. Dit kan niet ongedaan worden.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteAll(false)}
                className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={handleDeleteAll}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Alles wissen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Testgebruikers beheer ──────────────────────────────────────────── */

interface TestUser {
  id: string
  email: string
  personaKey: string | null
  personaName: string | null
  personaSubtitle: string | null
  onboardingCompleted: boolean
  lastKnownPhase: string | null
  isDemoUser: boolean
  lastSignIn: string | null
}

function TestUserManager() {
  const [users, setUsers] = useState<TestUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [passwordModal, setPasswordModal] = useState<TestUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmReset, setConfirmReset] = useState<TestUser | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/test-users')
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? `API fout (${res.status})` })
        return
      }
      setUsers(data.users ?? [])
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Kon testgebruikers niet laden' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleReset(user: TestUser) {
    setConfirmReset(null)
    setActionLoading(user.id)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/test-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', userId: user.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        await fetchUsers()
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Fout' })
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePasswordChange() {
    if (!passwordModal) return
    setActionLoading(passwordModal.id)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/test-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', userId: passwordModal.id, newPassword }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        setPasswordModal(null)
        setNewPassword('')
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Fout' })
    } finally {
      setActionLoading(null)
    }
  }

  const STATUS_COLORS: Record<string, string> = {
    ready: 'bg-emerald-50 text-emerald-700',
    onboarding: 'bg-amber-50 text-amber-700',
    activated: 'bg-wil-50 text-wil-700',
  }

  function getStatus(u: TestUser) {
    if (u.lastKnownPhase) return { label: `Actief (${u.lastKnownPhase})`, key: 'activated' }
    if (u.onboardingCompleted) return { label: 'Onboarding afgerond', key: 'onboarding' }
    return { label: 'Klaar voor onboarding', key: 'ready' }
  }

  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-6">
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">Beheer — Testgebruikers</p>
        <h3 className="mt-0.5 text-lg font-semibold text-[var(--ink)]">Landing page testaccounts</h3>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          4 testgebruikers gekoppeld aan de landing page persona&apos;s. Reset om de onboarding + activatie opnieuw te doorlopen.
        </p>
      </div>

      {message && (
        <div className={`mb-4 border px-4 py-2.5 text-sm ${
          message.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[var(--ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Testgebruikers laden...
        </div>
      ) : users.length === 0 ? (
        <div className="py-6 text-center">
          <p className="mb-3 text-sm text-[var(--ink-3)]">
            Geen testgebruikers gevonden.
          </p>
          <button
            type="button"
            onClick={async () => {
              setLoading(true)
              setMessage(null)
              try {
                const res = await fetch('/api/admin/test-users/create', { method: 'POST' })
                const data = await res.json()
                if (res.ok) {
                  const created = (data.results ?? []).filter((r: { status: string }) => r.status === 'created').length
                  setMessage({ type: 'success', text: `${created} testgebruiker(s) aangemaakt.` })
                  await fetchUsers()
                } else {
                  setMessage({ type: 'error', text: data.error ?? 'Aanmaken mislukt' })
                }
              } catch (e) {
                setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Fout' })
              } finally {
                setLoading(false)
              }
            }}
            className="border border-wil-300 bg-wil-50 px-4 py-2 text-xs font-medium text-wil-700 transition-colors hover:bg-wil-100"
          >
            Testgebruikers aanmaken
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const status = getStatus(u)
            const isLoading = actionLoading === u.id
            return (
              <div key={u.id} className="flex items-center gap-4 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--ink)]">{u.personaName ?? u.email}</p>
                    <span className={`inline-flex shrink-0 px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[status.key] ?? 'bg-zinc-100 text-[var(--ink-3)]'}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                    {u.email} — {u.personaSubtitle ?? 'geen persona'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPasswordModal(u)}
                    disabled={isLoading}
                    className="border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-50"
                  >
                    Wachtwoord
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(u)}
                    disabled={isLoading}
                    className="border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Reset'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm reset dialog */}
      {confirmReset && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--scrim)]">
          <div className="mx-4 w-full max-w-md bg-[var(--paper)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Testgebruiker resetten?</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Dit wist <span className="font-semibold text-red-600">alle</span> financiele data van{' '}
              <span className="font-semibold">{confirmReset.personaName ?? confirmReset.email}</span>{' '}
              en zet de onboarding terug naar het begin. De gebruiker kan opnieuw inloggen en de volledige flow doorlopen.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmReset(null)}
                className="border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
              >
                Annuleren
              </button>
              <button
                onClick={() => handleReset(confirmReset)}
                className="bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Resetten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password change dialog */}
      {passwordModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--scrim)]">
          <div className="mx-4 w-full max-w-md bg-[var(--paper)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Wachtwoord wijzigen</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Nieuw wachtwoord voor <span className="font-semibold">{passwordModal.email}</span>
            </p>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nieuw wachtwoord (min. 6 tekens)"
              className="mt-4 w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-wil-300 focus:outline-none focus:ring-1 focus:ring-wil-300"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setPasswordModal(null); setNewPassword('') }}
                className="border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
              >
                Annuleren
              </button>
              <button
                onClick={handlePasswordChange}
                disabled={newPassword.length < 6 || actionLoading === passwordModal.id}
                className="bg-wil-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-600 disabled:opacity-50"
              >
                {actionLoading === passwordModal.id ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
