'use client'

/**
 * De twee bevestigingen van transactie-bulkbewerken.
 *
 * - `BulkBudgetSheet`  — hercategoriseren (F14/F15). Een keuze + een
 *   bevestiging, met terugkeer naar dezelfde context ⇒ `kind="sheet"`.
 * - `BulkDeleteConfirm` — verwijderen (F16–F18). Onomkeerbaar (besluit B1: hard
 *   delete, geen prullenbak) ⇒ `kind="confirm"` met `destructive`.
 *
 * Beide zetten hun knoppen in de **sticky footer** van de overlay (`footer`-prop
 * → BottomSheet's `footerSlot`), óók op klein scherm. Een bevestigknop die
 * onderaan de scroll-content meeloopt is bij een onherroepelijke actie het
 * verkeerde soort verrassing.
 *
 * ── Rood is nooit het enige signaal ─────────────────────────────────────────
 * De waarschuwing draagt een icoon, een expliciete kop ("Dit is definitief") en
 * de uitkomst in de knoptekst ("Verwijder 43 transacties"). Wie geen kleur ziet,
 * leest hetzelfde verhaal — de GOV.UK-regel achter F16.
 */

import { useState } from 'react'
import { AlertTriangle, ArrowLeftRight, GitFork, Landmark } from 'lucide-react'
import { ModalFooter } from '@/components/app/modal-footer'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { Kicker } from '@/components/editorial'
import { budgetOptionLabel, type BudgetSelectEntry } from '@/lib/budget-data'
import { TYPE_TO_CONFIRM_THRESHOLD } from '@/lib/transactions/bulk-contract'
import { BulkImpact } from './bulk-impact'
import { KERN_MODULE_TINT } from './kern-tint'

const nlNumber = new Intl.NumberFormat('nl-NL')

const FIELD_CLASS =
  'w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500'

