'use client'

/**
 * LabOpslaanBalk — de ene rij onder de vijf knoppen die zegt of je verkenning bewaard is
 * (ADR 0170). Vervangt de "Je draait aan je doel"-banner én de losse actieknoppen die in de
 * katernkop stonden: die twee zeiden hetzelfde op twee plekken, en de banner verscheen pas
 * ná het vastleggen — wie nog nooit een doel had zag nergens dat verschuiven iets kón worden.
 *
 * Presentational: de host bepaalt de toestand (`labOpslaanToestand`) uit wat er al is —
 * ligt er een doel, staat er een verkenning, wijkt die af. Onder het nu-anker legt het lab
 * nooit een doel vast (ADR 0145 D6); dan zegt de balk dát in plaats van een knop aan te
 * bieden die de route zou weigeren.
 */

import { LAB_COPY, labOpgeslagenOp } from '@/lib/horizon/anker-copy'

export type LabOpslaanToestand = 'rust' | 'nieuw' | 'opgeslagen' | 'gewijzigd' | 'nu-anker'

export interface LabOpslaanBalkProps {
  toestand: LabOpslaanToestand
  /** ISO-tijdstip waarop het doel is vastgelegd; voedt "opgeslagen op …". */
  gezetOp?: string | null
  /** Een PUT is onderweg — knoppen blokkeren tegen dubbelklik. */
  busy?: boolean
  /**
   * Mag er bijgewerkt worden? Onder een vast anker wacht een eindvermogen-doel op een bekend
   * scenario-bedrag (ADR 0145 D12 / eindreview M10); dan is er niets om vast te leggen en
   * blijft alleen herstellen over.
   */
  bijwerkenMogelijk?: boolean
  /**
   * Mag er een NIEUW doel uit deze stand komen? Dat is de promotie-gate van het lab
   * (`labPromotie`, ADR 0145 D4/D6 + D12/M10), niet "staat er een verkenning". Een kale
   * stopkeuze onder een vast anker is géén doelstand, en een eindvermogen-doel wacht op een
   * bekend scenario-bedrag — in beide gevallen zou de knop naar een sheet leiden die niets
   * kan vastleggen. Dan zegt de balk wát er nog moet gebeuren in plaats van een dood pad.
   */
  vastleggenMogelijk?: boolean
  onVastleggen: () => void
  onHerstel: () => void
  onLoslaten: () => void
  onReset: () => void
  /**
   * Waar de opslaan-actie staat (ADR 0179 D7). `inline` (standaard): alle knoppen in de balk.
   * `shell`: alle knoppen staan in de action-bar van de mobiele shell — de primaire actie
   * (Vastleggen of Bijwerken) en zijn tweede knop (`labActieBar`), en Loslaten in de extra
   * rij van die bar (één plek per actie, 27 sep). De balk toont dan alleen de statusregel.
   * Staat er niets op te slaan, dan is er geen bar en blijven de knoppen gewoon in de balk.
   */
  acties?: 'inline' | 'shell'
  /** Plaatsing van de balk (marge, breedte); standaard `mt-4` onder de knoppen. */
  className?: string
}

/** De knoppen van de opslaan-actie in de shell-action-bar (mobiel). */
export interface LabActieBar {
  primary: 'vastleggen' | 'bijwerken'
  secondary: 'reset' | 'herstel'
}

/**
 * Welke opslaan-actie hoort in de action-bar van de shell (ADR 0179 D7; spec §4.9: één knop
 * per staat, "Vastleggen" of "Bijwerken"). Alleen als er écht iets op te slaan is; anders
 * `null` — dan is er geen bar en komt de zwevende nav-pill terug.
 */
export function labActieBar(
  toestand: LabOpslaanToestand,
  { vastleggenMogelijk = true, bijwerkenMogelijk = true }: { vastleggenMogelijk?: boolean; bijwerkenMogelijk?: boolean } = {},
): LabActieBar | null {
  if (toestand === 'nieuw' && vastleggenMogelijk) return { primary: 'vastleggen', secondary: 'reset' }
  if (toestand === 'gewijzigd' && bijwerkenMogelijk) return { primary: 'bijwerken', secondary: 'herstel' }
  return null
}

/** De labels van de bar-knoppen: dezelfde teksten als in de balk. */
export const LAB_ACTIE_LABEL: Record<LabActieBar['primary'] | LabActieBar['secondary'], string> = {
  vastleggen: LAB_COPY.opslaanActieVastleggen,
  bijwerken: LAB_COPY.opslaanActieBijwerken,
  reset: LAB_COPY.opslaanActieReset,
  herstel: LAB_COPY.opslaanActieHerstel,
}

