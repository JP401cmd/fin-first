'use client'

import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/**
 * BedragenVerbergenBlok — "Bedragen verbergen" als eerste blok op /mijn/privacy.
 *
 * UR3-14 deel B: de enige ingang naar het maskeren van bedragen was tot nu toe
 * de ⌘K-actie ("Bedragen verbergen/tonen") — onvindbaar op mobiel (geen ⌘K)
 * en onvindbaar voor wie niet weet dat er een commandopalet bestaat. Dit blok
 * zet dezelfde schakelaar rechtstreeks op de pagina waar je 'm zou verwachten,
 * naar het "kaartrecept" van `DisplayModePicker` op /mijn/uiterlijk (label +
 * uitleg, geen eigen paginakop).
 *
 * GEEN TWEEDE SCHRIJFPAD: drijft op hetzelfde `useMaskedAmounts()`-context als
 * de ⌘K-actie (`action:toggle-privacy`) — zelfde `localStorage`-sleutel, geen
 * eigen state, geen API, geen migratie. Bewust device-local (zie
 * lib/hooks/use-privacy.tsx): dit is een apparaat-instelling, geen
 * account-instelling (besluit B-011) — vandaar geen server-sync en geen
 * tweede schakelaar in top-bar/zijbalk.
 *
 * NAAMGEVING: heet bewust NIET "privacymodus" — die naam is in code én HLD
 * al bezet door de lokale-AI-modus (`profiles.privacy_mode`, `usePrivacyMode`).
 * Gebruik overal "Bedragen verbergen".
 */
export function BedragenVerbergenBlok() {
  const { masked, setMasked } = useMaskedAmounts()

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-4">
      <div className="flex items-center justify-between gap-4 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
            Bedragen verbergen
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
            Toont overal •••• in plaats van bedragen. Geldt voor dit apparaat. Snel wisselen kan met
            het zoekscherm (<kbd className="font-mono">⌘K</kbd> of{' '}
            <kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">K</kbd>).
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={masked}
          aria-label={masked ? 'Bedragen tonen' : 'Bedragen verbergen'}
          onClick={() => setMasked(!masked)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wil-500 ${
            masked ? 'bg-wil-500' : 'bg-zinc-300'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
              masked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
