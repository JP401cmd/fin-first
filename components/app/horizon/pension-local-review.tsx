'use client'

// ── Reviewstap voor het LOKAAL uitgelezen pensioenoverzicht ───────────────────
//
// WAAROM DEZE STAP BESTAAT. Het cloud-pad past het resultaat direct toe
// (onboarding-upo-section.tsx → applyPensionParseResult): daar kijkt een groot
// multimodaal model naar de échte PDF-opmaak. Het lokale pad heeft die opmaak
// niet. pdfjs' `getTextContent()` levert fragmenten in contentstream-volgorde,
// niet in visuele kolomvolgorde — bij een UPO-tabel met labels links en bedragen
// rechts kan de koppeling label↔bedrag dus verschuiven, en een 2B-model
// corrigeert dat niet. Deze bedragen landen in het Horizon-pensioenmodel; direct
// toepassen is daar te ruim voor.
//
// Vandaar: niets wordt overgenomen zonder dat de gebruiker het heeft gezien en
// bevestigd. Regelingen met een 'minder zeker'-veld staan standaard UIT — in de
// geest van de tweetraps-drempel uit local-categorize-resolver.ts, waar een lage
// zekerheid ook geen stille gok oplevert maar een zichtbaar "kon niet plaatsen".

import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import type { PensionParseResult } from '@/lib/pension/types'
import type { PensionOnzekerVeld } from '@/lib/ai/local/local-pension-parse'

interface PensionLocalReviewProps {
  result: PensionParseResult
  /** Per regeling (zelfde volgorde als `result.regelingen`) de onzekere velden. */
  onzeker: PensionOnzekerVeld[][]
  /** Aantal onderdelen dat op een sanity-grens is afgevallen. */
  afgevallen: number
  /** Bevestigd — levert het resultaat mét alleen de aangevinkte regelingen. */
  onConfirm: (result: PensionParseResult) => void
  onCancel: () => void
}

/** Korte, menselijke naam per veld — dit staat als badge naast de regeling. */
const VELD_LABEL: Record<PensionOnzekerVeld, string> = {
  fondsNaam: 'naam',
  brutoBedrag: 'bedrag',
  ingangLeeftijd: 'leeftijd',
  isGeindexeerd: 'indexatie',
  type: 'soort',
}

const TYPE_LABEL: Record<PensionParseResult['regelingen'][number]['type'], string> = {
  ouderdomspensioen: 'Ouderdomspensioen',
  nabestaandenpensioen: 'Nabestaandenpensioen',
  arbeidsongeschiktheidspensioen: 'Arbeidsongeschiktheidspensioen',
  overig: 'Overig',
}

function euroPerMaand(bedrag: number): string {
  return `€ ${Math.round(bedrag).toLocaleString('nl-NL')}/mnd`
}

export function PensionLocalReview({
  result,
  onzeker,
  afgevallen,
  onConfirm,
  onCancel,
}: PensionLocalReviewProps) {
  // Standaardselectie: alleen wat volledig zeker is gelezen. Een regeling met
  // ook maar één 'minder zeker'-veld vraagt een bewuste klik van de gebruiker.
  const [geselecteerd, setGeselecteerd] = useState<Set<number>>(
    () => new Set(result.regelingen.map((_, i) => i).filter((i) => (onzeker[i]?.length ?? 0) === 0)),
  )

  const toggle = useCallback((index: number) => {
    setGeselecteerd((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const bevestig = useCallback(() => {
    const regelingen = result.regelingen.filter((_, i) => geselecteerd.has(i))
    // Nabestaandenpensioen opnieuw afleiden uit de SELECTIE — anders blijft er
    // een totaal staan dat bij niet-overgenomen regelingen hoort.
    const nabestaanden = regelingen
      .filter((r) => r.type === 'nabestaandenpensioen')
      .reduce((sum, r) => sum + r.brutoBedrag, 0)
    onConfirm({
      ...result,
      regelingen,
      nabestaandenpensioen: nabestaanden > 0 ? nabestaanden : null,
    })
  }, [result, geselecteerd, onConfirm])

  const aantalOnzeker = useMemo(
    () => onzeker.filter((velden) => velden.length > 0).length,
    [onzeker],
  )

  return (
    <div className="mt-3 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/30 p-3">
      <p className="text-sm font-medium text-[var(--ink)]">Controleer wat we hebben gelezen</p>
      <p className="mt-1 text-xs leading-snug text-[var(--ink-3)]">
        Dit overzicht is volledig op je eigen apparaat uitgelezen. De opmaak van een PDF gaat
        daarbij verloren, dus bedragen kunnen bij de verkeerde regeling terechtkomen. Vink aan wat
        klopt — alleen dat nemen we over.
      </p>

      {(aantalOnzeker > 0 || afgevallen > 0) && (
        <p className="mt-2 flex items-start gap-1.5 rounded-[var(--r)] bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            {aantalOnzeker > 0 && (
              <>
                {aantalOnzeker} regeling{aantalOnzeker === 1 ? '' : 'en'} kon
                {aantalOnzeker === 1 ? '' : 'den'} we niet met zekerheid lezen; die staan uit.{' '}
              </>
            )}
            {afgevallen > 0 && (
              <>
                {afgevallen} onderdeel{afgevallen === 1 ? '' : 'en'} viel af omdat het bedrag
                onwaarschijnlijk was.
              </>
            )}
          </span>
        </p>
      )}

      {/* AOW — geen keuzevakje: dit is een eigen veld in het contract en wordt
          pas op expliciet verzoek in de editor overgenomen (applyAowFromParseResult). */}
      {result.aowBedrag != null && result.aowBedrag > 0 && (
        <div className="mt-3 flex items-center justify-between border-t border-horizon-100 pt-2 text-xs">
          <span className="text-[var(--ink-2)]">AOW (verwacht)</span>
          <span className="font-mono tabular-nums text-[var(--ink)]">
            {euroPerMaand(result.aowBedrag)}
          </span>
        </div>
      )}

      <ul className="mt-2 space-y-1.5">
        {result.regelingen.map((regeling, i) => {
          const velden = onzeker[i] ?? []
          const aan = geselecteerd.has(i)
          return (
            <li key={`${regeling.fondsNaam}-${i}`}>
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--r)] border p-2 transition-colors ${
                  aan
                    ? 'border-horizon-300 bg-[var(--paper)]'
                    : 'border-[var(--border-md)] bg-[var(--subtle)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={aan}
                  onChange={() => toggle(i)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-horizon-500)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-[var(--ink)]">
                      {regeling.fondsNaam}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink)]">
                      {euroPerMaand(regeling.brutoBedrag)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[var(--ink-3)]">
                    {TYPE_LABEL[regeling.type]} · vanaf {regeling.ingangLeeftijd} jaar ·{' '}
                    {regeling.isGeindexeerd ? 'waardevast' : 'niet geïndexeerd'}
                  </span>
                  {velden.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {velden.map((veld) => (
                        <span
                          key={veld}
                          className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800"
                        >
                          {VELD_LABEL[veld]}: minder zeker
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {/* Primaire actie onderin, niet meescrollend in een lange lijst. */}
      <div className="mt-3 flex gap-2 border-t border-horizon-100 pt-2.5">
        <button
          type="button"
          onClick={bevestig}
          disabled={geselecteerd.size === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] bg-horizon-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-horizon-700 disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          {geselecteerd.size === 0
            ? 'Niets geselecteerd'
            : `Overnemen (${geselecteerd.size})`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center justify-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          <X className="h-3.5 w-3.5" />
          Annuleren
        </button>
      </div>
    </div>
  )
}
