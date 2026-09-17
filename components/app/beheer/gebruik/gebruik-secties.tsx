import type { ReactNode } from 'react'
import { MODULE_LABELS } from '@/lib/activity/modules'
import { DOMINANT_MIN_DAGEN } from '@/lib/waardestromen'
import type { GebruikAnalyse, GebruikStroom } from '@/lib/beheer/gebruik-analyse/loader'
import {
  GEBRUIK_PERCENTAGE_MIN_N,
  aandeel,
  celTekst,
  type Aandeel,
  type Cel,
} from '@/lib/beheer/gebruik-analyse/onderdrukking'
import {
  CelWaarde,
  HorizontaleBalken,
  Staaltje,
  TabelWeergave,
  Td,
  Th,
  WeekKolommen,
  type BalkRij,
} from './grafieken'
import {
  GIDS_LABEL,
  HOMESCHERM_LABEL,
  LAATST_ACTIEF_LABEL,
  RONDLEIDING_LABEL,
  UITGESTELD_LABEL,
  WEERGAVE_LABEL,
  aandeelTekst,
  celGetal,
  celUitleg,
  labelVan,
  maandLabel,
  mooieMax,
  procent,
  weekLabel,
} from './opmaak'
import { NEUTRALE_REEKS, reeksKleur } from './palet'
import { DoorstroomSankey } from './sankey'

/**
 * De inhoudssecties van /beheer/gebruik (1 t/m 6), van samenvatting naar
 * detail. Krijgt uitsluitend het view-model — geen fetch, geen ruwe rijen.
 * Koppen: de pagina-aanhef is h2, secties h3, blokken daarbinnen h4.
 */

// ── Kleine bouwstenen ──────────────────────────────────────────────

export function SectieKop({ nummer, titel, children }: { nummer: string; titel: string; children?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-meta)]">{nummer}</span>
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
      </div>
      <h3 className="font-display text-xl font-semibold text-[var(--ink)]">{titel}</h3>
      {children && <div className="mt-1.5 max-w-[70ch] text-sm leading-relaxed text-[var(--ink-3)]">{children}</div>}
    </div>
  )
}

