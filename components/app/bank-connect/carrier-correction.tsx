'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Building2, Link2 } from 'lucide-react'
import { isSelectableTargetOption, type TargetAccountOption } from '@/lib/truelayer/target-account'
import { describeAccountHistory, OccupiedAccountExit } from './target-account-choice'

/**
 * HET CORRECTIEMOMENT — "dit is niet de goede rekening" (fase 5, SC-07).
 *
 * Verschijnt op de success-pagina onder élke gekoppelde rekening en verhangt de
 * koppeling naar een andere TriFinity-rekening via
 * `POST /api/bank-connect/relink`.
 *
 * Waarom dit bestaat: in de precedentieketen van de callback wint identiteit
 * (`external_account_id`) altijd van de expliciete keuze uit de wizard. Dat is
 * juist — een herautorisatie mag een bestaande koppeling niet verhangen — maar het
 * betekent dat de data ergens ánders kan landen dan de gebruiker aanwees. Een
 * verplichte keuze die stil genegeerd wordt is erger dan geen keuze; dus is de
 * uitkomst zichtbaar én corrigeerbaar.
 *
 * De kandidatenlijst komt uit `GET /api/bank-connect/accounts` — dezelfde route en
 * dezelfde geschiktheidsregel als de wizard, zodat het correctiemoment nooit iets
 * aanbiedt dat de server weigert. Sinds fase 6 hoort FR5 daarbij: een rekening die
 * al een ándere actieve koppeling draagt staat uit (`isSelectableTargetOption`),
 * met de huidige drager als uitzondering — die is per definitie "bezet", namelijk
 * door déze koppeling.
 */

export type CarrierCorrectionProps = {
  /** `bank_connection_accounts.id` van de te verhangen koppeling. */
  connectionAccountId: string
  /** De TriFinity-rekening die hem nu draagt (voorgeselecteerd). */
  currentBankAccountId: string
  /** Aangeroepen ná een geslaagde wijziging; de pagina herlaadt dan de lijst. */
  onDone: () => void
  onCancel: () => void
}

const OPTION_BASE = 'rounded-[var(--r-lg)] border transition-colors'
const OPTION_SELECTED = 'border-kern-500 bg-kern-50'
const OPTION_IDLE = 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]'
/** Bezet door een ándere bank (FR5): zichtbaar, zonder hover, niet te kiezen. */
const OPTION_BLOCKED = 'border-[var(--border-ed)] bg-[var(--subtle)]'
const RADIO_CLASS =
  'mt-0.5 h-3.5 w-3.5 shrink-0 accent-kern-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-600'

