'use client'

import { ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import {
  JAARRUIMTE_OPBOUW_PCT,
  JAARRUIMTE_FRANCHISE_2026,
  JAARRUIMTE_MAX_2026,
  JAARRUIMTE_FACTOR_A_IMPUTATIE,
} from '@/lib/jaarruimte'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'

/**
 * JaarruimteRekensom — de "De rekensom"-alinea van het jaarruimte-uitlegblok
 * op /overzicht/belasting/box1 (S12).
 *
 * WAAROM MODUS-AFHANKELIJK. Secties I/II/III van die pagina hangen in
 * `HideInSimple`, sectie IV (jaarruimte) bewust niet — `#jaarruimte-uitleg` is
 * een live deeplink-doel vanuit de optimizer, de coach-suggesties en de
 * aandachtspunten. Gevolg: in Eenvoudig is dit blok vrijwel de hele pagina
 * onder de hero, en was "30% × (inkomen − € 19.172) − 6,27 × factor A" daar
 * niet één expert-detail tussen veel, maar hét dominante tekstblok.
 *
 *   'simple' → één zin in gewone taal + een <details>-uitklap met de exacte
 *              formule. Duiding boven reductie: de som verdwijnt niet, hij
 *              gaat achter een klik en krijgt er een begrijpelijke zin bij.
 *   'full'   → de formule inline, precies zoals hij was (een expert leest
 *              liever de som dan de omschrijving; geen verlies).
 *
 * `<details>`/`<summary>` bewust i.p.v. een div met onClick: toetsenbord- en
 * schermlezer-vriendelijk zonder client-state. Precedent in de repo:
 * `cashflow-instellingen-blok.tsx` ("Zo rekenen we je spaarquote").
 *
 * GEEN NIEUWE FINANCIËLE CONSTANTEN. De afgeronde bedragen in de gewone zin
 * worden AFGELEID uit `JAARRUIMTE_FRANCHISE_2026` / `JAARRUIMTE_MAX_2026`
 * (lib/jaarruimte.ts). Een letterlijke 19000/35600 in de tekst zou een tweede
 * bron zijn die stil uit de pas loopt bij een fiscale wijziging.
 *
 * H23-GRENS: de gewone zin is REGEL-beschrijvend ("de regel is…"), niet
 * uitkomst-beschrijvend. Zolang factor A onbekend is toont de app bewust een
 * bovengrens vóór aftrek van het werkgeverspensioen; de zin mag dus niet
 * suggereren dat die aftrek al verwerkt is. Het kaderende "Wat je hieronder
 * ziet"-blok eronder doet die uitspraak wél, en blijft daarvoor de plek.
 *
 * De Wft-regel ("Indicatie, geen advies — het bindende bedrag bereken je met
 * de officiële rekenhulp") staat bewust BUITEN dit component, onderaan het
 * uitlegblok: die moet in beide modi zichtbaar zijn en mag nooit achter een
 * uitklap verdwijnen.
 */
export function JaarruimteRekensom() {
  const { mode } = useDisplayMode()

  const opbouwPct = Math.round(JAARRUIMTE_OPBOUW_PCT * 100)
  // Afgeleide, "ongeveer"-bedragen voor de gewone zin — geen tweede bron.
  const franchiseRond = Math.round(JAARRUIMTE_FRANCHISE_2026 / 1000) * 1000
  const maxRond = Math.round(JAARRUIMTE_MAX_2026 / 100) * 100

  const kopje = (
    <p className="mt-4 mb-1 font-mono text-[10px] uppercase tracking-[0.18em] not-italic text-[var(--ink-3)]">
      De rekensom
    </p>
  )

  const formuleRegel = (
    <span className="font-mono not-italic tabular-nums text-[var(--ink)]">
      {opbouwPct}% × (inkomen − {formatCurrency(JAARRUIMTE_FRANCHISE_2026)}) −{' '}
      {JAARRUIMTE_FACTOR_A_IMPUTATIE} × factor A
    </span>
  )

  const capNuance = (
    <>
      , afgetopt op {formatCurrency(JAARRUIMTE_MAX_2026)} per persoon. Dat
      maximum is de gepubliceerde referentiewaarde; je exact berekende ruimte
      kan er door afronding een euro onder liggen.
    </>
  )

  if (mode === 'full') {
    return (
      <>
        {kopje}
        <p>
          Voor 2026: {formuleRegel}
          {capNuance}
        </p>
      </>
    )
  }

  return (
    <>
      {kopje}
      <p>
        De regel: je mag ongeveer {opbouwPct}% opzij zetten van het deel van je
        inkomen bóven een drempel van zo&apos;n {formatCurrency(franchiseRond)},
        min wat je via je werkgever al aan pensioen opbouwt. Met een maximum van
        ongeveer {formatCurrency(maxRond)} per jaar.
      </p>
      <details className="group mt-2">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium not-italic text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-3)] [&::-webkit-details-marker]:hidden">
          <ChevronDown
            className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
          Zo rekenen we je jaarruimte
        </summary>
        <p className="mt-1.5 text-[13px] leading-relaxed">
          Voor 2026: {formuleRegel}
          {capNuance}
        </p>
      </details>
    </>
  )
}
