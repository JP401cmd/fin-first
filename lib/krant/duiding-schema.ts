// ── Duiding v1: het gesloten schema van een geduid nieuwsartikel ─────────────
//
// Twee vormen van hetzelfde contract:
//
//   `duidingModelSchema`  wat het model TERUGGEEFT via generateObject. Gesloten:
//                         elke waarde is een enum, een getal, een datum of een
//                         citaat. `grond` is hier een lijst (structured output
//                         werkt betrouwbaarder met arrays dan met records).
//   `duidingV1Schema`     wat in `news_articles.duiding` (jsonb) STAAT, na de
//                         codecontroles: dezelfde velden plus `versie`, `grond`
//                         als record en `meta` (door code gezet, nooit door het
//                         model). Dit is wat 1B leest.
//
// Alles buiten het schema wordt geweigerd (`strictObject`). Wat het model niet
// mag doen, staat niet in de prompt maar hier: geen vrije rubriek (dat is
// `category`, keuze 5), geen vrije mechanismen, geen bedragen zonder citaat.
//
// B3: de algemene samenvatting per artikel wordt in dezelfde stap geschreven en
// gaat door dezelfde controles (keuze 6: in de jsonb, `summary` blijft voor de
// LLM-editie). B2: nergens een dag, een dagtarief of een uitgavenband.
//
// Versiebeleid: `DUIDING_VERSIE` bumpt bij elke wijziging van het schema of de
// controles. Rijen met een lagere versie gaan terug op 'wacht' en worden
// opnieuw geduid — herleiden, niet ophogen (importtoets 3).

import { z } from 'zod'
import { DOELGROEP_SLEUTEL_LIJST } from './profiel-velden'
import { MECHANISMEN, type MechanismeId } from './mechanismen'
import { DREMPEL_SLEUTELS } from './drempels'

/**
 * 2 (22-09-2026, ADR 0176 · 1F fase 2): de grondslag is het EIGEN bronfragment
 * + de bronkop in plaats van de hele opgehaalde paginatekst, `samenvatting` is
 * nullable (de tekstpoort, B26) en `meta` draagt de grondslag met haar hash en
 * de poortuitslag. De bump zet elke v1-rij via `duidWachtendeArtikelen` terug
 * op 'wacht' — herleiden, niet ophogen.
 */
export const DUIDING_VERSIE = 2

export const DUIDING_SOORTEN = [
  'besloten',
  'voorstel',
  'verwachting',
  'cijfer',
  'marktbeweging',
  'achtergrond',
] as const
export type DuidingSoort = (typeof DUIDING_SOORTEN)[number]

export const DEADLINE_SOORTEN = ['aanvraag', 'aangifte', 'bezwaar', 'einde-regeling'] as const
export type DeadlineSoort = (typeof DEADLINE_SOORTEN)[number]

export const DOELGROEP_OPS = ['is', 'in', 'bevat', 'minstens', 'hoogstens'] as const
export type DoelgroepOp = (typeof DOELGROEP_OPS)[number]

/** ISO-datum (YYYY-MM-DD). De plausibiliteit van het jaar toetst de controle. */
const isoDatum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const doelgroepRegelSchema = z.strictObject({
  veld: z.enum(DOELGROEP_SLEUTEL_LIJST as [string, ...string[]]),
  op: z.enum(DOELGROEP_OPS),
  // Bandsleutels zijn kort; de bovengrens houdt geïnjecteerde vrije tekst buiten de deur.
  waarden: z.array(z.string().min(1).max(40)).min(1),
})
export type DoelgroepRegel = z.infer<typeof doelgroepRegelSchema>

export const deadlineSchema = z.strictObject({
  datum: isoDatum,
  soort: z.enum(DEADLINE_SOORTEN),
})
export type Deadline = z.infer<typeof deadlineSchema>

const drempel = z.enum(DREMPEL_SLEUTELS).nullable()

/**
 * Eén lid per mechanisme, met diens eigen gesloten params-schema. `drempel`
 * is de sleutel van de BESTAANDE grens die dit mechanisme raakt (bij naam,
 * waarde uit lib/krant/drempels.ts) — nooit een bedrag.
 *
 * De leden staan expliciet (geen `.map` over MECHANISME_IDS): alleen zo houdt
 * elk lid zijn literal `soort` en is `Mechanisme` op typeniveau echt
 * gediscrimineerd — `Extract<Mechanisme, { soort: 'box3-parameter' }>` geeft
 * dan de box 3-params, wat de matcher (1B) nodig heeft. De dekking (elk id
 * precies één lid) bewaakt duiding-schema.test.ts.
 */
function lid<Id extends MechanismeId>(id: Id) {
  return z.strictObject({ soort: z.literal(id), params: MECHANISMEN[id].params, drempel })
}
export const mechanismeSchema = z.discriminatedUnion('soort', [
  lid('box3-parameter'),
  lid('box1-parameter'),
  lid('studieschuld-rente'),
  lid('aow-leeftijd'),
  lid('eigen-risico'),
  lid('toeslag-regel'),
  lid('huurverhoging-max'),
  lid('pensioenregeling'),
  lid('spaarrente-markt'),
  lid('hypotheekrente-markt'),
  lid('inflatie-cijfer'),
  lid('beursbeweging'),
])
export type Mechanisme = z.infer<typeof mechanismeSchema>

