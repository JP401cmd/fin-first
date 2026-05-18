'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, FileText, Check } from 'lucide-react'
import { PensionPdfUpload } from '@/components/app/horizon/pension-pdf-upload'

/**
 * Parsed pension data shape — matches the API response from /api/pension/parse.
 */
export interface PensionParseData {
  aowBedrag: number | null
  regelingen: Array<{
    fondsNaam: string
    brutoBedrag: number
    ingangLeeftijd: number
    isGeindexeerd: boolean
    type: string
  }>
  nabestaandenpensioen: number | null
  samenvatting: string
}

interface OnboardingUpoSectionProps {
  /** Parsed pension data — null when nothing uploaded yet. */
  pensionData: PensionParseData | null
  /** Callback when UPO is parsed successfully. */
  onParsed: (data: PensionParseData) => void
  /** Callback when UPO is removed/cleared. */
  onRemoved: () => void
}

/**
 * Optionele UPO-upload sectie binnen de inkomen-stap.
 *
 * Toont een collapsible kaart waarmee de gebruiker een Uniform
 * Pensioenoverzicht (UPO) kan uploaden. Na parsing worden AOW-bedrag en
 * werknemerspensioen getoond als automatisch ingevulde velden.
 *
 * Volledig optioneel — overslaan blokkeert de flow niet.
 */
export function OnboardingUpoSection({
  pensionData,
  onParsed,
  onRemoved,
}: OnboardingUpoSectionProps) {
  const [expanded, setExpanded] = useState(!!pensionData)

  const hasResult = !!pensionData
  const ouderdomsRegelingen = pensionData?.regelingen.filter(
    (r) => r.type === 'ouderdomspensioen'
  ) ?? []
  const totalPension = ouderdomsRegelingen.reduce((sum, r) => sum + r.brutoBedrag, 0)

  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)]">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-horizon-500" />
          <span className="text-sm font-medium text-[var(--ink-2)]">
            Pensioenoverzicht uploaden
          </span>
          {hasResult && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <Check className="h-3 w-3" />
              Ingevuld
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[var(--ink-4)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--ink-4)]" />
        )}
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="border-t border-[var(--border-ed)] px-4 pb-4 pt-3">
          {/* Explanation */}
          <p
            className="mb-3 text-xs italic text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Upload je UPO van{' '}
            <span className="font-medium not-italic text-[var(--ink-2)]">
              mijnpensioenoverzicht.nl
            </span>{' '}
            — we vullen je pensioeninkomen automatisch in. Niet verplicht.
          </p>

          {/* Upload area */}
          <PensionPdfUpload
            onParseResult={(result) => {
              const data = result as PensionParseData
              onParsed(data)
            }}
            onFileRemoved={onRemoved}
          />

          {/* Parsed result summary */}
          {hasResult && (
            <div className="mt-3 space-y-2 rounded-[var(--r)] border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-xs font-medium text-emerald-800">
                Automatisch ingevuld:
              </p>
              <div className="space-y-1.5">
                {pensionData.aowBedrag != null && pensionData.aowBedrag > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--ink-2)]">AOW (verwacht)</span>
                    <span className="font-mono tabular-nums text-[var(--ink)]">
                      € {Math.round(pensionData.aowBedrag).toLocaleString('nl-NL')}/mnd
                    </span>
                  </div>
                )}
                {totalPension > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--ink-2)]">
                      Werknemerspensioen
                      {ouderdomsRegelingen.length > 1
                        ? ` (${ouderdomsRegelingen.length} regelingen)`
                        : ouderdomsRegelingen[0]?.fondsNaam
                          ? ` — ${ouderdomsRegelingen[0].fondsNaam}`
                          : ''}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--ink)]">
                      € {Math.round(totalPension).toLocaleString('nl-NL')}/mnd
                    </span>
                  </div>
                )}
                {ouderdomsRegelingen.length > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--ink-2)]">Pensioenleeftijd</span>
                    <span className="font-mono tabular-nums text-[var(--ink)]">
                      {ouderdomsRegelingen[0].ingangLeeftijd} jaar
                    </span>
                  </div>
                )}
              </div>
              {pensionData.samenvatting && (
                <p
                  className="mt-2 border-t border-emerald-100 pt-2 text-[11px] italic text-emerald-700"
                  style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                >
                  {pensionData.samenvatting}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
