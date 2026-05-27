'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Link2, ChevronRight } from 'lucide-react'
import { MODULE_CATALOG } from '@/lib/module-registry'
import { useModuleToggle } from '@/lib/hooks/use-module-toggle'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { ExportDropdown } from '@/components/app/export-dropdown'

/**
 * GeavanceerdSettings — modules, data-export en data-reset. Geëxtraheerd
 * uit de legacy /identity/instellingen-monolith (tabs 'modules' +
 * 'gegevens') naar de canonieke /mijn/geavanceerd-pagina (plan A-2).
 *
 * Hergebruikt dezelfde hooks/endpoints als de monolith — geen nieuwe
 * data-logica: useModuleToggle (module aan/uit + dependency-validatie),
 * ExportDropdown (CSV-export) en /api/onboarding/reset.
 */
export function GeavanceerdSettings() {
  const router = useRouter()
  const { activeModules, refreshModules } = useModuleAccess()
  const {
    modules: localModules,
    toggle: toggleModule,
    saving: moduleSaving,
  } = useModuleToggle(activeModules, refreshModules)
  const [moduleErrors, setModuleErrors] = useState<string[]>([])
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 space-y-4">
      <header className="mb-2">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Mijn — geavanceerd
        </div>
        <h1 className="font-serif text-2xl text-[var(--ink)] mt-1">
          Modules &amp; gegevens
        </h1>
      </header>

      {/* ── Modules ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="px-4 sm:px-6 py-5 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Actieve modules</h2>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Kies welke modules actief zijn. Afhankelijkheden worden automatisch gecontroleerd.
            </p>
          </div>

          <div className="divide-y divide-[var(--border-ed)] rounded-xl border border-[var(--border-ed)]">
            {MODULE_CATALOG.map((mod) => {
              const enabled = localModules.includes(mod.id)
              const isDev = mod.inDevelopment
              return (
                <div
                  key={mod.id}
                  className={`flex items-center justify-between gap-4 px-4 py-3.5 ${isDev ? 'opacity-60' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {mod.label}
                      {isDev && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          In ontwikkeling
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--ink-3)]">{mod.description}</p>
                    {mod.requires.length > 0 && (
                      <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                        Vereist: {mod.requires.map((r) => MODULE_CATALOG.find((m) => m.id === r)?.label ?? r).join(', ')}
                      </p>
                    )}
                    {mod.requiresOneOf && mod.requiresOneOf.length > 0 && (
                      <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                        Vereist een van: {mod.requiresOneOf.map((r) => MODULE_CATALOG.find((m) => m.id === r)?.label ?? r).join(' of ')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${mod.label} ${enabled ? 'uitschakelen' : 'inschakelen'}`}
                    disabled={moduleSaving}
                    onClick={async () => {
                      setModuleErrors([])
                      const result = await toggleModule(mod.id, !enabled)
                      if (!result.success) setModuleErrors(result.errors)
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
                      enabled ? 'bg-emerald-500' : 'bg-zinc-300'
                    } ${moduleSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                        enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )
            })}
          </div>

          {moduleErrors.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="space-y-1">
                {moduleErrors.map((err, i) => (
                  <p key={i} className="text-sm text-amber-800">{err}</p>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-[var(--ink-4)]">
            {localModules.length} van {MODULE_CATALOG.length} modules actief
          </p>
        </div>
      </section>

      {/* ── Externe koppelingen ─────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <Link
          href="/mijn/koppelingen"
          className="flex w-full items-center justify-between px-4 sm:px-6 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] text-[var(--ink-2)]">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="label-editorial text-[var(--ink-2)]">Externe koppelingen</h2>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                Crypto-exchanges, wallets, brokers en bankrekeningen — beheer op de Koppelingen-pagina
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
        </Link>
      </section>

      {/* ── Data Export ─────────────────────────────────────────── */}
      <section id="export" className="card-editorial overflow-hidden scroll-mt-24">
        <div className="px-4 sm:px-6 py-4">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">Data export</h2>
          <p className="mt-1 text-xs text-[var(--ink-4)]">Download je financiële gegevens als CSV-bestand</p>
          <div className="mt-3">
            <ExportDropdown />
          </div>
        </div>
      </section>

      {/* ── Gegevens resetten ───────────────────────────────────── */}
      <section className="rounded-2xl border border-red-200 bg-[var(--paper)] overflow-hidden">
        <div className="px-4 sm:px-6 py-4">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-red-400 uppercase">Gegevens resetten</h2>
          <p className="mt-1 text-xs text-[var(--ink-3)]">Alle data permanent verwijderen en opnieuw starten</p>
          <p className="mt-3 text-sm text-[var(--ink-3)]">
            Wis al je financiële gegevens en doorloop de onboarding opnieuw. Dit
            verwijdert al je bankrekeningen, transacties, budgetten, doelen en
            overige data.
          </p>
          <button
            type="button"
            onClick={() => setShowResetDialog(true)}
            disabled={resetting}
            className="mt-3 rounded-lg border border-red-300 bg-red-50 px-5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            {resetting ? 'Bezig met wissen…' : 'Alle gegevens wissen'}
          </button>
          {resetError && <p className="mt-3 text-sm text-red-600">{resetError}</p>}
        </div>
      </section>

      {/* Reset-bevestiging */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--paper)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Weet je het zeker?</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Dit wist <span className="font-semibold text-red-600">al je financiële data</span> permanent.
              Je wordt teruggeleid naar de onboarding om opnieuw te beginnen.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetDialog(false)}
                className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowResetDialog(false)
                  setResetting(true)
                  try {
                    const res = await fetch('/api/onboarding/reset', { method: 'POST' })
                    if (!res.ok) throw new Error('Reset failed')
                    router.push('/onboarding')
                  } catch {
                    setResetting(false)
                    setResetError('Reset mislukt. Probeer opnieuw.')
                  }
                }}
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
