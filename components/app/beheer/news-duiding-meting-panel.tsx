'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Gauge } from 'lucide-react'
import type { SteekproefRegister, WeekMeting } from '@/lib/krant/duiding-beheer'
import {
  doelgroepAfwijzingen,
  g7Gehaald as berekenG7Gehaald,
  poortRedenLabel,
  steekproefWeekGehaald,
  STEEKPROEF_MAX_FOUTEN,
  STEEKPROEF_OMVANG,
  STEEKPROEF_VELD_UITLEG,
  STEEKPROEF_WEKEN_OP_RIJ,
  TERUGTREK_REDEN_LABEL,
} from '@/lib/krant/duiding-beheer'
import { TERUGTREK_REDENEN } from '@/lib/krant/duiding-schema'

/**
 * Meting van de duiding op `/beheer/nieuws` — de K1-poort van kaart 1A en de
 * zeven poortmaten van 1F (B30):
 *
 *   G1–G3 · G6  de tekstpoort: hoeveel samenvattingen NIET zijn vrijgegeven en
 *               waarop ze vielen (`poort.perReden`), plus de G6-helft die hard
 *               afwijst (`doelgroep:ongegrond:*` in `afgewezenPerCode`).
 *   G4          kwam de kop van de bron? Nul by construction — daarom geteld en
 *               niet aangenomen.
 *   G5          waar de grondslag vandaan kwam (eigen fragment of alleen de
 *               bronkop), plus hetzelfde drift-getal voor "nooit modeltekst".
 *   G7          de wekelijkse handmatige steekproef. Dat is de énige van de
 *               zeven die geen berekening is maar een oordeel; daarom staat het
 *               invoerformulier hieronder, en niet ergens anders.
 *
 * Alleen weergave: elk getal komt uit `GET /api/admin/news-duiding/meting`
 * (`bouwDuidingMeting`, tellingen over `news_articles`). Hier wordt niets
 * herberekend behalve de opmaak van een aandeel als percentage; `g7Gehaald`
 * wordt na een invoer opnieuw bepaald met DEZELFDE functie die de route
 * gebruikt, zodat de twee niet uit elkaar kunnen lopen.
 */

function pct(aandeel: number | null): string {
  return aandeel === null ? '—' : `${Math.round(aandeel * 100)}%`
}

