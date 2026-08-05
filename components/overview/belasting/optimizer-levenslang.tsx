'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SectionLabel, HighlightMark, Button } from '@/components/editorial'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { formatFireAge } from '@/lib/horizon/fire-format'
import {
  variantenSweepInputHash,
  type VariantDiskwalificatie,
  type VariantUitkomst,
  type VariantenSweepResultaat,
  type VariantenSweepSnapshot,
} from '@/lib/tax-lifetime/varianten-sweep'
import { CellNote, GroupRow, Td, Th } from './optimizer-compare'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/** Waar de sweep-INVOER vandaan komt (de server draait de sweep niet). */
const SNAPSHOT_ENDPOINT = '/api/belasting/varianten-sweep'

/**
 * Katern IV — "Wanneer je je pensioenpot aanspreekt".
 *
 * Consumeert `VariantenSweepResultaat` (lib/tax-lifetime/varianten-sweep.ts) en
 * rekent zélf niets: elk getoond bedrag, de FIRE-leeftijd, de winnaar en de
 * diskwalificaties komen kant-en-klaar uit die laag. Het enige wat hier gebeurt
 * is een weergave-VERSCHIL tussen twee geleverde totalen (variant − referentie)
 * en de canonieke €→vrijheidstijd-conversie uit `lib/format.ts`.
 *
 * ## Achter een expliciete actie
 * Drie kernel-solves kosten ~466-688 ms. Ze draaien daarom pas na een klik, via
 * `runVariantenSweepAsync` (kernel-worker, off-main-thread), en de worker-module
 * wordt LAZY geïmporteerd zodat de kernel-bundel niet in de eerste load van de
 * optimizer-pagina zit. De uitkomst wordt COMPONENT-SCOPED gememoïseerd op
 * `variantenSweepInputHash(snapshot)` — bewust geen module-level cache: die zou
 * na een accountwissel binnen dezelfde tab de vorige gebruiker kunnen tonen.
 *
 * ## Waarom het eindvermogen naast de winnaar staat
 * De rangschikking loopt op NOMINALE levenslange belasting. Die as beloont
 * "eerder door je geld heen zijn": wie z'n vermogen sneller opmaakt, betaalt
 * minder Box 3 en wint. Daarom staat het eindvermogen als harde eis in dezelfde
 * tabel. We tonen bewust ÉÉN grondslag — `eindvermogenBelegbaarNominaal`,
 * dezelfde grondslag als de laagste buffer — en labelen die expliciet. Het
 * netto eindvermogen (incl. niet-liquide bezit, bv. een huis) is een ándere
 * grootheid en staat daarom niet in deze kolommen (CLAUDE.md: nooit twee
 * vermogensgrondslagen op één as).
 *
 * Wft: geen "je bespaart € X" (het is een verschil tussen twee indicaties), geen
 * gebiedende wijs, geen aanbevolen volgorde. De enige callout op de pagina blijft
 * de bestaande `OPTIMIZER_DISCLAIMER` onder katern II.
 */
