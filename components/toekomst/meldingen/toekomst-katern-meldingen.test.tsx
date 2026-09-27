import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import {
  KaternMeldingSlotVoor,
  ToekomstKaternMeldingenContext,
  type KaternMeldingState,
  type ToekomstKaternMeldingenWaarde,
} from './toekomst-katern-meldingen'
import { ToekomstKaternKoppen } from '@/components/toekomst/layout/toekomst-katern-navigatie'
import {
  DOELEN_LAB_HREF,
  KATERN_MELDING_KOPIJ,
  katernKopStatus,
  wijsMeldingenToe,
  type KaternMeldingenInput,
} from '@/lib/horizon/katern-meldingen'
import {
  KATERN_VOLGORDE,
  doelenSamenvatting,
  instellingenSamenvatting,
  planSamenvatting,
  type KaternId,
} from '@/lib/horizon/katern-copy'
import { AOW_ONTBREEKT_COPY } from '@/lib/horizon/aow-notice-minimize'
import { HORIZON_MISSENDE_GEGEVENS_LABEL } from '@/lib/horizon/outcome-guard'
import { doelenPlanGewijzigdMelding } from '@/lib/horizon/anker-copy'
import { buildDeficitLoanCopy } from '@/lib/horizon/deficit-loan-copy'
import type { BannerDisplay } from '@/lib/page-status/display'
import { LEVERAGE_STATUS_DOT } from '@/lib/leverage-status'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

let segment: string | null = null
vi.mock('next/navigation', () => ({ useSelectedLayoutSegment: () => segment }))

/**
 * Meldingen per katern op /toekomst (ADR 0179 D6, spec §4.8): het slot bovenaan het
 * actieve katern en de katern-koppen met samenvatting en statuspunt. De meldingen komen
 * uit de canonieke toewijzing (`wijsMeldingenToe`), niet uit een fixture-tekst.
 */

const INVOER: KaternMeldingenInput = {
  masked: false,
  plan: null,
  tekortLening: {
    notice: { firstAge: 61.4, clearedAge: 64.2 },
    copy: buildDeficitLoanCopy({
      firstAge: 61.4,
      clearedAge: 64.2,
      terugkeerAge: null,
      housing: null,
      aowAge: 67,
      displayEndAge: 90,
      isPensioenMode: false,
      homeExcludedFromFire: false,
      geenTekortLeningAan: false,
      vastStopmoment: false,
      peakText: '€ 12.000',
      freedomText: null,
    }),
  },
  eindsituatie: null,
  labDoelenBuitenPlan: 1,
  doelen: [],
  aowOntbreekt: true,
  huisNooitVerkocht: null,
  // 27 sep: AOW staat op Plan; Instellingen houdt de gegevensmelding als eigen melding.
  ontbrekendeGegevens: ['geen-gegevens'],
}

const SAMENVATTING: Record<KaternId, string | null> = {
  plan: planSamenvatting({ kind: 'solved', doelbedragPct: 61.2 }),
  doelen: doelenSamenvatting({ stopAge: 58, zone: 'groen' }),
  instellingen: instellingenSamenvatting({ voorkeurenOpen: 2, aowOntbreekt: false }),
}

function waarde(display: Partial<Record<KaternId, BannerDisplay | 'none'>> = {}) {
  const meldingen = wijsMeldingenToe(INVOER)
  const restore = { plan: vi.fn(), doelen: vi.fn(), instellingen: vi.fn() }
  const minimize = { plan: vi.fn(), doelen: vi.fn(), instellingen: vi.fn() }
  const perKatern = {} as Record<KaternId, KaternMeldingState>
  for (const k of KATERN_VOLGORDE) {
    perKatern[k] = {
      display: display[k] ?? (meldingen[k].aantal > 0 ? 'expanded' : 'none'),
      minimize: minimize[k],
      restore: restore[k],
      samenvatting: SAMENVATTING[k],
      status: katernKopStatus(meldingen, k),
    }
  }
  const w: ToekomstKaternMeldingenWaarde = { meldingen, perKatern }
  return { w, restore, minimize }
}

beforeEach(() => {
  segment = null
})