export function CarrierCorrection({
  connectionAccountId,
  currentBankAccountId,
  onDone,
  onCancel,
}: CarrierCorrectionProps) {
  const [accounts, setAccounts] = useState<TargetAccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(currentBankAccountId)
  const [saving, setSaving] = useState(false)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bank-connect/accounts')
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Rekeningen laden is niet gelukt.')
        return
      }
      setAccounts((data.accounts ?? []) as TargetAccountOption[])
    } catch {
      setError('Rekeningen laden is niet gelukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/bank-connect/relink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_account_id: connectionAccountId,
          bank_account_id: selected,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        // De envelope is plat (`{ error: string }`, ADR 0044) — de server levert
        // hier bewust de NL-tekst, inclusief de 409 "al gekoppeld aan {bank}".
        setError(typeof data?.error === 'string' ? data.error : 'Wijzigen is niet gelukt.')
        return
      }
      onDone()
    } catch {
      setError('Wijzigen is niet gelukt.')
    } finally {
      setSaving(false)
    }
  }

  const noOtherChoice = selected === currentBankAccountId
  /**
   * Valt er überhaupt iets te verhuizen? Sinds fase 6 (FR5) kan de lijst vol
   * staan met rekeningen die al een koppeling dragen; dan is "kies een andere
   * rekening" een instructie die niet uit te voeren is.
   */
  const hasAlternative = accounts.some(
    (a) => a.id !== currentBankAccountId && isSelectableTargetOption(a, currentBankAccountId),
  )

  return (
    /* Bewust géén eigen omlijning/vlak: de kaart heeft al een rand, de
       ouder-sectie een hairline en elke optie hieronder haar eigen rand. Een
       vierde kader zou box-in-box-in-box worden, en het krant-ritme werkt met
       hairlines, niet met vlakken. */
    <div className="mt-3 space-y-3">
      <p className="text-xs leading-relaxed text-[var(--ink-2)]">
        Kies de TriFinity-rekening die deze bankrekening moet dragen.
      </p>

      {/* De grens van deze correctie, vóóraf en niet achteraf: de koppeling
          verhuist, al geïmporteerde transacties niet. Op dit moment zijn er nog
          geen (de koppeling haalt alleen saldo op), maar wie deze regel weghaalt
          moet weten wat hij belooft.

          Het SALDO gaat sinds fase 8 wél mee terug — `POST
          /api/bank-connect/relink` schrijft een compenserende waardering op de
          vorige drager. Dat hoort hier te staan omdat de regel er direct boven
          net meldde dat het saldo is overgenomen en "vastgelegd"; zonder deze
          zin laat deze waarschuwing precies díe vraag onbeantwoord. */}
      <p className="flex items-start gap-2 rounded-[var(--r-md)] border border-warning/30 bg-warning-bg px-2.5 py-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
        <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
        <span>
          Alleen de koppeling verhuist. Het overgenomen saldo gaat mee terug naar de
          vorige rekening; transacties die al zijn opgehaald blijven staan waar ze nu
          zijn.
        </span>
      </p>

      {loading && (
        <div className="space-y-2" role="status" aria-live="polite">
          <span className="sr-only">Rekeningen laden</span>
          <div
            aria-hidden
            className="h-[62px] animate-pulse rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)]"
          />
          <div
            aria-hidden
            className="h-[62px] animate-pulse rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)]"
          />
        </div>
      )}

      {!loading && accounts.length === 0 && !error && (
        <p role="status" className="text-xs text-[var(--ink-3)]">
          Er is geen andere rekening om naar te verhuizen.
        </p>
      )}

      {!loading && accounts.length > 0 && (
        <div role="radiogroup" aria-label="Welke rekening draagt deze bankrekening" className="space-y-2">
          {accounts.map((account) => {
            const isSelected = selected === account.id
            const isCurrent = account.id === currentBankAccountId
            // FR5, met dezelfde predikaat als de wizardstap. De HUIDIGE drager
            // blijft kiesbaar: die is per definitie "bezet" — door deze koppeling
            // zelf — en uitschakelen zou de voorselectie onbruikbaar maken.
            const blocked = !isSelectableTargetOption(account, currentBankAccountId)
            const unusable = saving || blocked

            return (
              <div
                key={account.id}
                className={`${OPTION_BASE} ${
                  blocked ? OPTION_BLOCKED : isSelected ? OPTION_SELECTED : OPTION_IDLE
                }`}
              >
                <label className={`flex items-start gap-2.5 p-2.5 ${unusable ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name={`carrier-${connectionAccountId}`}
                    value={account.id}
                    checked={isSelected}
                    disabled={unusable}
                    onChange={() => setSelected(account.id)}
                    className={RADIO_CLASS}
                  />
                  <Building2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span
                      className={`block text-xs font-semibold ${
                        blocked ? 'text-[var(--ink-2)]' : 'text-[var(--ink)]'
                      }`}
                    >
                      {account.name}
                      {isCurrent && (
                        <span className="ml-1.5 font-normal text-[var(--ink-3)]">· draagt hem nu</span>
                      )}
                    </span>
                    <span className="block text-[11px] text-[var(--ink-3)]">
                      {account.bank_name ?? 'Eigen rekening'}
                      {account.iban_tail ? ` · ···· ${account.iban_tail}` : ''}
                    </span>
                    <span className="block font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                      {describeAccountHistory(account)}
                    </span>
                    {/* Sinds fase 6 is dit geen waarschuwing meer maar de reden dat
                        de optie uit staat, en dus de énige verklaring die de radio
                        meedraagt — vandaar `--ink-2`/`text-xs` in plaats van de
                        `--ink-3`-meta-maat, die op deze grootte geen AA haalt. De
                        uitweg staat eronder als echte link, buiten het label. */}
                    {account.linked_provider_name && !isCurrent && (
                      <span className="flex items-start gap-1.5 text-xs text-[var(--ink-2)]">
                        <Link2 aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>Al gekoppeld aan {account.linked_provider_name}.</span>
                      </span>
                    )}
                  </span>
                </label>

                {blocked && <OccupiedAccountExit accountId={account.id} />}
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-xs font-medium text-negative">
          <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {/* Waaróm de knop wacht, in plaats van een grijze knop zonder uitleg —
          zelfde patroon als "Kies eerst waar de data terechtkomt." in de
          keuzestap van fase 4. */}
      {!loading && !saving && accounts.length > 0 && noOtherChoice && (
        <p className="text-[11px] text-[var(--ink-3)]">
          {hasAlternative
            ? 'Kies een andere rekening om te verhuizen.'
            : 'Alle andere rekeningen dragen al een bankkoppeling. Verbreek er eerst één om deze koppeling te kunnen verhuizen.'}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
        >
          Annuleren
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading || noOtherChoice}
          className="rounded-lg bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
        >
          {saving ? 'Bezig…' : 'Verhuis koppeling'}
        </button>
      </div>
    </div>
  )
}
