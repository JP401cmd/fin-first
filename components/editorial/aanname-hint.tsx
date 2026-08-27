'use client'

/**
 * AannameHint — "waarop gebaseerd?"-regel bij een afgeleid getal.
 *
 * Bedoeld voor cijfers die de app zélf heeft ingevuld omdat de gebruiker het
 * onderliggende gegeven nooit is gevraagd (bv. een hypotheek-einddatum die
 * stil op 30 jaar staat). Zo'n getal mag niet als hard feit op het scherm
 * staan: dit is de gedeelde, terughoudende affordance die de aanname
 * benoembaar én corrigeerbaar maakt.
 *
 * Vorm: een inline tekstknop met stippellijn — geen badge, geen waarschuwing.
 * Het getal blijft de hoofdzaak; de hint is een voetnoot in de krant-stijl.
 * Uitgeklapt verschijnt een kort paneel met de uitleg en (optioneel) één
 * herstelactie.
 *
 * Toon dit **alleen** wanneer de aanname er werkelijk is — de grondslag komt
 * uit een canonieke resolver (voor schulden: `lib/debt-term-basis.ts`), niet
 * uit een lokale gok van het oppervlak.
 */

import { useId, useState } from 'react'

export interface AannameHintProps {
  /** Uitleg-tekst: wat is aangenomen, en wat gebeurt er als je het corrigeert. */
  children: React.ReactNode
  /**
   * Waar de hint bij hoort — wordt in het aria-label verwerkt zodat een
   * schermlezer meerdere hints op één pagina uit elkaar kan houden.
   * Bv. "de looptijd".
   */
  subject: string
  /** Optionele herstelactie, bv. het bewerkformulier openen. */
  action?: { label: string; onClick: () => void }
  /** Extra classes op de wrapper. */
  className?: string
}

export function AannameHint({
  children,
  subject,
  action,
  className = '',
}: AannameHintProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Waarop is ${subject} gebaseerd?`}
        className="inline-flex items-center gap-1 border-b border-dotted border-[var(--module-active-700,var(--ink-3))] text-[11px] italic leading-relaxed text-[var(--ink-4)] transition-colors hover:border-[var(--module-active-500,var(--ink-2))] hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        waarop gebaseerd?
      </button>

      {/* Altijd gemount zodat een schermlezer het openen/sluiten meekrijgt. */}
      <div id={panelId} hidden={!open}>
        <div className="mt-2 border-l-[3px] border-[var(--module-active-500,var(--ink-3))] bg-[var(--subtle)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
          <p>{children}</p>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="mt-1.5 border-b border-[var(--module-active-700,var(--ink-3))] text-[11.5px] font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