describe('meldingenslot — per katern de juiste melding', () => {
  it('Plan: de tekort-lening, met de actie naar de ene instelling', () => {
    const { w } = waarde()
    render(<KaternMeldingSlotVoor katern="plan" waarde={w} />)
    const kaart = screen.getByTestId('katern-melding-plan-tekort-lening')
    expect(kaart).toHaveTextContent(KATERN_MELDING_KOPIJ.tekortLeningTitel(61, 64))
    expect(within(kaart).getAllByRole('link', { name: /Naar de instelling/ })[0]).toHaveAttribute(
      'href',
      '/toekomst/instellingen?rij=geen-tekort-lening',
    )
  })

  it('Doelen: "je plan is veranderd", Bijwerken naar het lab', () => {
    const { w } = waarde()
    render(<KaternMeldingSlotVoor katern="doelen" waarde={w} />)
    const kaart = screen.getByTestId('katern-melding-doelen-lab-plan')
    expect(kaart).toHaveTextContent(doelenPlanGewijzigdMelding(1))
    expect(within(kaart).getAllByRole('link', { name: /Bijwerken/ })[0]).toHaveAttribute('href', DOELEN_LAB_HREF)
  })

  it('Plan: AOW ontbreekt (in de ingeklapte rest), naar de AOW-strategie op Plan (27 sep)', () => {
    const { w } = waarde()
    expect(w.meldingen.plan.meldingen.some((m) => m.id === 'plan-aow')).toBe(true)
    const alleenAow = { ...w, meldingen: { ...w.meldingen, plan: { ...w.meldingen.plan, meldingen: w.meldingen.plan.meldingen.filter((m) => m.id === 'plan-aow'), aantal: 1 } } }
    render(<KaternMeldingSlotVoor katern="plan" waarde={alleenAow} />)
    const kaart = screen.getByTestId('katern-melding-plan-aow')
    expect(kaart).toHaveTextContent(AOW_ONTBREEKT_COPY.kop)
    expect(within(kaart).getAllByRole('link')[0]).toHaveAttribute('href', AOW_ONTBREEKT_COPY.actieHref)
  })

  it('geminimaliseerd: niets zichtbaars, de aria-live-regio blijft en Minimaliseren roept de host', () => {
    const { w, minimize } = waarde({ instellingen: 'minimized' })
    const { rerender } = render(<KaternMeldingSlotVoor katern="instellingen" waarde={w} />)
    expect(screen.queryByTestId('katern-melding-instellingen-gegevens')).toBeNull()
    expect(screen.getByTestId('katern-melding')).toHaveAttribute('aria-live', 'polite')

    const basis = waarde().w
    const open: ToekomstKaternMeldingenWaarde = {
      ...basis,
      perKatern: { ...basis.perKatern, instellingen: { ...basis.perKatern.instellingen, minimize: minimize.instellingen } },
    }
    rerender(<KaternMeldingSlotVoor katern="instellingen" waarde={open} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Minimaliseren' })[0])
    expect(minimize.instellingen).toHaveBeenCalledTimes(1)
  })
})

describe('katern-koppen — samenvatting en statuspunt', () => {
  function renderKoppen(w: ToekomstKaternMeldingenWaarde) {
    return render(
      <ToekomstKaternMeldingenContext.Provider value={w}>
        <ToekomstKaternKoppen />
      </ToekomstKaternMeldingenContext.Provider>,
    )
  }

  it('inactieve koppen dragen hun samenvatting, de actieve niet', () => {
    segment = 'doelen'
    renderKoppen(waarde().w)
    expect(screen.getByTestId('katern-kop-plan')).toHaveTextContent('61% van je doelbedrag')
    expect(screen.getByTestId('katern-kop-instellingen')).toHaveTextContent('nog 2 voorkeuren open')
    expect(screen.getByTestId('katern-kop-doelen')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('katern-kop-doelen')).not.toHaveTextContent(SAMENVATTING.doelen!)
  })

  it('een katern met een melding draagt het punt in stoplichtkleur met tekstlabel', () => {
    renderKoppen(waarde().w)
    const instellingen = screen.getByTestId('katern-kop-instellingen')
    expect(within(instellingen).getByTestId('katern-kop-punt-instellingen').className).toContain(LEVERAGE_STATUS_DOT.warn)
    expect(instellingen).toHaveAccessibleName(`Instellingen, melding: ${HORIZON_MISSENDE_GEGEVENS_LABEL}`)
    // Plan (tekort-lening) en Doelen (lab) hebben er ook één; zonder melding geen punt.
    expect(screen.getByTestId('katern-kop-punt-plan')).toBeTruthy()
  })

  it('klik op de kop van een katern met een geminimaliseerde melding klapt die weer uit', () => {
    const { w, restore } = waarde({ instellingen: 'minimized' })
    renderKoppen(w)
    fireEvent.click(screen.getByTestId('katern-kop-instellingen'))
    expect(restore.instellingen).toHaveBeenCalledTimes(1)
    // Een uitgeklapte melding wordt niet "hersteld".
    fireEvent.click(screen.getByTestId('katern-kop-plan'))
    expect(restore.plan).not.toHaveBeenCalled()
  })

  it('zonder host (buiten de provider): alleen de labels, geen punt', () => {
    render(<ToekomstKaternKoppen />)
    expect(screen.getByTestId('katern-kop-plan')).toHaveTextContent('Plan')
    expect(screen.queryByTestId('katern-kop-punt-plan')).toBeNull()
  })
})