export function OptimizerLevenslang({
  fc,
  dailyExpenses,
}: {
  /** Privacy-bewuste currency-formatter van de pagina (maskering). */
  fc: (v: number) => string
  /**
   * Canonieke dag-uitgaven die de optimizer al consumeert
   * (`loadFiscaleKansen(...).dailyExpenses`). 0 = onbekend → geen
   * vrijheidstijd-vertaling, nooit een eigen dag-conversie.
   */
  dailyExpenses: number
}) {
  const [fase, setFase] = useState<Fase>('uitnodiging')
  const [resultaat, setResultaat] = useState<VariantenSweepResultaat | null>(null)

  // Component-scoped geheugen: snapshot (server-invoer) + uitkomst per
  // invoer-hash. Refs, geen module-state — zie de kop van dit bestand.
  const snapshotRef = useRef<VariantenSweepSnapshot | null>(null)
  const memoRef = useRef<{ hash: string; resultaat: VariantenSweepResultaat } | null>(null)
  const levend = useRef(true)
  useEffect(() => {
    levend.current = true
    return () => {
      levend.current = false
    }
  }, [])

  const start = useCallback(async () => {
    setFase('bezig')
    try {
      let snapshot = snapshotRef.current
      if (!snapshot) {
        const res = await fetch(SNAPSHOT_ENDPOINT)
        if (!levend.current) return
        if (!res.ok) {
          setFase('fout')
          return
        }
        const data = (await res.json()) as { snapshot: VariantenSweepSnapshot | null }
        if (!levend.current) return
        if (!data?.snapshot) {
          setFase('geen-plan')
          return
        }
        snapshot = data.snapshot
        snapshotRef.current = snapshot
      }

      const hash = variantenSweepInputHash(snapshot)
      const memo = memoRef.current
      if (memo && memo.hash === hash) {
        setResultaat(memo.resultaat)
        setFase('klaar')
        return
      }

      // Lazy: de kernel-bundel komt pas binnen wanneer er écht gerekend wordt.
      const { runVariantenSweepAsync } = await import('@/lib/horizon-kernel/worker/run-in-worker')
      const uitkomst = await runVariantenSweepAsync(snapshot)
      if (!levend.current) return
      // `null` = onverwachte worker-respons. Bewust géén synchroon vangnet: dat
      // zou drie solves alsnog op de main thread zetten (zie run-in-worker.ts).
      if (!uitkomst || uitkomst.varianten.every((v) => v.kernelFout !== null)) {
        setFase('fout')
        return
      }
      memoRef.current = { hash, resultaat: uitkomst }
      setResultaat(uitkomst)
      setFase('klaar')
    } catch {
      if (levend.current) setFase('fout')
    }
  }, [])

  return (
    <section id="optimizer-levenslang" className="scroll-mt-24">
      <SectionLabel num="IV">Over je hele looptijd</SectionLabel>
      <div className="-mt-3 mb-4">
        <h2
          className="text-[22px] sm:text-[26px] font-black leading-tight tracking-[-0.02em] text-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Wanneer je je pensioenpot{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            aanspreekt
          </em>
        </h2>
        <p
          className="mt-1.5 max-w-[64ch] text-sm italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Je pensioen wordt belast als inkomen, je spaargeld en beleggingen via box 3. Waar je
          pensioenpot in de rij staat, verschuift daarom niet alleen je belasting over de hele
          looptijd, maar ook waar die neerslaat — hier zie je het verschil, in euro’s en in
          vrijheidstijd.
        </p>
      </div>

      {/* Altijd gemount, zodat een fase-wissel ook zónder focus wordt
          aangekondigd (de zichtbare tekst herhaalt dit visueel). */}
      <div role="status" aria-live="polite" className="sr-only">
        {STATUS_TEKST[fase]}
      </div>

      {fase === 'uitnodiging' && <Uitnodiging onStart={start} />}
      {fase === 'bezig' && <Bezig />}
      {fase === 'geen-plan' && <GeenPlan />}
      {fase === 'fout' && <Fout onRetry={start} />}
      {fase === 'klaar' && resultaat && (
        <VariantenTabel resultaat={resultaat} fc={fc} dailyExpenses={dailyExpenses} />
      )}

      {fase === 'klaar' && resultaat && <Kanttekeningen box1Jaar={resultaat.box1Jaar} />}
    </section>
  )
}

type Fase = 'uitnodiging' | 'bezig' | 'klaar' | 'geen-plan' | 'fout'

const STATUS_TEKST: Record<Fase, string> = {
  uitnodiging: '',
  bezig: 'Bezig met doorrekenen van de drie varianten.',
  klaar: 'De drie varianten zijn doorgerekend.',
  'geen-plan': 'De varianten zijn nog niet door te rekenen: je toekomstplan ontbreekt.',
  fout: 'Het doorrekenen is niet gelukt.',
}

// ── Fasen vóór de uitkomst ───────────────────────────────────────

function Uitnodiging({ onStart }: { onStart: () => void }) {
  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6">
      <p
        className="max-w-[62ch] text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Reken door wat de plek van je pensioenpot doet. Je huidige volgorde, pensioen zo laat
        mogelijk en pensioen vroeg — alle drie over je hele looptijd doorgerekend, met je eigen plan
        als ijkpunt. Dat is een paar seconden rekenwerk, dus het gebeurt pas als je erom vraagt.
      </p>
      <div className="mt-4">
        <Button type="button" onClick={onStart}>
          Reken de drie varianten door
        </Button>
      </div>
    </div>
  )
}

/**
 * Laadstaat, 1-10s (Nielsen) → skeleton in de vorm van de tabel die eraan komt,
 * zodat er geen layout-sprong volgt. Geen spinner ernaast gestapeld; `animate-
 * pulse` valt stil onder `prefers-reduced-motion`.
 */
function Bezig() {
  return (
    <div aria-busy="true" className="border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.20em] text-[var(--ink-3)]">
        Bezig met doorrekenen
      </div>
      <p
        className="mt-1 max-w-[58ch] text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Drie volledige doorrekeningen van je plan, elk over je hele looptijd. Dat duurt een paar
        seconden.
      </p>
      <div aria-hidden className="mt-5 space-y-2.5">
        {SKELETON_BREEDTES.map((w, i) => (
          <div
            key={i}
            className="h-3.5 animate-pulse bg-[var(--subtle)] motion-reduce:animate-none"
            style={{ width: w }}
          />
        ))}
      </div>
    </div>
  )
}

