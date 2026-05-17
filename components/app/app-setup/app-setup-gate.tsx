'use client'

import { Fragment } from 'react'
import { useAppSetupState } from './use-app-setup-state'
import { AppSetupSection } from './app-setup-section'
import type { AppSetupConfig } from './types'
import type { AppSetupKey } from '@/lib/app-setup-status'

import { budgetterenSetupConfig } from './configs/budgetteren.config'
import { aandelenHoldingsSetupConfig } from './configs/aandelen-holdings.config'
import { cryptoHoldingsSetupConfig } from './configs/crypto-holdings.config'
import { hypotheekplannerSetupConfig } from './configs/hypotheekplanner.config'
import { verhuurrendementSetupConfig } from './configs/verhuurrendement.config'

// ── Config registry ─────────────────────────────────────────
//
// Eén plek waar alle app-configs samenkomen. De gate kiest hieruit op
// basis van `appKey`. Een nieuwe app toevoegen kost: één entry in
// `APP_SETUP_SLUGS` (lib/app-setup-status.ts), één config-file in
// `configs/`, en één regel hieronder.

// `unknown` is safe — elke config bezit z'n eigen TState-shape die de
// generieke hook door-typeert via TypeScript's contextual inference.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CONFIGS: Record<AppSetupKey, AppSetupConfig<any>> = {
  budgetteren: budgetterenSetupConfig,
  aandelen_holdings: aandelenHoldingsSetupConfig,
  crypto_holdings: cryptoHoldingsSetupConfig,
  hypotheekplanner: hypotheekplannerSetupConfig,
  verhuurrendement: verhuurrendementSetupConfig,
}

/**
 * Generieke first-time setup-gate voor een app. Wordt door de bijbehorende
 * tab-component (of pagina) ingevoegd wanneer `appSetupCompleted === false`.
 * De gate vervangt de inhoud van de tab volledig — voltooien is verplicht
 * (geen Skip-knop, conform plan).
 *
 * Geen modal/overlay: dit is een full-page form binnen de tab-container.
 * Voor de gebruiker voelt het als een natuurlijke "eerst even instellen"-
 * stap; voor de developer is het simpeler dan een ShellOverlay met
 * verborgen close-knop.
 */
export function AppSetupGate({ appKey }: { appKey: AppSetupKey }) {
  const config = CONFIGS[appKey]
  return <AppSetupGateInner config={config} />
}

// ── Inner — typed op TState voor de hook ─────────────────────

function AppSetupGateInner<TState>({ config }: { config: AppSetupConfig<TState> }) {
  const { state, setState, save, saving, errorMsg, validation } =
    useAppSetupState(config)

  return (
    <div className="space-y-8">
      {/* ── Hero ───────────────────────────────────────── */}
      <section className="border-t border-b border-[var(--ink)] bg-[var(--paper)] px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {config.kicker}
        </p>
        <h2
          className="mt-1 font-serif text-xl font-semibold text-[var(--ink)] sm:text-2xl"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          {config.title}
        </h2>
        <p className="mt-3 font-serif italic text-sm leading-relaxed text-[var(--ink-2)] sm:text-base">
          {config.intro}
        </p>
      </section>

      {/* ── Secties met dashed divider ─────────────────── */}
      <div className="space-y-8">
        {config.sections.map((section, index) => (
          <Fragment key={section.id}>
            {index > 0 && (
              <div className="border-t border-dashed border-[var(--border-ed)]" />
            )}
            <AppSetupSection
              kicker={section.kicker}
              title={section.title}
              hint={section.hint}
            >
              {section.render({ state, setState })}
            </AppSetupSection>
          </Fragment>
        ))}
      </div>

      {/* ── Validatie- en error-banner ─────────────────── */}
      {errorMsg && (
        <div
          role="alert"
          className="border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700"
        >
          {errorMsg}
        </div>
      )}

      {/* ── Footer met Voltooien-knop ──────────────────── */}
      <footer className="border-t border-[var(--border-ed)] pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-serif italic text-[12px] leading-snug text-[var(--ink-3)]">
            {validation.ok
              ? 'Klaar om je instellingen te bevestigen.'
              : (validation.reason ?? 'Vul eerst alle vereiste velden in.')}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={!validation.ok || saving}
            className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-5 text-sm font-medium leading-none text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
          >
            {saving ? 'Bezig…' : 'Voltooien'}
          </button>
        </div>
      </footer>
    </div>
  )
}
