'use client'

import { useId, type ReactNode } from 'react'
import { ResilienceTrendChart, FireAgeTrendChart } from '@/components/app/horizon/horizon-helpers'
import {
  detectEngineBronTransition,
  detectGrondslagBreuk,
  detectScoreVersionTransition,
  formatTransitionDate,
  type HealthVerloopPunt,
} from '@/lib/health-verloop'

const LEEFTIJD_FORMAAT = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 })
const DAG_FORMAAT = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** 'YYYY-MM-DD' → "30 augustus 2026", tijdzone-onafhankelijk. */
function formatDag(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return DAG_FORMAAT.format(new Date(Date.UTC(y, m - 1, d)))
}

function Reeks({ titel, testId, children }: { titel: string; testId: string; children: ReactNode }) {
  return (
    <div data-testid={testId} className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">{titel}</h4>
      {children}
    </div>
  )
}

function Voetregel({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <p data-testid={testId} className="text-[11px] leading-snug text-[var(--ink-3)]">
      {children}
    </p>
  )
}

/**
 * Sectie "Verloop" van de gezondheidskassabon: per maand het gezondheidsgetal
 * en de vrijheidsleeftijd zoals ze toen berekend werden, over de laatste twaalf
 * kalendermaanden, geplot op datum.
 *
 * Leest uitsluitend de opgeslagen maandstanden (`HealthVerloopPunt`); rekent
 * niets opnieuw uit. Een wisseling van `score_version` wordt gemarkeerd (andere
 * rekenmethode = niet vergelijkbaar), een wisseling van `engine_bron` krijgt de
 * bestaande "rekenwijze gewijzigd"-regel. Wordt lazy geladen zodra de kassabon
 * opengaat.
 */
export function HealthScoreVerloop({ punten }: { punten: readonly HealthVerloopPunt[] }) {
  const headingId = useId()
  const metScore = punten.filter((p) => p.resilience_score !== null)
  const metLeeftijd = punten.filter((p) => p.fire_age !== null)
  const versieWissel = detectScoreVersionTransition(metScore)
  const motorWissel = detectEngineBronTransition(metLeeftijd)
  const lopendeMaandLive = punten.some((p) => p.live)
  const grondslagBreuk = detectGrondslagBreuk(metScore)

  return (
    <section
      aria-labelledby={headingId}
      data-testid="health-verloop"
      className="space-y-4 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] p-4"
    >
      <div>
        <h3 id={headingId} className="text-xs font-semibold text-[var(--ink-2)]">
          Verloop
        </h3>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]" data-testid="health-verloop-ondertitel">
          {lopendeMaandLive
            ? 'De laatste stand van elke maand over de laatste twaalf maanden; voor deze maand je huidige stand.'
            : 'De laatste stand van elke maand, over de laatste twaalf maanden.'}
        </p>
      </div>

      {punten.length === 0 ? (
        <Voetregel testId="health-verloop-leeg">
          Er zijn nog geen maandstanden; het verloop groeit mee met elke maand.
        </Voetregel>
      ) : (
        <>
          <Reeks titel="Gezondheidsgetal" testId="health-verloop-gezondheid">
            {metScore.length >= 2 ? (
              <ResilienceTrendChart
                snapshots={metScore}
                markers={
                  grondslagBreuk
                    ? [{ date: grondslagBreuk, label: 'budgettelling aangepast', testId: 'grondslag-breuk-marker' }]
                    : []
                }
              />
            ) : metScore.length === 1 ? (
              <Voetregel testId="health-verloop-gezondheid-een-punt">
                Eén maandstand tot nu toe: {metScore[0].resilience_score} van 100 in{' '}
                {formatTransitionDate(metScore[0].snapshot_date)}.
              </Voetregel>
            ) : (
              <Voetregel testId="health-verloop-gezondheid-leeg">
                De maandstanden bevatten nog geen gezondheidsgetal.
              </Voetregel>
            )}
            {grondslagBreuk && metScore.length >= 2 && (
              <Voetregel testId="health-verloop-grondslagbreuk">
                Op {formatDag(grondslagBreuk)} veranderde hoe het budgetdeel van het gezondheidsgetal je uitgaven
                telt: inkomsten en overboekingen tussen je eigen rekeningen tellen sindsdien niet meer mee. Een knik
                rond die datum kan daardoor komen.
              </Voetregel>
            )}
            {versieWissel && (
              <Voetregel testId="health-verloop-versiewissel">
                De rekenmethode van het gezondheidsgetal veranderde in {formatTransitionDate(versieWissel)}.
                Standen van daarvóór zijn niet met latere te vergelijken.
              </Voetregel>
            )}
          </Reeks>

          <Reeks titel="Vrijheidsleeftijd" testId="health-verloop-vrijheidsleeftijd">
            {metLeeftijd.length >= 2 ? (
              <FireAgeTrendChart snapshots={metLeeftijd} />
            ) : metLeeftijd.length === 1 ? (
              <Voetregel testId="health-verloop-vrijheidsleeftijd-een-punt">
                Eén maandstand tot nu toe: {LEEFTIJD_FORMAAT.format(metLeeftijd[0].fire_age as number)} jaar in{' '}
                {formatTransitionDate(metLeeftijd[0].snapshot_date)}.
              </Voetregel>
            ) : (
              <Voetregel testId="health-verloop-vrijheidsleeftijd-leeg">
                De maandstanden bevatten nog geen vrijheidsleeftijd.
              </Voetregel>
            )}
            {metLeeftijd.length > 0 && (
              <Voetregel testId="health-verloop-fire-uitleg">
                Dit is de vrijheidsleeftijd zoals hij toen berekend werd, met de cijfers en aannames van dat
                moment. Je huidige vrijheidsleeftijd kan daarvan afwijken.
              </Voetregel>
            )}
            {motorWissel && (
              <Voetregel testId="engine-bron-transition-note">
                Rekenwijze gewijzigd in {formatTransitionDate(motorWissel)} — een knik in de lijn kan daardoor komen.
              </Voetregel>
            )}
          </Reeks>
        </>
      )}
    </section>
  )
}