const KNOP_BASIS =
  'inline-flex min-h-[34px] items-center px-3 font-sans text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50'
const KNOP_PRIMAIR = `${KNOP_BASIS} border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:opacity-90`
const KNOP_SECUNDAIR = `${KNOP_BASIS} border border-[var(--border-md)] text-[var(--ink-2)] hover:border-[var(--ink-3)]`
const KNOP_STIL = `${KNOP_BASIS} border border-dashed border-[var(--border-md)] font-medium text-[var(--ink-3)] hover:border-[var(--ink-3)] hover:text-[var(--ink-2)]`

/** "19 september" — dezelfde nl-NL-notatie als elders in de app; ongeldig ⇒ geen datum. */
function formatGezetOp(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
}

export function LabOpslaanBalk({
  toestand,
  gezetOp = null,
  busy = false,
  bijwerkenMogelijk = true,
  vastleggenMogelijk = true,
  onVastleggen,
  onHerstel,
  onLoslaten,
  onReset,
  acties = 'inline',
  className = 'mt-4',
}: LabOpslaanBalkProps) {
  const datum = formatGezetOp(gezetOp)
  // In de shell-stand staan alle knoppen in de action-bar (ook Loslaten); hier dan alleen de status.
  const inBar = acties === 'shell' ? labActieBar(toestand, { vastleggenMogelijk, bijwerkenMogelijk }) : null
  const tekst =
    toestand === 'rust'
      ? LAB_COPY.opslaanRust
      : toestand === 'nu-anker'
        ? LAB_COPY.opslaanNuAnker
        : toestand === 'nieuw'
          ? vastleggenMogelijk
            ? LAB_COPY.opslaanNieuw
            : LAB_COPY.opslaanNogNietVastTeLeggen
          : toestand === 'gewijzigd'
            ? bijwerkenMogelijk
              ? LAB_COPY.opslaanGewijzigd
              : LAB_COPY.opslaanGewijzigdWacht
            : (datum != null ? labOpgeslagenOp(datum) : LAB_COPY.opslaanNieuw)

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="lab-opslaan-balk"
      className={`${className} flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-[var(--border-ed)] border-l-4 px-3 py-2 ${
        toestand === 'opgeslagen'
          ? 'border-l-positive'
          : toestand === 'rust' || toestand === 'nu-anker'
            ? 'border-l-[var(--border-md)]'
            : 'border-l-[var(--module-active-500)]'
      }`}
    >
      <p
        className={`m-0 font-serif text-[13px] leading-snug ${
          toestand === 'rust' ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]'
        }`}
      >
        {tekst}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {toestand === 'nieuw' && !inBar && (
          <>
            {vastleggenMogelijk && (
              <button type="button" onClick={onVastleggen} disabled={busy} className={KNOP_PRIMAIR}>
                {LAB_COPY.opslaanActieVastleggen}
              </button>
            )}
            <button type="button" onClick={onReset} disabled={busy} className={KNOP_STIL}>
              {LAB_COPY.opslaanActieReset}
            </button>
          </>
        )}
        {toestand === 'gewijzigd' && (
          <>
            {!inBar && bijwerkenMogelijk && (
              <button type="button" onClick={onVastleggen} disabled={busy} className={KNOP_PRIMAIR}>
                {LAB_COPY.opslaanActieBijwerken}
              </button>
            )}
            {!inBar && (
              <button type="button" onClick={onHerstel} disabled={busy} className={KNOP_SECUNDAIR}>
                {LAB_COPY.opslaanActieHerstel}
              </button>
            )}
            {!inBar && (
              <button type="button" onClick={onLoslaten} disabled={busy} className={KNOP_STIL}>
                {LAB_COPY.opslaanActieLoslaten}
              </button>
            )}
          </>
        )}
        {toestand === 'opgeslagen' && (
          <button type="button" onClick={onLoslaten} disabled={busy} className={KNOP_STIL}>
            {LAB_COPY.opslaanActieLoslaten}
          </button>
        )}
        {toestand === 'nu-anker' && (
          <button type="button" onClick={onReset} disabled={busy} className={KNOP_STIL}>
            {LAB_COPY.opslaanActieReset}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * De compliance-regel onder het blok — één keer per doelscenario, niet per knop. Staat hier
 * (en niet in de balk zelf) zodat de host hem onder de hele sectie kan zetten.
 */
export function LabIndicatieRegel() {
  return (
    <p data-testid="lab-indicatie" className="mt-2 font-sans text-[10px] leading-snug text-[var(--ink-4)]">
      {LAB_COPY.indicatie}
    </p>
  )
}