/**
 * NULLABLE sinds v2 (B26/B27): een lege samenvatting mag. Het model mag zelf
 * null teruggeven wanneer het eigen fragment niets te zeggen heeft, en de
 * tekstpoort (`duiding-controles.ts`) zet 'm op null wanneer de tekst een
 * controle niet haalt. De lezer krijgt dan de BRONKOP + de link, zonder
 * samenvatting; de rij blijft 'geduid'. Er komt nooit een modelkop in de
 * Krant — vandaar dat dit schema geen kop-/titelveld heeft (G4).
 */
const samenvatting = z.string().min(20).max(600).nullable()

/** Wat het model teruggeeft. */
export const duidingModelSchema = z.strictObject({
  soort: z.enum(DUIDING_SOORTEN),
  ingangsdatum: isoDatum.nullable(),
  deadline: deadlineSchema.nullable(),
  /** Leeg = algemeen nieuws (geen doelgroep). */
  doelgroep: z.array(doelgroepRegelSchema),
  mechanisme: mechanismeSchema.nullable(),
  samenvatting,
  /**
   * Per numerieke param het letterlijke citaat uit de bron waarin het getal
   * staat. Kort (één zin of zinsdeel): de bovengrens borgt keuze 4 — de
   * volledige tekst wordt niet bewaard, alleen fragmenten.
   */
  grond: z.array(z.strictObject({ param: z.string().min(1).max(60), citaat: z.string().min(1).max(300) })),
})
export type DuidingModelUitvoer = z.infer<typeof duidingModelSchema>

/**
 * WAAR DE GRONDSLAG VANDAAN KWAM. De duiding leest sinds v2 uitsluitend de twee
 * eigen kolommen van de rij:
 *   fragment  `bron_fragment` (+ `bron_kop`) — het eigen stuk brontekst;
 *   kop       er was geen fragment, alleen de bronkop (een ECB-RSS-item zonder
 *             description bijvoorbeeld).
 * De oude soorten ('teaser' · 'volledig') bestaan niet meer: er is geen
 * paginatekst meer en geen opgehaalde volledige tekst.
 */
export const GRONDSLAG_SOORTEN = ['fragment', 'kop'] as const
export type GrondslagSoort = (typeof GRONDSLAG_SOORTEN)[number]

/** Waar `published_at` vandaan komt (kolom `news_articles.published_bron`, ADR 0176). */
export const PUBLISHED_BRONNEN = ['feed', 'meta', 'eerste_gezien'] as const
export type PublishedBron = (typeof PUBLISHED_BRONNEN)[number]

/** De uitslag van de TEKSTPOORT (B26). Alleen de code, nooit modeltekst. */
export const poortSchema = z.strictObject({
  status: z.enum(['groen', 'gedegradeerd']),
  /** De controlecode die degradeerde (`g1:…`, `g2:datum`, `g3:meta`, `g6:lexicon`); null bij groen. */
  reden: z.string().max(80).nullable(),
})
export type Poort = z.infer<typeof poortSchema>

/**
 * Door CODE gezet, nooit door het model. `kopBron` en `modeltekst` zijn
 * literals: ze leggen vast dat de kop van de bron komt en dat er geen
 * modeltekst in de grondslag zat. Dat lijkt overbodig — het is precies wat de
 * meting op G4 telt, zodat drift zichtbaar wordt in plaats van aangenomen.
 */
export const duidingMetaSchema = z.strictObject({
  grondslag: z.enum(GRONDSLAG_SOORTEN),
  /** sha256 (hex) van exact de grondslagtekst die in de prompt ging. De tekst zelf staat in `news_articles.bron_fragment`. */
  grondslagSha256: z.string().regex(/^[0-9a-f]{64}$/),
  tekens: z.number().int().nonnegative(),
  model: z.string(),
  kopBron: z.literal('bron'),
  modeltekst: z.literal(false),
  poort: poortSchema,
})
export type DuidingMeta = z.infer<typeof duidingMetaSchema>

/** Alles behalve de poort: wat de aanroeper aanlevert; `controleerDuiding` vult de poort. */
export type DuidingMetaZonderPoort = Omit<DuidingMeta, 'poort'>

/** Wat in `news_articles.duiding` staat — het leescontract voor 1B. */
export const duidingV1Schema = z.strictObject({
  versie: z.literal(DUIDING_VERSIE),
  soort: z.enum(DUIDING_SOORTEN),
  ingangsdatum: isoDatum.nullable(),
  deadline: deadlineSchema.nullable(),
  doelgroep: z.array(doelgroepRegelSchema),
  mechanisme: mechanismeSchema.nullable(),
  samenvatting,
  grond: z.record(z.string(), z.string()),
  meta: duidingMetaSchema,
})
export type DuidingV1 = z.infer<typeof duidingV1Schema>

/** Statussen van `news_articles.duiding_status` (CHECK in de migratie). */
export const DUIDING_STATUSSEN = ['wacht', 'geduid', 'afgewezen', 'mislukt', 'teruggetrokken'] as const
export type DuidingStatus = (typeof DUIDING_STATUSSEN)[number]

/** Redenen om een duiding terug te trekken (B4; CHECK in de migratie). */
export const TERUGTREK_REDENEN = ['fout-getal', 'verkeerde-doelgroep', 'verkeerd-mechanisme', 'anders'] as const
export type TerugtrekReden = (typeof TERUGTREK_REDENEN)[number]