function BlokKop({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 text-sm font-semibold text-[var(--ink)]">{children}</h4>
}

function LegeStaat({ children }: { children: ReactNode }) {
  return (
    <p className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-4 py-6 text-center text-sm italic text-[var(--ink-3)]">
      {children}
    </p>
  )
}

function Waarschuwing({ a }: { a: Aandeel }) {
  if (!a.waarschuwing) return null
  return (
    <span
      className="ml-1.5 whitespace-nowrap text-[11px] italic text-[var(--ink-3)]"
      title={`Minder dan ${GEBRUIK_PERCENTAGE_MIN_N} gebruikers: lees dit als richting, niet als maat.`}
    >
      (n &lt; {GEBRUIK_PERCENTAGE_MIN_N}, lees als richting)
    </span>
  )
}

function AandeelOfNiets({ teller, noemer }: { teller: Cel; noemer: Cel }) {
  const a = aandeel(teller, noemer)
  if (!a) return null
  return (
    <span className="ml-1.5 whitespace-nowrap text-[11px] text-[var(--ink-3)]">
      {aandeelTekst(a)}
    </span>
  )
}

function Kerncijfer({ label, cel, sub }: { label: string; cel: Cel; sub?: ReactNode }) {
  const uitleg = celUitleg(cel)
  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-meta)]">{label}</div>
      <div
        className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${uitleg ? 'italic text-[var(--ink-3)]' : 'text-[var(--ink)]'}`}
        title={uitleg ?? undefined}
      >
        {celTekst(cel)}
      </div>
      {sub && <div className="mt-0.5 text-xs text-[var(--ink-3)]">{sub}</div>}
    </div>
  )
}

function maxWaarde(cellen: Cel[]): number {
  return cellen.reduce((m, c) => (c.soort === 'waarde' && c.n > m ? c.n : m), 0)
}

function stroomMap(stromen: GebruikStroom[]): Map<string, GebruikStroom> {
  return new Map(stromen.map((s) => [s.id, s]))
}

// ── 1. Kerncijfers + weektrend ─────────────────────────────────────

export function KerncijfersSectie({ data }: { data: GebruikAnalyse }) {
  const k = data.kerncijfers
  const vanSegment = (cel: Cel) => {
    const a = aandeel(cel, k.segmentTotaal)
    return a ? aandeelTekst(a, 'in het segment') : undefined
  }
  const actiefMax = mooieMax(maxWaarde(data.weektrend.map((w) => w.actief)))
  const nieuwMax = mooieMax(maxWaarde(data.weektrend.map((w) => w.nieuw)))

  return (
    <section className="mb-12">
      <SectieKop nummer="01 · Kerncijfers" titel="Wie gebruikt de app">
        Verschillende gebruikers met minstens één actieve dag. Een dag telt, een scherm of klik niet.
      </SectieKop>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kerncijfer label="In het segment" cel={k.segmentTotaal} sub="alle accounts in dit segment" />
        <Kerncijfer
          label="Actief in deze band"
          cel={k.actiefVenster}
          sub={
            <>
              {data.band.label}
              {vanSegment(k.actiefVenster) ? ` · ${vanSegment(k.actiefVenster)}` : ''}
            </>
          }
        />
        <Kerncijfer label="Nieuw in deze band" cel={k.nieuwVenster} sub={`aanmeldingen, ${data.band.label.toLowerCase()}`} />
      </div>

      <div className="mt-8">
        <BlokKop>Laatst actief</BlokKop>
        <p className="mb-3 text-xs text-[var(--ink-3)]">
          Wanneer iedereen in het segment voor het laatst actief was. Deze verdeling hangt niet van de gekozen band af.
        </p>
        <HorizontaleBalken
          testId="laatst-actief-balken"
          schaalMax={maxWaarde(k.laatstActief.verdeling.map((v) => v.gebruikers))}
          rijen={k.laatstActief.verdeling.map((v) => {
            const a = aandeel(v.gebruikers, k.segmentTotaal)
            return {
              sleutel: v.wanneer,
              label: LAATST_ACTIEF_LABEL[v.wanneer],
              cel: v.gebruikers,
              kleur: NEUTRALE_REEKS,
              toelichting: a ? aandeelTekst(a) : undefined,
            }
          })}
        />
      </div>

      <div className="mt-8">
        {data.weektrend.length === 0 ? (
          <LegeStaat>Nog geen weken met metingen in deze band.</LegeStaat>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <BlokKop>Actief per week in deze band</BlokKop>
                <WeekKolommen
                  punten={data.weektrend.map((w) => ({ week: w.week, cel: w.actief }))}
                  schaalMax={actiefMax}
                  kleur={NEUTRALE_REEKS}
                  idBasis="trend-actief"
                  omschrijving={`Actieve gebruikers per week, ${data.weektrend.length} weken`}
                />
              </div>
              <div>
                <BlokKop>Nieuwe aanmeldingen per week in deze band</BlokKop>
                <WeekKolommen
                  punten={data.weektrend.map((w) => ({ week: w.week, cel: w.nieuw }))}
                  schaalMax={nieuwMax}
                  kleur={NEUTRALE_REEKS}
                  idBasis="trend-nieuw"
                  eenheid="aanmeldingen"
                  omschrijving={`Nieuwe aanmeldingen per week, ${data.weektrend.length} weken`}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--ink-3)]">Twee grafieken, elk met een eigen schaal — lees ze niet tegen elkaar af.</p>
            <TabelWeergave>
              <table className="w-full min-w-[20rem] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-ed)]">
                    <Th>Week</Th>
                    <Th rechts>Actief</Th>
                    <Th rechts>Nieuw</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.weektrend.map((w) => (
                    <tr key={w.week} className="border-b border-dotted border-[var(--border-ed)]">
                      <Td>{weekLabel(w.week)}</Td>
                      <Td rechts>
                        <CelWaarde cel={w.actief} />
                      </Td>
                      <Td rechts>
                        <CelWaarde cel={w.nieuw} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelWeergave>
          </>
        )}
      </div>
    </section>
  )
}

// ── 2. Per waardestroom ────────────────────────────────────────────

function overlapLabel(aantal: number, totaalStromen: number): string {
  if (aantal === 0) return 'Geen stroom'
  if (aantal === totaalStromen && totaalStromen > 1) return `Alle ${totaalStromen} stromen`
  return aantal === 1 ? '1 stroom' : `${aantal} stromen`
}

export function StromenSectie({ data }: { data: GebruikAnalyse }) {
  const meta = stroomMap(data.stromen)
  const gedeeldeMax = mooieMax(maxWaarde(data.stroomWeken.flatMap((s) => s.weken.map((w) => w.actief))))
  const weken = data.stroomWeken[0]?.weken.map((w) => w.week) ?? []

  const dominantRijen: BalkRij[] = data.dominant.verdeling.map((d) => {
    const s = d.stroom ? meta.get(d.stroom) : undefined
    const a = aandeel(d.gebruikers, data.dominant.totaal)
    return {
      sleutel: d.stroom ?? 'geen',
      label: d.stroom ? (
        <span className="inline-flex items-center gap-1.5">
          <Staaltje kleur={reeksKleur(s?.kleurIndex ?? -1)} />
          {s?.naam ?? d.stroom}
        </span>
      ) : (
        'Geen dominante stroom'
      ),
      cel: d.gebruikers,
      kleur: d.stroom ? reeksKleur(s?.kleurIndex ?? -1) : 'var(--border-md)',
      toelichting: a ? aandeelTekst(a) : undefined,
    }
  })
  const overlapRijen: BalkRij[] = data.overlap.verdeling.map((o) => {
    const a = aandeel(o.gebruikers, data.overlap.totaal)
    return {
      sleutel: String(o.aantalStromen),
      label: overlapLabel(o.aantalStromen, data.stromen.length),
      cel: o.gebruikers,
      kleur: NEUTRALE_REEKS,
      toelichting: a ? aandeelTekst(a) : undefined,
    }
  })

  return (
    <section className="mb-12">
      <SectieKop nummer="02 · Waardestromen" titel="Per waardestroom">
        Een waardestroom is een bundel app-delen (ingesteld onder Waardestromen). Elke stroom houdt zijn eigen kleur,
        op volgorde van de indeling — niet op grootte.
      </SectieKop>

      <BlokKop>Actieve gebruikers per week, per stroom</BlokKop>
      {data.stroomWeken.length === 0 || weken.length === 0 ? (
        <LegeStaat>Nog geen stroomactiviteit gemeten in deze band.</LegeStaat>
      ) : (
        <>
          <p className="mb-3 text-xs text-[var(--ink-3)]">
            Gedeelde schaal: 0 tot {gedeeldeMax.toLocaleString('nl-NL')} gebruikers per week in élk paneel, zodat je de
            stromen naast elkaar kunt vergelijken.
          </p>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="stroom-small-multiples">
            {data.stroomWeken.map((sw) => {
              const s = meta.get(sw.id)
              const kleur = reeksKleur(s?.kleurIndex ?? -1)
              return (
                <li key={sw.id} className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <Staaltje kleur={kleur} />
                    <span className="text-sm font-semibold text-[var(--ink)]">{s?.naam ?? sw.id}</span>
                    <span className="ml-auto text-xs text-[var(--ink-3)]">
                      <CelWaarde cel={sw.gebruikers} /> in deze band
                    </span>
                  </div>
                  {s && s.modules.length > 0 && (
                    <p className="mb-2 truncate text-[11px] text-[var(--ink-3)]" title={s.modules.map((m) => MODULE_LABELS[m]).join(', ')}>
                      {s.modules.map((m) => MODULE_LABELS[m]).join(' · ')}
                    </p>
                  )}
                  <WeekKolommen
                    punten={sw.weken.map((w) => ({ week: w.week, cel: w.actief }))}
                    schaalMax={gedeeldeMax}
                    kleur={kleur}
                    idBasis={`stroom-${sw.id}`}
                    hoogte={80}
                    omschrijving={`${s?.naam ?? sw.id}: actieve gebruikers per week`}
                  />
                </li>
              )
            })}
          </ul>
          <TabelWeergave>
            <table className="w-full min-w-[24rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-ed)]">
                  <Th>Week</Th>
                  {data.stroomWeken.map((sw) => (
                    <Th key={sw.id} rechts>
                      {meta.get(sw.id)?.naam ?? sw.id}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weken.map((week, i) => (
                  <tr key={week} className="border-b border-dotted border-[var(--border-ed)]">
                    <Td>{weekLabel(week)}</Td>
                    {data.stroomWeken.map((sw) => (
                      <Td key={sw.id} rechts>
                        {sw.weken[i] ? <CelWaarde cel={sw.weken[i].actief} /> : '—'}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelWeergave>
        </>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <div>
          <BlokKop>Dominante stroom</BlokKop>
          <p className="mb-3 text-xs text-[var(--ink-3)]">
            De stroom met de meeste actieve dagen in de laatste 30 dagen (los van de gekozen band), mits minstens {DOMINANT_MIN_DAGEN}. Totaal:{' '}
            <CelWaarde cel={data.dominant.totaal} /> gebruikers.
          </p>
          {dominantRijen.length === 0 ? (
            <LegeStaat>Nog geen verdeling beschikbaar.</LegeStaat>
          ) : (
            <HorizontaleBalken
              rijen={dominantRijen}
              schaalMax={maxWaarde(dominantRijen.map((r) => r.cel))}
              testId="dominant-balken"
            />
          )}
        </div>
        <div>
          <BlokKop>Overlap: in hoeveel stromen actief</BlokKop>
          <p className="mb-3 text-xs text-[var(--ink-3)]">
            Hoeveel verschillende stromen iemand in deze band gebruikte. Totaal: <CelWaarde cel={data.overlap.totaal} />{' '}
            gebruikers.
          </p>
          {overlapRijen.length === 0 ? (
            <LegeStaat>Nog geen verdeling beschikbaar.</LegeStaat>
          ) : (
            <HorizontaleBalken
              rijen={overlapRijen}
              schaalMax={maxWaarde(overlapRijen.map((r) => r.cel))}
              testId="overlap-balken"
            />
          )}
        </div>
      </div>
    </section>
  )
}

// ── 3. Ritme ───────────────────────────────────────────────────────

function dagenTekst(d: number): string {
  return `${d.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} ${d === 1 ? 'dag' : 'dagen'}`
}

export function RitmeSectie({ data }: { data: GebruikAnalyse }) {
  const meta = stroomMap(data.stromen)
  return (
    <section className="mb-12">
      <SectieKop nummer="03 · Ritme" titel="Komen ze terug in het ritme van de stroom?">
        Per stroom: van de actieve dagen in deze band die minstens één ritme geleden liggen, welk deel binnen het verwachte
        ritme gevolgd werd door een nieuwe actieve dag — die terugkeer mag ná de band vallen. Plus de mediane afstand tussen
        twee actieve dagen in die stroom.
      </SectieKop>
      {data.ritme.length === 0 ? (
        <LegeStaat>Nog geen ritmegegevens in deze band.</LegeStaat>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm" data-testid="ritme-tabel">
            <thead>
              <tr className="border-b border-[var(--border-ed)]">
                <Th>Stroom</Th>
                <Th>Verwacht ritme</Th>
                <Th>Binnen ritme teruggekomen</Th>
                <Th>Mediaan tussen actieve dagen</Th>
              </tr>
            </thead>
            <tbody>
              {data.ritme.map((r) => {
                const s = meta.get(r.id)
                return (
                  <tr key={r.id} className="border-b border-dotted border-[var(--border-ed)]" data-testid={`ritme-${r.id}`}>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink)]">
                        <Staaltje kleur={reeksKleur(s?.kleurIndex ?? -1)} />
                        {s?.naam ?? r.id}
                      </span>
                    </Td>
                    <Td>
                      {r.ritmeDagen != null ? (
                        <>
                          <span className="whitespace-nowrap">binnen {dagenTekst(r.ritmeDagen)}</span>
                          {s?.ritmeLabel && <span className="block text-xs text-[var(--ink-3)]">{s.ritmeLabel}</span>}
                        </>
                      ) : (
                        <>
                          <span className="italic text-[var(--ink-3)]">geen terugkeerritme verwacht</span>
                          {s?.ritmeLabel && <span className="block text-xs text-[var(--ink-3)]">{s.ritmeLabel}</span>}
                        </>
                      )}
                    </Td>
                    <Td>
                      {r.terug == null ? (
                        <span className="text-[var(--ink-3)]">—</span>
                      ) : r.ritmeDagen != null && r.ritmeDagen > data.band.totDagenGeleden ? (
                        <span className="text-xs italic text-[var(--ink-3)]" data-testid="band-te-dichtbij">
                          band ligt te dichtbij voor dit ritme — kies een oudere band
                        </span>
                      ) : r.aandeelTerug ? (
                        <>
                          <span className="font-mono tabular-nums text-[var(--ink)]">{procent(r.aandeelTerug.fractie)}</span>
                          <span className="ml-1.5 text-xs text-[var(--ink-3)]">
                            <CelWaarde cel={r.terug} /> van <CelWaarde cel={r.geschikt} />
                          </span>
                          <Waarschuwing a={r.aandeelTerug} />
                        </>
                      ) : (
                        <span className="text-xs text-[var(--ink-3)]">
                          <CelWaarde cel={r.terug} /> van <CelWaarde cel={r.geschikt} /> — te klein voor een percentage
                        </span>
                      )}
                    </Td>
                    <Td>
                      {r.mediaanDagen != null ? (
                        <>
                          <span className="font-mono tabular-nums text-[var(--ink)]">{dagenTekst(r.mediaanDagen)}</span>
                          {r.gatenGebruikers && (
                            <span className="ml-1.5 text-xs text-[var(--ink-3)]">
                              n = <CelWaarde cel={r.gatenGebruikers} />
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs italic text-[var(--ink-3)]">
                          te weinig gebruikers
                        </span>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ── 4. Doorstroom ──────────────────────────────────────────────────

export function DoorstroomSectie({ data }: { data: GebruikAnalyse }) {
  const paren = [...data.samen.paren].sort((x, y) => {
    const a = celGetal(x.gebruikers)
    const b = celGetal(y.gebruikers)
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return b - a
  })
  const parenMax = maxWaarde(paren.map((p) => p.gebruikers))
  const zichtbareParen = paren.slice(0, 10)

  return (
    <section className="mb-12">
      <SectieKop nummer="04 · Doorstroom" titel="Hoe mensen van dag tot dag bewegen">
        Dagen, geen schermen: een overgang is de stroom op een actieve dag naast de stroom op de <em>volgende</em> actieve
        dag van dezelfde persoon (niet per se de kalenderdag erna). Iemand telt één keer per overgang, hoe vaak die ook
        voorkwam. De schermvolgorde binnen één bezoek — een klassieke pagina-flow — meten we niet; dat is fase 2 (ADR 0154,
        voorstel). Een aparte matrix over álle opeenvolgende dagen staat hier bewust niet meer: de nullen daarin maakten
        verborgen cellen van de Sankey terug te rekenen.
      </SectieKop>

      <div className="mb-10">
        {data.sankey.status === 'ok' ? (
          <DoorstroomSankey
            sankey={data.sankey.data}
            stromen={data.stromen}
            kop={
              <>
                <BlokKop>Van actieve dag naar actieve dag</BlokKop>
                <p className="mb-3 text-xs text-[var(--ink-3)]">
                  Kolom = de eerste, tweede, derde en vierde actieve dag van iemand in deze band; een balk = de stroom van
                  die dag (&ldquo;meerdere&rdquo; als iemand die dag in meer dan één stroom actief was). Banddikte = aantal
                  gebruikers, één schaal voor alle kolommen. Het donkere stompje = wie daarna geen actieve dag meer had.
                  Een overgang met te weinig gebruikers gaat als geheel dicht.
                </p>
              </>
            }
          />
        ) : (
          <>
            <BlokKop>Van actieve dag naar actieve dag</BlokKop>
            {data.sankey.status === 'niet-uitgerold' ? (
              <LegeStaat>
                <span data-testid="sankey-niet-uitgerold">Doorstroom per dag: nog niet uitgerold.</span>
              </LegeStaat>
            ) : (
              <p className="text-sm italic text-[var(--ink-3)]" data-testid="sankey-fout">
                Doorstroom per dag kon niet worden geladen; de rest van deze sectie staat hieronder.
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-10">
        <BlokKop>App-delen op dezelfde dag</BlokKop>
        <p className="mb-3 text-xs text-[var(--ink-3)]">
          Welke twee app-delen iemand op één en dezelfde dag gebruikte — het aantal verschillende gebruikers per paar,
          meeste eerst.
        </p>
        {paren.length === 0 ? (
          <LegeStaat>Nog geen dagen waarop twee app-delen samen voorkwamen.</LegeStaat>
        ) : (
          <HorizontaleBalken
            rijen={zichtbareParen.map((p) => ({
              sleutel: `${p.a}|${p.b}`,
              label: `${MODULE_LABELS[p.a].split(' (')[0]} + ${MODULE_LABELS[p.b].split(' (')[0]}`,
              cel: p.gebruikers,
              kleur: NEUTRALE_REEKS,
            }))}
            schaalMax={parenMax}
            testId="samen-paren"
          />
        )}
        <TabelWeergave label={paren.length > zichtbareParen.length ? `Alle ${paren.length} paren en app-delen als tabel` : 'Paren en app-delen als tabel'}>
          <div className="grid gap-6 md:grid-cols-2">
            <table className="w-full min-w-[18rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-ed)]">
                  <Th>Paar</Th>
                  <Th rechts>Gebruikers</Th>
                </tr>
              </thead>
              <tbody>
                {paren.map((p) => (
                  <tr key={`${p.a}|${p.b}`} className="border-b border-dotted border-[var(--border-ed)]">
                    <Td>
                      {MODULE_LABELS[p.a]} + {MODULE_LABELS[p.b]}
                    </Td>
                    <Td rechts>
                      <CelWaarde cel={p.gebruikers} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full min-w-[18rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-ed)]">
                  <Th>App-deel</Th>
                  <Th rechts>Gebruikers</Th>
                </tr>
              </thead>
              <tbody>
                {data.samen.modules.map((m) => (
                  <tr key={m.module} className="border-b border-dotted border-[var(--border-ed)]">
                    <Td>{MODULE_LABELS[m.module]}</Td>
                    <Td rechts>
                      <CelWaarde cel={m.gebruikers} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabelWeergave>
      </div>
    </section>
  )
}

// ── 5. Levenscyclus per aanmeldmaand ───────────────────────────────

function Markering({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-block whitespace-nowrap border border-dashed border-[var(--border-md)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-3)]"
    >
      {children}
    </span>
  )
}

/**
 * Eén trechterstap. Een noemer van 0 heeft meer oorzaken, en maar één daarvan
 * is "nog niet verstreken" (eindreview 17-09-2026, B):
 *  - er is in deze maand niemand om te tellen (`basis` = aangemeld of gemeten is 0) → "—";
 *  - wel mensen, maar hun venster (week 2–5, maand 2) is nog niet om → markering.
 */
function StapCel({
  teller,
  noemer,
  basis,
  noemerTekst,
}: {
  teller: Cel
  noemer: Cel
  basis: Cel
  noemerTekst?: string
}) {
  const leeg = (c: Cel) => c.soort === 'waarde' && c.n === 0
  if (leeg(basis)) {
    return (
      <span className="text-[var(--ink-3)]" title="Niemand in deze maand om te tellen.">
        —
      </span>
    )
  }
  if (leeg(noemer)) {
    return <Markering testId="nog-niet-verstreken">nog niet verstreken</Markering>
  }
  const a = aandeel(teller, noemer)
  return (
    <>
      <CelWaarde cel={teller} className="text-[var(--ink)]" />
      {a ? (
        <span className="block text-[11px] text-[var(--ink-3)]">{aandeelTekst(a, noemerTekst)}</span>
      ) : (
        <span className="block text-[11px] text-[var(--ink-3)]">
          van <CelWaarde cel={noemer} />
          {noemerTekst ? ` ${noemerTekst}` : ''}
        </span>
      )}
    </>
  )
}

export function LevenscyclusSectie({ data }: { data: GebruikAnalyse }) {
  return (
    <section className="mb-12">
      <SectieKop nummer="05 · Levenscyclus" titel="Van aanmelding tot terugkeer, per aanmeldmaand">
        Elke stap met zijn eigen noemer. De activiteitsstappen tellen alleen wie ná de start van de meting is aangemeld;
        een maand die nog niet lang genoeg geleden is, krijgt geen nul maar &ldquo;nog niet verstreken&rdquo;, en een maand
        zonder aanmelders een streepje.
      </SectieKop>
      {data.cohorten.length === 0 ? (
        <LegeStaat>Nog geen aanmeldcohorten in dit segment.</LegeStaat>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm" data-testid="cohort-tabel">
            <thead>
              <tr className="border-b border-[var(--border-ed)]">
                <Th>Aanmeldmaand</Th>
                <Th>Aangemeld</Th>
                <Th>Onboarding klaar</Th>
                <Th>Eerste actieve dag</Th>
                <Th>Tweede actieve dag</Th>
                <Th>Actief week 2–5</Th>
                <Th>Actief maand 2</Th>
              </tr>
            </thead>
            <tbody>
              {data.cohorten.map((h) => {
                const voorMeting = h.dekking === 'geen'
                const sleutel = h.maand ?? 'eerder'
                return (
                  <tr key={sleutel} className="border-b border-dotted border-[var(--border-ed)]" data-testid={`cohort-${sleutel}`}>
                    <Td>
                      <span className="whitespace-nowrap font-medium text-[var(--ink)]">{maandLabel(h.maand)}</span>
                      {h.dekking === 'deels' && (
                        <span className="mt-1 block">
                          <Markering testId="deels-gemeten">deels gemeten</Markering>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <CelWaarde cel={h.aangemeld} className="text-[var(--ink)]" />
                    </Td>
                    <Td>
                      <StapCel teller={h.onboardingAfgerond} noemer={h.aangemeld} basis={h.aangemeld} />
                    </Td>
                    {voorMeting ? (
                      <td colSpan={4} className="py-1.5 align-top">
                        <Markering testId="voor-de-meting">vóór de meting</Markering>
                      </td>
                    ) : (
                      <>
                        <Td>
                          <StapCel teller={h.eersteDag} noemer={h.gemeten} basis={h.gemeten} noemerTekst={h.dekking === 'deels' ? 'gemeten' : undefined} />
                        </Td>
                        <Td>
                          <StapCel teller={h.tweedeDag} noemer={h.gemeten} basis={h.gemeten} noemerTekst={h.dekking === 'deels' ? 'gemeten' : undefined} />
                        </Td>
                        <Td>
                          <StapCel teller={h.week25} noemer={h.week25Noemer} basis={h.gemeten} />
                        </Td>
                        <Td>
                          <StapCel teller={h.maand2} noemer={h.maand2Noemer} basis={h.gemeten} />
                        </Td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ── 6. Eerste ervaring ─────────────────────────────────────────────

export function EersteErvaringSectie({ data }: { data: GebruikAnalyse }) {
  const ee = data.eersteErvaring
  const balken = (
    verdeling: Array<{ sleutel: string; label: string; cel: Cel }>,
    totaal: Cel,
    testId: string,
  ) => (
    <HorizontaleBalken
      testId={testId}
      schaalMax={maxWaarde(verdeling.map((v) => v.cel))}
      rijen={verdeling.map((v) => {
        const a = aandeel(v.cel, totaal)
        return { ...v, kleur: NEUTRALE_REEKS, toelichting: a ? aandeelTekst(a) : undefined }
      })}
    />
  )

  return (
    <section className="mb-12">
      <SectieKop nummer="06 · Eerste ervaring" titel="Wat nieuwe mensen als eerste tegenkomen">
        Stand per account in het segment (totaal <CelWaarde cel={ee.totaal} />), uit profielinstellingen — geen gedrag
        per scherm.
      </SectieKop>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kerncijfer label="Onboarding afgerond" cel={ee.onboardingAfgerond} sub={<AandeelOfNiets teller={ee.onboardingAfgerond} noemer={ee.totaal} />} />
        <Kerncijfer label="Weekbriefing-mail aan" cel={ee.briefingMailAan} sub={<AandeelOfNiets teller={ee.briefingMailAan} noemer={ee.totaal} />} />
        <Kerncijfer label="Minstens één check-in" cel={ee.checkinMinstensEen} sub={<AandeelOfNiets teller={ee.checkinMinstensEen} noemer={ee.totaal} />} />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div>
          <BlokKop>Rondleiding</BlokKop>
          {balken(
            ee.rondleiding.verdeling.map((r) => ({ sleutel: r.uitkomst, label: labelVan(RONDLEIDING_LABEL, r.uitkomst), cel: r.gebruikers })),
            ee.rondleiding.totaal,
            'rondleiding-balken',
          )}
        </div>
        <div>
          <BlokKop>Welkomstgids</BlokKop>
          {balken(
            ee.gids.verdeling.map((g) => ({ sleutel: g.stand, label: labelVan(GIDS_LABEL, g.stand), cel: g.gebruikers })),
            ee.gids.totaal,
            'gids-balken',
          )}
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            &ldquo;Afgerond&rdquo; is niet uit de database te bepalen: we zien alleen hoeveel stappen iemand zette en of de
            gids is weggeklikt.
          </p>
        </div>
        <div>
          <BlokKop>Uitgestelde onboardingvelden</BlokKop>
          {ee.uitgesteld.length === 0 ? (
            <LegeStaat>Niemand in dit segment heeft een onboardingveld uitgesteld.</LegeStaat>
          ) : (
            <HorizontaleBalken
              testId="uitgesteld-balken"
              schaalMax={maxWaarde(ee.uitgesteld.map((u) => u.gebruikers))}
              rijen={ee.uitgesteld.map((u) => ({
                sleutel: u.veld,
                label: labelVan(UITGESTELD_LABEL, u.veld),
                cel: u.gebruikers,
                kleur: NEUTRALE_REEKS,
              }))}
            />
          )}
          <p className="mt-2 text-xs text-[var(--ink-3)]">Eén persoon kan meerdere velden uitstellen; deze rijen tellen niet op tot het totaal.</p>
        </div>
        <div className="space-y-6">
          <div>
            <BlokKop>Homescherm</BlokKop>
            {balken(
              ee.homeScreen.verdeling.map((h) => ({ sleutel: h.waarde, label: labelVan(HOMESCHERM_LABEL, h.waarde), cel: h.gebruikers })),
              ee.homeScreen.totaal,
              'homescherm-balken',
            )}
          </div>
          <div>
            <BlokKop>Weergavemodus</BlokKop>
            {balken(
              ee.displayMode.verdeling.map((d) => ({ sleutel: d.waarde, label: labelVan(WEERGAVE_LABEL, d.waarde), cel: d.gebruikers })),
              ee.displayMode.totaal,
              'weergave-balken',
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