/** Stoplicht-semantiek (nooit een module-accent), met het oordeel óók in woorden. */
function PoortStand({ label, gehaald, toelichting }: { label: string; gehaald: boolean; toelichting: string }) {
  return (
    <div className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${gehaald ? 'bg-[var(--positive)]' : 'bg-[var(--warning)]'}`}
      />
      <p className="text-xs text-[var(--ink-3)]">
        <span className="font-medium text-[var(--ink-2)]">{label}</span>{' '}
        <span className={gehaald ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}>
          {gehaald ? 'gehaald' : 'nog niet gehaald'}
        </span>{' '}
        — {toelichting}
      </p>
    </div>
  )
}

export function NewsDuidingMetingPanel({ ververs }: { ververs: number }) {
  const [weken, setWeken] = useState<WeekMeting[] | null>(null)
  const [steekproef, setSteekproef] = useState<SteekproefRegister>({})
  const [g7, setG7] = useState(false)
  const [afgekapt, setAfgekapt] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let actief = true
    // De state wordt pas ná de fetch gezet (asynchroon), niet synchroon in het effect.
    fetch('/api/admin/news-duiding/meting')
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!actief) return
        if (!res.ok) {
          setFout(typeof body?.error === 'string' ? body.error : 'Ophalen mislukt')
          return
        }
        setFout(null)
        setWeken(Array.isArray(body?.weken) ? (body.weken as WeekMeting[]) : [])
        setAfgekapt(Boolean(body?.afgekapt))
        setSteekproef((body?.steekproef ?? {}) as SteekproefRegister)
        setG7(Boolean(body?.g7Gehaald))
      })
      .catch(() => {
        if (actief) setFout('Ophalen mislukt')
      })
    return () => {
      actief = false
    }
  }, [ververs])

  /**
   * Na een invoer: het register komt uit de route terug, en `g7Gehaald` leiden
   * we er hier opnieuw uit af met de gedeelde functie. Geen tweede rondgang
   * langs de server, en geen eigen som — het is letterlijk dezelfde regel.
   */
  const nieuwRegister = useCallback(
    (register: SteekproefRegister) => {
      setSteekproef(register)
      setG7(berekenG7Gehaald(register, (weken ?? []).map((w) => w.week)))
    },
    [weken],
  )

  const drift = (weken ?? []).reduce((som, w) => som + w.kopNietVanBron + w.metModeltekst, 0)

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center gap-2">
        <Gauge className="h-5 w-5 text-[var(--ink-3)]" />
        <h3 className="text-lg font-bold text-[var(--ink)]">Meting duiding</h3>
      </div>
      <p className="mb-4 text-sm text-[var(--ink-3)]">
        Per week (op de dag dat het artikel binnenkwam). De poort: twee weken achter elkaar nul foute getallen bij
        rekenende mechanismen. Loop daarvoor de geduide artikelen met een rekenend mechanisme na (filter hieronder) en
        trek een duiding met een fout getal terug met reden &quot;Fout getal&quot;. Artikelen ouder dan 120 dagen worden
        opgeruimd en vallen uit de meting. De categorie is die van de ingest (een indeling, geen controle-uitkomst).
      </p>
      <p className="mb-4 text-sm text-[var(--ink-3)]">
        De poortmaten van de grondslag staan per week in de kolom <span className="font-medium">Poort</span> en, met de
        reden erbij, in de details van een week: G1 tot en met G3 en G6 zijn de controles die de app zelf draait, G4 en
        G5 tonen waar kop en grondslag vandaan kwamen, en G7 is de steekproef die je hieronder zelf vastlegt.
      </p>

      {fout ? (
        <p role="alert" className="text-sm text-[var(--negative)]">
          {fout}
        </p>
      ) : weken === null ? (
        <p className="text-sm text-[var(--ink-4)]">Laden...</p>
      ) : weken.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-6 py-8 text-center text-sm text-[var(--ink-4)]">
          Nog geen artikelen in deze periode.
        </div>
      ) : (
        <>
          {afgekapt && (
            <p role="alert" className="mb-2 text-xs text-[var(--warning)]">
              Niet alle rijen konden worden gelezen — de oudste weken zijn onvolledig.
            </p>
          )}

          <div className="mb-3 space-y-1.5 border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-3">
            <PoortStand
              label="G4 · G5 — kop en grondslag komen van de bron:"
              gehaald={drift === 0}
              toelichting={
                drift === 0
                  ? 'geen enkele geduide rij draagt een modelkop of modeltekst als grondslag.'
                  : `${drift} rij(en) wijken af. Dat kan niet zonder een schemawijziging — zoek dit uit vóór er iets vrijkomt.`
              }
            />
            <PoortStand
              label="G7 — handmatige steekproef:"
              gehaald={g7}
              toelichting={`hoogstens ${STEEKPROEF_MAX_FOUTEN} fout per ${STEEKPROEF_OMVANG} nagelezen samenvattingen, ${STEEKPROEF_WEKEN_OP_RIJ} weken op rij. Leg je telling hieronder vast.`}
            />
          </div>

          <div className="overflow-x-auto border border-[var(--border-ed)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)] text-left text-[var(--ink-3)]">
                  <th className="px-3 py-2.5 font-medium">Week</th>
                  <th className="px-3 py-2.5 text-right font-medium">Binnen</th>
                  <th className="px-3 py-2.5 text-right font-medium">Geduid</th>
                  <th className="px-3 py-2.5 text-right font-medium">Dekking</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Rekenend</th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Samenvattingen die de tekstpoort niet haalden (G1–G3, G6)">
                    Poort
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">Teruggetr.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Fout getal</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Afgewezen</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Wacht / mislukt</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell" title="Handmatige steekproef: fout / nagelezen">
                    G7
                  </th>
                  <th className="w-8 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-ed)] font-mono tabular-nums">
                {weken.map((w) => {
                  const isOpen = open === w.week
                  const proef = steekproef[w.week]
                  return (
                    <Fragment key={w.week}>
                      <tr
                        className="cursor-pointer transition-colors hover:bg-[var(--subtle)]"
                        onClick={() => setOpen(isOpen ? null : w.week)}
                      >
                        <td className="px-3 py-2 text-[var(--ink)]">{w.week}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-3)]">{w.binnen}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-2)]">{w.geduid}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-2)]">{pct(w.dekking)}</td>
                        <td className="hidden px-3 py-2 text-right text-[var(--ink-3)] sm:table-cell">{w.rekenend}</td>
                        <td className="px-3 py-2 text-right text-[var(--ink-3)]">
                          {w.poort.gedegradeerd}/{w.poort.groen + w.poort.gedegradeerd}
                        </td>
                        <td className="px-3 py-2 text-right text-[var(--ink-3)]">{w.teruggetrokkenTotaal}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            w.foutGetalRekenend > 0 ? 'text-[var(--negative)]' : 'text-[var(--ink-2)]'
                          }`}
                        >
                          {w.foutGetalRekenend}
                        </td>
                        <td className="hidden px-3 py-2 text-right text-[var(--ink-3)] sm:table-cell">{w.afgewezenTotaal}</td>
                        <td className="hidden px-3 py-2 text-right text-[var(--ink-3)] lg:table-cell">
                          {w.wacht} / {w.mislukt}
                        </td>
                        <td
                          className={`hidden px-3 py-2 text-right lg:table-cell ${
                            proef === undefined
                              ? 'text-[var(--ink-4)]'
                              : steekproefWeekGehaald(proef)
                                ? 'text-[var(--positive)]'
                                : 'text-[var(--warning)]'
                          }`}
                        >
                          {proef === undefined ? '—' : `${proef.fouten} / ${proef.gecontroleerd}`}
                        </td>
                        <td className="px-2 py-2 text-[var(--ink-4)]">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={`Details week ${w.week}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpen(isOpen ? null : w.week)
                            }}
                          >
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={12} className="bg-[var(--subtle)]/50 px-4 py-3 font-sans">
                            <WeekDetail w={w} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <SteekproefFormulier
            weken={weken.map((w) => w.week)}
            steekproef={steekproef}
            onGeschreven={nieuwRegister}
          />
        </>
      )}
    </div>
  )
}

function WeekDetail({ w }: { w: WeekMeting }) {
  const categorieen = Object.entries(w.perCategorie).sort((a, b) => b[1].geduid - a[1].geduid)
  const codes = Object.entries(w.afgewezenPerCode).sort((a, b) => b[1] - a[1])
  const redenen = Object.entries(w.poort.perReden).sort((a, b) => b[1] - a[1])
  const doelgroepFouten = doelgroepAfwijzingen(w.afgewezenPerCode)
  const herkomstDrift = w.kopNietVanBron + w.metModeltekst
  return (
    <div className="grid gap-4 text-xs sm:grid-cols-2">
      <div>
        <h4 className="mb-1 font-medium text-[var(--ink-3)]">Dekking per categorie</h4>
        {categorieen.length === 0 ? (
          <p className="text-[var(--ink-4)]">Niets geduid.</p>
        ) : (
          <ul className="space-y-0.5">
            {categorieen.map(([cat, t]) => (
              <li key={cat} className="flex justify-between gap-3">
                <span className="text-[var(--ink-2)]">{cat}</span>
                <span className="font-mono tabular-nums text-[var(--ink-3)]">
                  {t.metMechanisme}/{t.geduid} · {pct(t.dekking)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[var(--ink-4)]">
          Mechanisme vervallen op een controle: <span className="font-mono tabular-nums">{w.mechanismeVervallen}</span>
        </p>
      </div>
      <div className="space-y-3">
        <div>
          <h4 className="mb-1 font-medium text-[var(--ink-3)]">Teruggetrokken per reden</h4>
          <ul className="space-y-0.5">
            {TERUGTREK_REDENEN.map((r) => (
              <li key={r} className="flex justify-between gap-3">
                <span className="text-[var(--ink-2)]">{TERUGTREK_REDEN_LABEL[r]}</span>
                <span className="font-mono tabular-nums text-[var(--ink-3)]">{w.teruggetrokken[r]}</span>
              </li>
            ))}
          </ul>
        </div>
        {codes.length > 0 && (
          <div>
            <h4 className="mb-1 font-medium text-[var(--ink-3)]">Afgewezen per foutcode</h4>
            <ul className="space-y-0.5">
              {codes.map(([code, n]) => (
                <li key={code} className="flex justify-between gap-3">
                  <span className="font-mono text-[var(--ink-2)]">{code}</span>
                  <span className="font-mono tabular-nums text-[var(--ink-3)]">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="sm:col-span-2">
        <h4 className="mb-1 font-medium text-[var(--ink-3)]">
          Tekstpoort (G1 · G2 · G3 · G6) — <span className="font-mono tabular-nums">{w.poort.groen}</span> vrijgegeven,{' '}
          <span className="font-mono tabular-nums">{w.poort.gedegradeerd}</span> zonder samenvatting
        </h4>
        <p className="mb-1 text-[var(--ink-4)]">
          Een rij zonder samenvatting blijft geduid: de lezer krijgt de bronkop en de link. Dit getal telt dus wat de
          poort tegenhield, niet wat er misging.
        </p>
        {redenen.length === 0 && doelgroepFouten.length === 0 ? (
          <p className="text-[var(--ink-4)]">Geen enkele samenvatting gedegradeerd of afgewezen op de doelgroep.</p>
        ) : (
          <ul className="space-y-0.5">
            {redenen.map(([code, n]) => (
              <li key={code} className="flex justify-between gap-3">
                <span className="text-[var(--ink-2)]">{poortRedenLabel(code)}</span>
                <span className="font-mono tabular-nums text-[var(--ink-3)]">{n}</span>
              </li>
            ))}
            {doelgroepFouten.map(([code, n]) => (
              <li key={code} className="flex justify-between gap-3">
                <span className="text-[var(--ink-2)]">
                  G6 · doelgroep niet in de bron <span className="font-mono text-[var(--ink-4)]">({code})</span> — afgewezen
                </span>
                <span className="font-mono tabular-nums text-[var(--ink-3)]">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sm:col-span-2">
        <h4 className="mb-1 font-medium text-[var(--ink-3)]">Herkomst van de grondslag (G4 · G5)</h4>
        <ul className="space-y-0.5">
          <li className="flex justify-between gap-3">
            <span className="text-[var(--ink-2)]">Eigen bronfragment</span>
            <span className="font-mono tabular-nums text-[var(--ink-3)]">{w.perGrondslag.fragment}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-[var(--ink-2)]">Alleen de bronkop (geen fragment)</span>
            <span className="font-mono tabular-nums text-[var(--ink-3)]">{w.perGrondslag.kop}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-[var(--ink-2)]">Kop niet van de bron (G4)</span>
            <span
              className={`font-mono tabular-nums ${w.kopNietVanBron > 0 ? 'text-[var(--negative)]' : 'text-[var(--ink-3)]'}`}
            >
              {w.kopNietVanBron}
            </span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-[var(--ink-2)]">Modeltekst als grondslag (G5)</span>
            <span
              className={`font-mono tabular-nums ${w.metModeltekst > 0 ? 'text-[var(--negative)]' : 'text-[var(--ink-3)]'}`}
            >
              {w.metModeltekst}
            </span>
          </li>
        </ul>
        {herkomstDrift > 0 && (
          <p role="alert" className="mt-1 text-[var(--negative)]">
            Dit hoort nul te zijn: het schema legt beide vast als vaste waarde. Staat hier iets anders, dan is er een
            duiding geschreven buiten `controleerDuiding` om.
          </p>
        )}
      </div>

      <div className="sm:col-span-2">
        <h4 className="mb-1 font-medium text-[var(--ink-3)]">
          Geduid zonder mechanisme (<span className="font-mono tabular-nums">{w.zonderMechanismeTotaal}</span>
          {w.zonderMechanismeTotaal > w.zonderMechanisme.length ? `, eerste ${w.zonderMechanisme.length} getoond` : ''}) —
          stuurt de groei van de catalogus
        </h4>
        {w.zonderMechanisme.length === 0 ? (
          <p className="text-[var(--ink-4)]">Geen.</p>
        ) : (
          <ul className="max-h-60 space-y-0.5 overflow-auto">
            {w.zonderMechanisme.map((a) => (
              <li key={a.id} className="text-[var(--ink-2)]">
                {a.title} <span className="text-[var(--ink-4)]">· {a.category ?? 'zonder categorie'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * G7-invoer: de enige poortmaat die uit een menselijk oordeel komt. Schrijft
 * naar `POST /api/admin/news-duiding/steekproef` (superadmin-gate, zod,
 * ADR 0044-envelope) en krijgt het bijgewerkte register terug.
 *
 * Bij elk veld staat wat de keuze doet en waarom je 'm zo zet — de
 * formulier-uitlegnorm; de teksten staan bij het contract
 * (`STEEKPROEF_VELD_UITLEG`), niet hier.
 */
function SteekproefFormulier({
  weken,
  steekproef,
  onGeschreven,
}: {
  weken: string[]
  steekproef: SteekproefRegister
  onGeschreven: (register: SteekproefRegister) => void
}) {
  const [week, setWeek] = useState(weken[0] ?? '')
  const [gecontroleerd, setGecontroleerd] = useState(String(STEEKPROEF_OMVANG))
  const [fouten, setFouten] = useState('0')
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<{ soort: 'ok' | 'fout'; tekst: string } | null>(null)

  const bestaand = steekproef[week]

  async function opslaan(e: React.FormEvent) {
    e.preventDefault()
    setBezig(true)
    setMelding(null)
    try {
      const res = await fetch('/api/admin/news-duiding/steekproef', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, gecontroleerd: Number(gecontroleerd), fouten: Number(fouten) }),
      })
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok) {
        // ADR 0044: de envelope is plat — `error` is een string, nooit een object.
        setMelding({ soort: 'fout', tekst: typeof body?.error === 'string' ? body.error : 'Opslaan mislukt' })
        return
      }
      onGeschreven((body?.steekproef ?? {}) as SteekproefRegister)
      setMelding({ soort: 'ok', tekst: `Steekproef van ${week} vastgelegd.` })
    } catch {
      setMelding({ soort: 'fout', tekst: 'Opslaan mislukt' })
    } finally {
      setBezig(false)
    }
  }

  const veld = 'min-h-[44px] w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)]'

  return (
    <form onSubmit={opslaan} className="mt-4 border border-[var(--border-ed)] px-4 py-4">
      <h4 className="mb-1 text-sm font-bold text-[var(--ink)]">Steekproef vastleggen (G7)</h4>
      <p className="mb-3 text-xs text-[var(--ink-3)]">
        Lees een week vrijgegeven samenvattingen na en tel hoeveel er iets beweren dat niet in de bron staat. Dit is de
        enige maat die de app niet zelf kan uitrekenen.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="steekproef-week" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
            {STEEKPROEF_VELD_UITLEG.week.label}
          </label>
          <select id="steekproef-week" className={veld} value={week} onChange={(e) => setWeek(e.target.value)}>
            {weken.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            {STEEKPROEF_VELD_UITLEG.week.effect} {STEEKPROEF_VELD_UITLEG.week.waarom}
          </p>
        </div>

        <div>
          <label htmlFor="steekproef-gecontroleerd" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
            {STEEKPROEF_VELD_UITLEG.gecontroleerd.label}
          </label>
          <input
            id="steekproef-gecontroleerd"
            type="number"
            inputMode="numeric"
            // 1, niet STEEKPROEF_OMVANG: minder nalezen mag worden vastgelegd
            // en telt alleen niet mee voor de poort (eindreview 1F fase 2, M3).
            min={1}
            max={500}
            className={veld}
            value={gecontroleerd}
            onChange={(e) => setGecontroleerd(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            {STEEKPROEF_VELD_UITLEG.gecontroleerd.effect} {STEEKPROEF_VELD_UITLEG.gecontroleerd.waarom}
          </p>
        </div>

        <div>
          <label htmlFor="steekproef-fouten" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
            {STEEKPROEF_VELD_UITLEG.fouten.label}
          </label>
          <input
            id="steekproef-fouten"
            type="number"
            inputMode="numeric"
            min={0}
            max={500}
            className={veld}
            value={fouten}
            onChange={(e) => setFouten(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            {STEEKPROEF_VELD_UITLEG.fouten.effect} {STEEKPROEF_VELD_UITLEG.fouten.waarom}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={bezig || week === ''}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--border-ed)] px-5 py-2.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-40"
        >
          {bezig ? 'Opslaan...' : 'Steekproef vastleggen'}
        </button>
        {bestaand && (
          <span className="text-xs text-[var(--ink-4)]">
            Al vastgelegd voor {week}: {bestaand.fouten} fout op {bestaand.gecontroleerd} nagelezen. Opnieuw opslaan
            vervangt die telling.
          </span>
        )}
      </div>

      <p aria-live="polite" className="mt-2 text-xs">
        {melding && (
          <span className={melding.soort === 'ok' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
            {melding.tekst}
          </span>
        )}
      </p>
    </form>
  )
}