/** De actieve filtercontext — het antwoord op "43 waarvan precies?" (F14/F16). */
function Filtercontext({ lines }: { lines: readonly string[] }) {
  return (
    <div className="border-l-[3px] border-kern-500 bg-[var(--subtle)] px-3 py-2">
      <Kicker size="small">Gekozen binnen</Kicker>
      {lines.length === 0 ? (
        <p className="mt-1 text-[12px] text-[var(--ink-2)]">
          Je hele historie — er staat geen filter aan.
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {lines.map((line) => (
            <li key={line} className="text-[12px] text-[var(--ink-2)]">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Hercategoriseren ────────────────────────────────────────────────────────

export interface BulkBudgetSheetProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  busy: boolean
  error: string | null
  /** De volledige selectie — "wat je vast hebt", inclusief split-transacties. */
  count: number
  /**
   * Wat er daadwerkelijk verandert: de selectie minus de split-transacties. De
   * knoptekst benoemt dít getal, zodat de knop niet meer belooft dan hij doet.
   */
  mutableCount: number
  sumPositief: number
  sumNegatief: number
  filterLines: readonly string[]
  /** Split-transacties in de selectie; worden uitgesloten en vooraf gemeld. */
  splitCount: number
  budgetEntries: readonly BudgetSelectEntry[]
  budgetId: string | null
  onBudgetChange: (id: string | null) => void
  /** Is de gekozen post de archive-emmer "Eigen rekening"? */
  isEigenRekening: boolean
}

export function BulkBudgetSheet({
  open,
  onClose,
  onConfirm,
  busy,
  error,
  count,
  mutableCount,
  sumPositief,
  sumNegatief,
  filterLines,
  splitCount,
  budgetEntries,
  budgetId,
  onBudgetChange,
  isEigenRekening,
}: BulkBudgetSheetProps) {
  return (
    <ShellOverlay
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      kind="sheet"
      size="md"
      title="Koppel aan budget"
      footer={
        <ModalFooter
          primary={{
            label: `Koppel ${nlNumber.format(mutableCount)} ${mutableCount === 1 ? 'transactie' : 'transacties'}`,
            onClick: onConfirm,
            loading: busy,
            disabled: mutableCount === 0,
          }}
          secondary={{ label: 'Annuleer', onClick: onClose, disabled: busy }}
        />
      }
    >
      <div className="space-y-4 p-5" style={KERN_MODULE_TINT}>
        <BulkImpact
          count={count}
          sumPositief={sumPositief}
          sumNegatief={sumNegatief}
          variant="block"
        />

        <Filtercontext lines={filterLines} />

        {splitCount > 0 && (
          <p className="flex items-start gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-[12px] text-[var(--ink-2)]">
            <GitFork className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden />
            <span>
              {splitCount === 1
                ? 'Eén geselecteerde transactie is gesplitst en blijft ongewijzigd'
                : `${nlNumber.format(splitCount)} geselecteerde transacties zijn gesplitst en blijven ongewijzigd`}
              : bij een split bepalen de deelregels het budget. Wil je die anders indelen, open ze
              dan los.
            </span>
          </p>
        )}

        <div>
          <label htmlFor="bulk-target-budget" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
            Budget
          </label>
          <select
            id="bulk-target-budget"
            value={budgetId ?? ''}
            onChange={(e) => onBudgetChange(e.target.value || null)}
            className={FIELD_CLASS}
          >
            <option value="">Niet gecategoriseerd</option>
            {budgetEntries.map((entry) =>
              entry.kind === 'group' ? (
                <optgroup key={entry.id} label={entry.label}>
                  {entry.options.map((child) => (
                    <option key={child.id} value={child.id}>
                      {budgetOptionLabel(child)}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option key={entry.id} value={entry.id}>
                  {budgetOptionLabel(entry)}
                </option>
              ),
            )}
          </select>
          {isEigenRekening && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-[var(--ink-3)]">
              <ArrowLeftRight className="mt-0.5 h-3 w-3 shrink-0 text-kern-600" aria-hidden />
              <span>
                Deze transacties gaan als verschuiving tussen eigen rekeningen door het leven en
                tellen niet meer mee als inkomst of uitgave — je spaarquote en vrijheids-% bewegen
                dus mee.
              </span>
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
      </div>
    </ShellOverlay>
  )
}

// ── Verwijderen ─────────────────────────────────────────────────────────────

export interface BulkDeleteConfirmProps {
  open: boolean
  onClose: () => void
  onConfirm: (input: { confirmCount?: number; includeLinkedCounterparts: boolean }) => void
  busy: boolean
  error: string | null
  count: number
  sumPositief: number
  sumNegatief: number
  filterLines: readonly string[]
  /** Hoeveel rijen van een gekoppelde bankrekening komen (F18/AC10). */
  bankLinkedCount: number
  /**
   * Aantal gekoppelde tegenboekingen BUITEN de selectie, server-opgelost uit het
   * selectiemanifest.
   *
   * Nooit onbekend: de aanroeper materialiseert élke selectie — ook een
   * expliciete rij-selectie — vóór hij deze bevestiging opent. Was dat niet zo,
   * dan zou dit getal op nul staan terwijl de server de tegenboekingen wél
   * meeneemt, en noemde de knop een lager aantal dan er verdwijnt.
   */
  linkedCounterpartCount: number
  /** Bevat de selectie gesplitste transacties? Hun deelregels gaan mee. */
  splitCount: number
}

export function BulkDeleteConfirm({
  open,
  onClose,
  onConfirm,
  busy,
  error,
  count,
  sumPositief,
  sumNegatief,
  filterLines,
  bankLinkedCount,
  linkedCounterpartCount,
  splitCount,
}: BulkDeleteConfirmProps) {
  // De aanroeper mount deze bevestiging pas bij het openen (en unmount hem bij
  // het sluiten), zodat een overgetypt aantal uit een afgebroken poging nooit
  // kan blijven staan. Vandaar géén reset-effect: verse mount = verse poort.
  const [typed, setTyped] = useState('')
  const [includeLinked, setIncludeLinked] = useState(true)

  // Het genoemde aantal is het TOTAAL inclusief tegenboekingen (ADR 0104
  // besluit 8): de knoptekst en de over te typen poort dragen hetzelfde getal
  // als wat er daadwerkelijk verdwijnt, en als wat de server toetst. Zet de
  // gebruiker het meenemen van tegenboekingen uit, dan zakt het getal zichtbaar
  // mee.
  //
  // `linkedCounterpartCount` komt uit het selectiemanifest en is dus altijd
  // bekend — óók bij een expliciete rij-selectie. Toen dat niet zo was, telde
  // deze som bij zo'n selectie met nul tegenboekingen: onder de drempel
  // verwijderde de server er stil méér dan de knop noemde, en erboven vroeg hij
  // een getal dat de knop niet accepteerde omdat `typedOk` tegen het lagere
  // getal vergeleek.
  const meegaandeTegenboekingen = includeLinked ? linkedCounterpartCount : 0
  const totaal = count + meegaandeTegenboekingen
  const needsTyping = totaal > TYPE_TO_CONFIRM_THRESHOLD
  // Letterlijke vergelijking, geen `Number(...)`. Deze poort bestaat om wrijving
  // te geven: de gebruiker moet het getal dat op de knop staat overtypen. Een
  // numerieke vergelijking accepteert óók `43.0`, `4.3e1` en `0x2B` als 43 — dan
  // is het geen bewuste handeling meer maar een rekensom die toevallig uitkomt.
  // De punt wordt wél weggestreept, want de knop toont het getal in nl-notatie
  // ("1.250") en dat overtypen hoort te werken.
  const typedOk = !needsTyping || typed.replace(/[.\s]/g, '') === String(totaal)
  const label = `Verwijder ${nlNumber.format(totaal)} ${totaal === 1 ? 'transactie' : 'transacties'}`

  return (
    <ShellOverlay
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      kind="confirm"
      destructive
      title="Definitief verwijderen"
      footer={
        <ModalFooter
          align="end"
          primary={{
            label,
            onClick: () =>
              onConfirm({
                // `totaal` en niet `Number(typed)`: de knop is alleen klikbaar
                // als `typedOk` waar is, dus die twee zijn per definitie gelijk —
                // en `Number('1.250')` zou 1,25 opleveren, wat de server als
                // mismatch zou weigeren op precies de invoer die de knop toestaat.
                confirmCount: needsTyping ? totaal : undefined,
                includeLinkedCounterparts: includeLinked,
              }),
            loading: busy,
            disabled: totaal === 0 || !typedOk,
          }}
          secondary={{ label: 'Annuleer', onClick: onClose, disabled: busy }}
        />
      }
    >
      <div className="space-y-4 p-5" style={KERN_MODULE_TINT}>
        <BulkImpact
          count={count}
          sumPositief={sumPositief}
          sumNegatief={sumNegatief}
          variant="block"
        />

        <Filtercontext lines={filterLines} />

        {/* Kleur is hier het derde signaal, niet het eerste: icoon + kop + tekst
            dragen de boodschap ook zonder kleurwaarneming. */}
        <div className="border border-negative/50 bg-[var(--negative-bg)] px-3 py-2">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-negative">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Dit is definitief
          </p>
          <p className="mt-1 text-[12px] text-[var(--ink-2)]">
            Er is geen prullenbak en geen ongedaan-maken. Deze boekingen verdwijnen uit je
            historie, en daarmee uit je uitgaven, je spaarquote en je vrijheidsberekening.
          </p>
        </div>

        {bankLinkedCount > 0 && (
          <p className="flex items-start gap-2 text-[12px] text-[var(--ink-2)]">
            <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden />
            <span>
              {bankLinkedCount === 1
                ? 'Eén van deze transacties komt'
                : `${nlNumber.format(bankLinkedCount)} van deze transacties komen`}{' '}
              van een gekoppelde bankrekening. Bij een volgende synchronisatie kunnen ze opnieuw
              binnenkomen — verwijderen houdt ze niet buiten de deur.
            </span>
          </p>
        )}

        {splitCount > 0 && (
          <p className="flex items-start gap-2 text-[12px] text-[var(--ink-2)]">
            <GitFork className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden />
            <span>
              {splitCount === 1
                ? 'Eén transactie is gesplitst; de deelregels gaan mee.'
                : `${nlNumber.format(splitCount)} transacties zijn gesplitst; hun deelregels gaan mee.`}
            </span>
          </p>
        )}

        {/* Alleen tonen als er daadwerkelijk tegenboekingen zijn. Het aantal komt
            uit het manifest, dus "geen" is hier een feit en geen aanname — een
            keuzevakje dat niets kan doen hoort niet in een onomkeerbare
            bevestiging. */}
        {linkedCounterpartCount > 0 && (
          <label className="flex items-start gap-2 text-[12px] text-[var(--ink-2)]">
            <input
              type="checkbox"
              checked={includeLinked}
              onChange={(e) => setIncludeLinked(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-kern-600"
            />
            <span>
              Gekoppelde tegenboeking mee verwijderen ({nlNumber.format(linkedCounterpartCount)}{' '}
              erbij).{' '}
              <span className="text-[var(--ink-3)]">
                Een overboeking tussen je eigen rekeningen bestaat uit twee regels — je maakt ze
                zelf, of ze worden bij een bankimport automatisch aan elkaar geknoopt. Laat je dit
                uit, dan blijft de andere helft als losse regel achter die nergens meer in meetelt.
              </span>
            </span>
          </label>
        )}

        {needsTyping && (
          <div>
            <label htmlFor="bulk-confirm-count" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Typ het aantal over: <span className="font-mono tabular-nums">{totaal}</span>
            </label>
            <input
              id="bulk-confirm-count"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-describedby="bulk-confirm-count-help"
              className={`${FIELD_CLASS} font-mono tabular-nums`}
            />
            <p id="bulk-confirm-count-help" className="mt-1 text-[11px] text-[var(--ink-3)]">
              Boven {TYPE_TO_CONFIRM_THRESHOLD} transacties vragen we je het aantal over te typen.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
      </div>
    </ShellOverlay>
  )
}
