'use client'

import { EyeOff, Wallet, Users } from 'lucide-react'
import {
  PARTNER_VISIBILITY_VALUES,
  type PartnerVisibility,
} from '@/lib/bank-account-visibility'

const OPTIONS: {
  value: PartnerVisibility
  label: string
  hint: string
  Icon: typeof EyeOff
}[] = [
  { value: 'none', label: 'Niets', hint: 'Rekening en boekingen blijven privé', Icon: EyeOff },
  { value: 'balance', label: 'Alleen saldo', hint: 'Wel de rekening en het saldo, geen boekingen', Icon: Wallet },
  { value: 'full', label: 'Alles', hint: 'Ook de gedeelde boekingen op deze rekening', Icon: Users },
]

/**
 * AccountVisibilityToggle — "wat ziet mijn partner van deze rekening?"
 *
 * Eén driewegkeuze die twee kolommen aanstuurt: `partner_visibility` én, via de
 * server, `bank_accounts.ownership` ('none' hoort bij persoonlijk, de andere
 * twee bij gedeeld). Vandaar dat deze component bewust NIET naast de oude
 * `OwnershipToggle` staat maar in de plaats ervan: twee losse knoppen voor één
 * gekoppelde toestand is precies hoe ze uit de pas gaan lopen.
 *
 * ## Drie dingen die de tekst hier moet zeggen
 *
 * 1. **Het is asymmetrisch.** Een rekening heeft precies één eigenaar en de
 *    UPDATE-policy is strikt eigen-rij: alleen de rekeninghouder zet deze knop.
 *    De kop zegt daarom "wat jouw partner ziet" — nooit iets dat wederzijdsheid
 *    suggereert. Je partner blijft zijn eigen boekingen op een gedeelde
 *    rekening altijd zien; die vallen niet onder deze knop.
 * 2. **De twee dials zijn een AND.** Deze rekeningknop en de categorieknop op
 *    /mijn (privacy-instellingen van het huishouden) beperken allebei; de
 *    strengste wint. Wie hier 'Alles' kiest terwijl de categorie op 'hidden'
 *    staat, deelt nog steeds niets.
 * 3. **'Alleen saldo' heeft een gevolg voor importeren.** Op zo'n rekening is de
 *    rekeninghouder de enige die kan importeren — de partner zou zijn dubbele
 *    boekingen niet kunnen zien en ze dus stil verdubbelen (ADR 0118).
 */
export function AccountVisibilityToggle({
  value,
  onChange,
  hasHousehold,
  disabled = false,
}: {
  value: PartnerVisibility
  onChange: (value: PartnerVisibility) => void
  hasHousehold: boolean
  /** De partner mag deze knop niet zetten; alleen de rekeninghouder. */
  disabled?: boolean
}) {
  const active = PARTNER_VISIBILITY_VALUES.includes(value) ? value : 'none'
  const current = OPTIONS.find((o) => o.value === active) ?? OPTIONS[0]

  return (
    <div data-testid="account-visibility-toggle">
      <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">
        Wat ziet je partner van deze rekening?
      </label>
      <div className="flex gap-1" role="group">
        {OPTIONS.map(({ value: option, label, Icon }) => {
          const isActive = active === option
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={isActive}
              onClick={() => onChange(option)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                isActive
                  ? option === 'none'
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : 'bg-kern-600 text-white'
                  : 'bg-[var(--subtle)] text-[var(--ink-3)] hover:bg-[var(--border-ed)]'
              }`}
              data-testid={`account-visibility-${option}-btn`}
            >
              <Icon className="h-3 w-3 shrink-0" />
              {label}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-[var(--ink-4)]" data-testid="account-visibility-hint">
        {current.hint}. Je partner ziet dit alleen als zijn privacy-instelling het
        ook toelaat — de strengste van de twee wint.
      </p>
      {active === 'balance' && (
        <p className="mt-1 text-xs text-[var(--ink-4)]">
          Bij &lsquo;alleen saldo&rsquo; importeer jij als enige boekingen op deze rekening.
        </p>
      )}
      {!hasHousehold && (
        <p className="mt-1 text-xs text-[var(--ink-4)]">
          Je hebt nog geen huishouden — deze keuze gaat pas gelden zodra je een
          partner uitnodigt.
        </p>
      )}
    </div>
  )
}
