'use client'
// euro-view: dit bestand deflateert niets; de rendement-delta's zijn percentages.

/**
 * Onder het lab in katern Doelen (ADR 0179 fase 4; spec §4.7): de schaal-legenda
 * (rood · oranje · groen), het ingeklapte blok "Rendement per categorie" (de marktaannames
 * van dit scenario, alleen Volledig) en de complianceregel van het doelscenario — één keer
 * per scherm, niet per plek van het lab.
 *
 * Vroeger zaten beide in het lab zelf. Het lab staat sinds fase 4 op desktop in een smalle
 * kolom naast de grafiek en op mobiel direct onder de grafiek, waar elke regel meetelt voor
 * de één-scherm-eis; daarom staat dit hier, op beide breekpunten in de katern-module.
 */

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { LabIndicatieRegel } from '@/components/app/horizon/lab-opslaan-balk'
import { LabSchaalLegenda } from '@/components/app/horizon/lab-knoppen'
import { WhatIfMarketAssumptions } from '@/components/app/horizon/whatif-market-assumptions'
import { LAB_COPY } from '@/lib/horizon/anker-copy'
import {
  useToekomstPerspectiefContext,
  useToekomstScenarioContext,
  useToekomstSimContext,
} from '@/components/toekomst/state/toekomst-state-provider'

export function DoelenLabDetails() {
  const { verkenSectieZichtbaar } = useToekomstPerspectiefContext()
  const { whatIfBaseline, categorieReturnGroups, scenarioReturnDeltas, setScenarioReturnDeltas } =
    useToekomstScenarioContext()
  const { simResult } = useToekomstSimContext()
  const [open, setOpen] = useState(false)

  if (!simResult || !verkenSectieZichtbaar) return null
  const toonMarktbias = whatIfBaseline != null && categorieReturnGroups.length > 0
  return (
    <div className="mt-3" data-testid="doelen-lab-details">
      <LabSchaalLegenda className="mb-1" />
      {toonMarktbias && (
        <HideInSimple>
          <div className="border-t border-dashed border-[var(--border-ed)] pt-1">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex min-h-11 items-center gap-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              {LAB_COPY.marktbiasTitel}
              <ChevronDown
                aria-hidden
                className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
              />
            </button>
            {open && (
              <div className="mt-2">
                <WhatIfMarketAssumptions
                  value={scenarioReturnDeltas}
                  onChange={setScenarioReturnDeltas}
                  assetGroups={categorieReturnGroups}
                />
              </div>
            )}
          </div>
        </HideInSimple>
      )}
      <LabIndicatieRegel />
    </div>
  )
}