/** Rijhoogtes van de tabel-skeleton (kop + drie groepen met hun rijen). */
const SKELETON_BREEDTES = ['100%', '82%', '82%', '64%', '90%', '76%', '58%']

/**
 * De canonieke Horizon-run is niet mogelijk (geen geboortedatum/profielrij).
 * Eerlijke lege staat mét uitgang — geen foutmelding voor iets dat geen fout is.
 */
function GeenPlan() {
  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6">
      <p
        className="max-w-[62ch] text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Deze vergelijking rekent op je toekomstplan, en dat is er nog niet. Zodra je geboortedatum
        en je plan op Toekomst staan, kunnen de drie varianten hier worden doorgerekend.
      </p>
      <div className="mt-4">
        <Button href="/toekomst/voorkeuren" variant="secondary">
          Naar je toekomstplan
        </Button>
      </div>
    </div>
  )
}

/** Netwerk-/worker-fout: wat ging mis + een uitweg (opnieuw proberen). */
function Fout({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="p-5 sm:p-6"
      style={{
        borderLeft: '3px solid var(--negative)',
        background: 'color-mix(in srgb, var(--negative) 6%, var(--paper))',
      }}
    >
      {/* Bewust ándere formulering dan de sr-only live-regio hierboven: een
          letterlijke herhaling zou een schermlezer twee keer hetzelfde laten
          voorlezen. */}
      <p className="max-w-[62ch] text-sm leading-snug text-[var(--ink-2)]">
        Er ging iets mis bij het doorrekenen. Er is niets aan je gegevens veranderd — je kunt het
        opnieuw proberen.
      </p>
      <div className="mt-4">
        <Button type="button" variant="secondary" onClick={onRetry}>
          Opnieuw proberen
        </Button>
      </div>
    </div>
  )
}

// ── De vergelijking ──────────────────────────────────────────────

const DISKWALIFICATIE_TEKST: Record<VariantDiskwalificatie, string> = {
  'buffer-uitgeput': 'Telt niet mee: je belegbaar vermogen raakt onderweg op.',
  'fire-later-dan-referentie': 'Telt niet mee: je FIRE-moment valt later dan nu.',
}

/**
 * Vrijheidstijd bij een bedrag, via de canonieke helpers. `null` zodra er geen
 * dagtarief bekend is of het bedrag nul is — dan tonen we niets in plaats van
 * een "∞"- of "0 dagen"-regel die niets toevoegt.
 */
function vrijheid(amount: number | null, dailyExpenses: number): string | null {
  if (amount === null || amount === 0 || dailyExpenses <= 0) return null
  const breakdown = calculateFreedomTime(amount, dailyExpenses)
  if (breakdown.isInfinite) return null
  return formatFreedomTimeString(breakdown, 'long')
}

const WINNAAR_TINT = 'color-mix(in srgb, var(--positive) 6%, transparent)'

function VariantenTabel({
  resultaat,
  fc,
  dailyExpenses,
}: {
  resultaat: VariantenSweepResultaat
  fc: (v: number) => string
  dailyExpenses: number
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (el) setScrolled(el.scrollLeft > 0)
  }, [])

  const { varianten, winnaarId } = resultaat
  const referentie = varianten.find((v) => v.isReferentie) ?? null
  const cols = varianten.length + 1
  const winnaarCel = (v: VariantUitkomst) =>
    v.id === winnaarId ? { background: WINNAAR_TINT } : undefined

  /**
   * Weergave-verschil tussen twee GELEVERDE totalen (geen herberekening van een
   * kerngetal). `null` zodra een van beide ontbreekt of de variant zelf het
   * ijkpunt is.
   */
  const verschil = (v: VariantUitkomst): number | null => {
    if (v.isReferentie) return null
    const eigen = v.levenslangeTotaleDrukNominaal
    const ijk = referentie?.levenslangeTotaleDrukNominaal ?? null
    if (eigen === null || ijk === null) return null
    return eigen - ijk
  }

  return (
    <div className="relative mt-6">
      {!scrolled && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-2 z-[2] border border-[var(--rule-soft)] bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.10em] text-[var(--module-active-500)] sm:hidden"
        >
          sleep →
        </span>
      )}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="overflow-x-auto border-t border-[var(--ink)]"
      >
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <caption className="sr-only">
            Drie onttrekkingsvolgordes vergeleken op hun belastingdruk over je hele looptijd, met je
            huidige volgorde als ijkpunt.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="px-0 py-3 text-left">
                <span className="sr-only">Kenmerk</span>
              </th>
              {varianten.map((v) => (
                <th
                  key={v.id}
                  scope="col"
                  className="border-b border-[var(--ink)] px-3 py-3 text-right align-bottom font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--ink-3)]"
                  style={winnaarCel(v)}
                >
                  <span
                    className="mb-0.5 block text-[12.5px] font-bold normal-case tracking-normal text-[var(--ink)]"
                    style={{ fontFamily: SOURCE_SERIF }}
                  >
                    {v.label}
                  </span>
                  {v.isReferentie ? 'je huidige volgorde' : 'variant'}
                  {v.id === winnaarId && (
                    <span
                      className="mt-1 block whitespace-nowrap border px-1.5 py-px text-[9px] uppercase tracking-[0.12em]"
                      style={{
                        color: 'var(--positive)',
                        borderColor: 'var(--positive)',
                        background: 'color-mix(in srgb, var(--positive) 9%, transparent)',
                      }}
                    >
                      laagste druk
                    </span>
                  )}
                  {v.diskwalificatie !== null && (
                    <span
                      className="mt-1 block text-[10.5px] font-normal normal-case italic leading-snug tracking-normal"
                      style={{ color: 'var(--negative)', fontFamily: SOURCE_SERIF }}
                    >
                      {DISKWALIFICATIE_TEKST[v.diskwalificatie]}
                    </span>
                  )}
                  {v.kernelFout !== null && (
                    <span
                      className="mt-1 block text-[10.5px] font-normal normal-case italic leading-snug tracking-normal text-[var(--ink-3)]"
                      style={{ fontFamily: SOURCE_SERIF }}
                    >
                      Niet doorgerekend voor jouw plan.
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <GroupRow label="Belasting over je hele looptijd" span={cols} />
            <tr>
              <Th>Box 3, opgeteld</Th>
              {varianten.map((v) => (
                <Bedrag
                  key={v.id}
                  value={v.levenslangeBox3Nominaal}
                  fc={fc}
                  style={winnaarCel(v)}
                />
              ))}
            </tr>
            <tr>
              <Th>
                Box 1 die de cashflow niet inhield
                <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                  over je pensioen- en AOW-inkomen
                </span>
              </Th>
              {varianten.map((v) => (
                <Bedrag
                  key={v.id}
                  value={v.levenslangeBox1NietVerrekendNominaal}
                  fc={fc}
                  style={winnaarCel(v)}
                />
              ))}
            </tr>
            <tr>
              <Th className="border-b-4 border-double border-[var(--ink)] font-bold text-[var(--ink)]">
                Totale druk over je looptijd
              </Th>
              {varianten.map((v) => {
                const totaal = v.levenslangeTotaleDrukNominaal
                const tijd = vrijheid(totaal, dailyExpenses)
                return (
                  <Td
                    key={v.id}
                    className="border-b-4 border-double border-[var(--ink)] font-bold"
                    muted={totaal === null}
                    style={winnaarCel(v)}
                  >
                    {totaal === null ? (
                      '—'
                    ) : v.id === winnaarId ? (
                      // Eén HighlightMark per sectie: alleen op de winnaar.
                      <HighlightMark>{fc(totaal)}</HighlightMark>
                    ) : (
                      fc(totaal)
                    )}
                    {tijd && <CellNote>≈ {tijd} vrijheid</CellNote>}
                  </Td>
                )
              })}
            </tr>

            <GroupRow label="Wat er overblijft" span={cols} />
            <tr>
              <Th>
                Belegbaar vermogen aan het eind
                <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                  zonder je huis en ander niet-liquide bezit
                </span>
              </Th>
              {varianten.map((v) => {
                const eind = v.eindvermogenBelegbaarNominaal
                const tijd = vrijheid(eind, dailyExpenses)
                return (
                  <Td key={v.id} muted={eind === null} style={winnaarCel(v)}>
                    {eind === null ? '—' : fc(eind)}
                    {tijd && <CellNote>≈ {tijd} vrijheid</CellNote>}
                  </Td>
                )
              })}
            </tr>
            <tr>
              <Th>Je bent vrij vanaf</Th>
              {varianten.map((v) => (
                <Td
                  key={v.id}
                  muted={v.fireAgeFractional === null}
                  style={winnaarCel(v)}
                >
                  {formatFireAge(v.fireAgeFractional)}
                </Td>
              ))}
            </tr>

            <GroupRow label="Verschil met je huidige volgorde" span={cols} />
            <tr>
              <Th>In euro’s, over je hele looptijd</Th>
              {varianten.map((v) => {
                const d = verschil(v)
                return (
                  <Td key={v.id} muted={d === null} style={winnaarCel(v)}>
                    {v.isReferentie ? (
                      <>
                        —<CellNote>dit is het ijkpunt</CellNote>
                      </>
                    ) : d === null || d === 0 ? (
                      '—'
                    ) : (
                      <span style={{ color: d < 0 ? 'var(--positive)' : 'var(--negative)' }}>
                        {fc(Math.abs(d))} {d < 0 ? 'minder' : 'meer'}
                      </span>
                    )}
                  </Td>
                )
              })}
            </tr>
            <tr>
              <Th>
                In vrijheidstijd
                <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                  tegen je dagtarief van vandaag; de bedragen zijn nominaal
                </span>
              </Th>
              {varianten.map((v) => {
                const d = verschil(v)
                const tijd = vrijheid(d, dailyExpenses)
                return (
                  <Td key={v.id} muted={tijd === null} style={winnaarCel(v)}>
                    {tijd === null || d === null ? (
                      '—'
                    ) : (
                      <span style={{ color: d < 0 ? 'var(--positive)' : 'var(--negative)' }}>
                        ≈ {tijd} {d < 0 ? 'meer' : 'minder'} vrijheid
                      </span>
                    )}
                  </Td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Standaard bedrag-cel: geleverde waarde of een em-streepje bij een kern-fout. */
function Bedrag({
  value,
  fc,
  style,
}: {
  value: number | null
  fc: (v: number) => string
  style?: React.CSSProperties
}) {
  return (
    <Td muted={value === null} style={style}>
      {value === null ? '—' : fc(value)}
    </Td>
  )
}

// ── Kanttekeningen ───────────────────────────────────────────────

/**
 * De zes kanttekeningen bij deze vergelijking — zelfde register als de
 * 2028-indicatie in `lib/tax-optimizer/box3-strategies.ts`: benoem de aanname,
 * benoem welke kant hij op valt, en noem het een indicatie. Geen advies, geen
 * gebiedende wijs.
 *
 * De zesde gaat over de arbeidskorting-afwijking in `lib/box1-tax.ts` (zie de
 * module-doc van `lib/tax-lifetime/lifetime-tax.ts`). Die staat er omdat de
 * afwijking niet neutraal is tussen de vergeleken varianten: hij is het grootst in
 * de jaren vóór de AOW, en dat is precies waar "pensioen vroeg" zijn onttrekkingen
 * concentreert. Bewust ZONDER euro-bedragen: de afwijking hangt af van het
 * inkomensniveau en draait bij hoge pensioeninkomens zelfs van teken, dus één
 * getal zou hier een precisie suggereren die er niet is (de gemeten reeks staat
 * gepind in `lib/tax-lifetime/lifetime-tax.test.ts`).
 */
function Kanttekeningen({ box1Jaar }: { box1Jaar: number }) {
  const punten = [
    'De heffing is berekend náást de projectie, niet erin: het model rekent niet mee dat je extra bruto moet opnemen om die belasting te betalen. Je werkelijke opname ligt dus hoger, en het verschil tussen de varianten is een indicatie — geen uitkomst.',
    'Een “volgorde” is in het model geen strikte rij maar een gewogen gelijktijdige opname: een pot met een hogere prioriteit levert per euro ongeveer twee keer zoveel als de pot erna. Alleen “als laatste” is echt achtergesteld.',
    'Lijfrente is niet apart te sturen — die valt in het model samen met je bedrijfspensioen in één pot.',
    'Box 1 is per persoon; de belasting van je partner zit hier niet in.',
    `De schijven en heffingskortingen zijn die van ${box1Jaar}; in het model groeien ze mee met de inflatie.`,
    'De box 1-heffing is een indicatie: het model kent de arbeidskorting nu ook toe over pensioeninkomen, terwijl dat fiscaal geen arbeidsinkomen is. In het gangbare bereik valt de heffing daardoor te laag uit — het sterkst in de jaren vóór je AOW, en dus bij vroeg onttrekken; bij een hoog pensioeninkomen valt ze juist iets te hoog uit.',
  ]

  return (
    <div className="mt-6 border-t border-dotted border-[var(--rule-soft)] pt-4">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.20em] text-[var(--ink-3)]">
        Kanttekeningen
      </div>
      <ul className="mt-2.5 space-y-2">
        {punten.map((p, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--ink-4)]"
            />
            <span className="max-w-[72ch] text-[11.5px] leading-relaxed text-[var(--ink-2)]">
              {p}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
