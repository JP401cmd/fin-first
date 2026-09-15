import { z } from 'zod'

/**
 * Verspreiding van een vragenlijst — WIE krijgt 'm, en hoe dringend wordt hij
 * aangeboden (ADR 0147, gerichte verspreiding van vragenlijsten).
 *
 * Eén jsonb-kolom `questionnaires.verspreiding` draagt dit object. `null` (alle
 * lijsten van vóór de kolom) betekent exact het oude gedrag: iedereen ziet de
 * lijst zodra hij actief is, alleen via het icoon in Fins chat, zonder popup.
 * `parseVerspreiding` vertaalt een ontbrekende waarde naar die standaard; een
 * kapotte (niet-null) waarde valt juist DICHT — een gerichte lijst mag door een
 * kapot veld nooit voor iedereen zichtbaar worden.
 *
 * TARGETING IS EEN VERSPREIDINGSVOORKEUR, GEEN BEVEILIGINGSGRENS. De RLS op
 * `questionnaires` blijft `is_active`; deze module bepaalt in de applicatielaag
 * (GET /api/questionnaires) wat de gebruiker te zien krijgt. Daarom staan hier
 * uitsluitend REGELS en instellingen — nooit gebruikers-id's: de lijstrij is
 * leesbaar voor elke ingelogde gebruiker. Handmatige toewijzing leeft in de
 * per-gebruiker tabel `questionnaire_invitations`.
 *
 * REGELS zijn compute-on-read: ze worden per gebruiker geëvalueerd op eigen-rij
 * meta (registratiedatum, actieve dagen, dominante waardestroom). Geen batch,
 * geen cron. Timing ("na N actieve dagen") ís een regel — een lijst zonder
 * regels is "direct".
 */

// ── Regels ────────────────────────────────────────────────────────────────────

export const RegelSchema = z.discriminatedUnion('soort', [
  /** De gebruiker is minstens `min` dagen geleden geregistreerd (tenure). */
  z.object({ soort: z.literal('dagen_sinds_registratie'), min: z.number().int().min(0).max(3650) }),
  /** Minstens `min` actieve dagen in de laatste 30 dagen (user_activity_days). */
  z.object({ soort: z.literal('actieve_dagen_30'), min: z.number().int().min(1).max(30) }),
  /** Laatst actief hoogstens `dagen` dagen geleden. */
  z.object({ soort: z.literal('laatst_actief_binnen'), dagen: z.number().int().min(1).max(365) }),
  /**
   * De dominante waardestroom van de gebruiker is `stroom` (fase 2, gemeten via
   * user_activity_modules). Zolang die meting ontbreekt matcht deze regel nooit.
   */
  z.object({
    soort: z.literal('dominante_stroom'),
    stroom: z.string().min(1).max(40),
    min_dagen: z.number().int().min(1).max(30).optional(),
  }),
])
export type Regel = z.infer<typeof RegelSchema>
export type RegelSoort = Regel['soort']

export const REGEL_SOORTEN: readonly RegelSoort[] = [
  'dagen_sinds_registratie',
  'actieve_dagen_30',
  'laatst_actief_binnen',
  'dominante_stroom',
]

export const REGELS_MAX = 10

// ── Doelgroep + popup ─────────────────────────────────────────────────────────

export const DOELGROEP_MODI = ['iedereen', 'regels', 'handmatig', 'groepen'] as const
export type DoelgroepModus = (typeof DOELGROEP_MODI)[number]

const uuid = z.uuid('Ongeldige verwijzing')

export const POPUP_STANDAARD = {
  aan: false,
  cooldown_dagen: 14,
  snooze_dagen: 7,
  max_weigeringen: 2,
} as const

export const PopupSchema = z.object({
  aan: z.boolean().default(POPUP_STANDAARD.aan),
  /** Na een getoonde popup minstens zoveel dagen stil (deskresearch: 14, beta 7). */
  cooldown_dagen: z.number().int().min(1).max(90).default(POPUP_STANDAARD.cooldown_dagen),
  /** "Later" = zoveel dagen niet meer vragen. */
  snooze_dagen: z.number().int().min(1).max(30).default(POPUP_STANDAARD.snooze_dagen),
  /** Na zoveel keer "Later" definitief stil (de teller blijft wél staan). */
  max_weigeringen: z.number().int().min(1).max(5).default(POPUP_STANDAARD.max_weigeringen),
})

export const VerspreidingSchema = z.object({
  doelgroep: z.object({
    modus: z.enum(DOELGROEP_MODI),
    /** AND-combinatie. Alleen betekenisvol bij modus 'regels'. */
    regels: z.array(RegelSchema).max(REGELS_MAX).default([]),
    /** Alleen betekenisvol bij modus 'groepen' (fase 3). */
    groep_ids: z.array(uuid).max(20).default([]),
  }),
  popup: PopupSchema.prefault({}),
})
export type Verspreiding = z.infer<typeof VerspreidingSchema>

export const STANDAARD_VERSPREIDING: Verspreiding = {
  doelgroep: { modus: 'iedereen', regels: [], groep_ids: [] },
  popup: { ...POPUP_STANDAARD },
}

/**
 * Wat een ONGELDIGE (niet-null) verspreiding betekent: niemand via doelgroep,
 * geen popup. Wie al een uitnodiging of een open sessie heeft, houdt die.
 */
export const ONGELDIGE_VERSPREIDING: Verspreiding = {
  doelgroep: { modus: 'handmatig', regels: [], groep_ids: [] },
  popup: { ...POPUP_STANDAARD, aan: false },
}

/**
 * Null-veilige lezer van de jsonb-kolom — nooit een throw.
 *
 *  - `null`/ontbrekend (lijsten van vóór de kolom) → de standaard: iedereen,
 *    direct, geen popup. Dat is exact het oude gedrag.
 *  - ongeldig maar níet null (een kapotte of toekomstige vorm) → FAIL-CLOSED:
 *    {@link ONGELDIGE_VERSPREIDING}. Een lijst voor drie gekozen personen mag
 *    door een kapot veld nooit voor iedereen zichtbaar worden; beheer ziet het
 *    in de verspreiding-sheet als "0 personen" en kan het herstellen.
 */
export function parseVerspreiding(raw: unknown): Verspreiding {
  if (raw == null) return structuredClone(STANDAARD_VERSPREIDING)
  const parsed = VerspreidingSchema.safeParse(raw)
  return parsed.success ? parsed.data : structuredClone(ONGELDIGE_VERSPREIDING)
}

/** Korte samenvatting voor de beheerlijst ("iedereen", "3 regels", "handmatig"). */
export function verspreidingSamenvatting(v: Verspreiding, handmatigAantal = 0): string {
  switch (v.doelgroep.modus) {
    case 'iedereen':
      return 'iedereen'
    case 'regels':
      return v.doelgroep.regels.length === 1 ? '1 regel' : `${v.doelgroep.regels.length} regels`
    case 'handmatig':
      return handmatigAantal === 1 ? '1 persoon' : `${handmatigAantal} personen`
    case 'groepen':
      return v.doelgroep.groep_ids.length === 1 ? '1 groep' : `${v.doelgroep.groep_ids.length} groepen`
  }
}

// ── Gebruikerscontext (eigen-rij meta, geen inhoud) ───────────────────────────

export interface GebruikerContext {
  /** profiles.created_at; null als onbekend. */
  registratie: Date | null
  /** Aantal actieve dagen in de laatste 30 (user_activity_days); null = niet gemeten. */
  actieveDagen30: number | null
  /** Laatste actieve dag; null = niet gemeten of nooit. */
  laatstActief: Date | null
  /** Dominante waardestroom (fase 2); null zolang niet gemeten of geen winnaar. */
  dominanteStroom: string | null
  /** Actieve dagen per stroom (fase 2), voor `min_dagen`. */
  dagenPerStroom?: Record<string, number>
  nu: Date
}

const DAG_MS = 86_400_000

function dagenTussen(vroeger: Date, later: Date): number {
  return Math.floor((later.getTime() - vroeger.getTime()) / DAG_MS)
}

/** Toets één regel. Onbekende meta (null) matcht nooit — liever te weinig dan te veel prompts. */
export function evalueerRegel(regel: Regel, ctx: GebruikerContext): boolean {
  switch (regel.soort) {
    case 'dagen_sinds_registratie':
      return ctx.registratie != null && dagenTussen(ctx.registratie, ctx.nu) >= regel.min
    case 'actieve_dagen_30':
      return ctx.actieveDagen30 != null && ctx.actieveDagen30 >= regel.min
    case 'laatst_actief_binnen':
      return ctx.laatstActief != null && dagenTussen(ctx.laatstActief, ctx.nu) <= regel.dagen
    case 'dominante_stroom': {
      if (ctx.dominanteStroom !== regel.stroom) return false
      if (regel.min_dagen == null) return true
      return (ctx.dagenPerStroom?.[regel.stroom] ?? 0) >= regel.min_dagen
    }
  }
}

/**
 * AND over alle regels. Een lege regellijst matcht NIET: modus 'regels' zonder
 * regels is een half ingevulde instelling, geen "iedereen" — dat is een aparte,
 * bewuste modus.
 */
export function evalueerRegels(regels: readonly Regel[], ctx: GebruikerContext): { match: boolean; gematcht: Regel[] } {
  if (regels.length === 0) return { match: false, gematcht: [] }
  const gematcht = regels.filter((r) => evalueerRegel(r, ctx))
  return { match: gematcht.length === regels.length, gematcht }
}

// ── Uitnodiging (rij in questionnaire_invitations) ────────────────────────────

export const UITNODIGING_BRONNEN = ['regel', 'handmatig', 'groep'] as const
export type UitnodigingBron = (typeof UITNODIGING_BRONNEN)[number]

export interface UitnodigingStaat {
  bron: UitnodigingBron
  invited_at: string
  shown_at: string | null
  snoozed_until: string | null
  dismissed_at: string | null
  dismiss_count: number
}

export interface ZichtbaarheidInput {
  verspreiding: Verspreiding
  ctx: GebruikerContext
  invitation: UitnodigingStaat | null
  /** Een eigen open sessie houdt de lijst altijd zichtbaar: wat je begon, mag je afmaken. */
  heeftOpenSessie: boolean
  /** Fase 3: matcht een dynamische groep. Ontbreekt → false. */
  groepMatch?: boolean
}

export type Zichtbaarheid =
  | { zichtbaar: false }
  | { zichtbaar: true; via: 'open_sessie' | 'uitnodiging' | 'iedereen' | 'regels' | 'groep'; gematcht?: Regel[] }

/** Is deze lijst voor déze gebruiker zichtbaar, en waardoor? */
export function zichtbaarVoor(input: ZichtbaarheidInput): Zichtbaarheid {
  const { verspreiding, ctx, invitation, heeftOpenSessie, groepMatch } = input
  if (heeftOpenSessie) return { zichtbaar: true, via: 'open_sessie' }
  if (invitation && (invitation.bron === 'handmatig' || invitation.bron === 'groep')) {
    return { zichtbaar: true, via: 'uitnodiging' }
  }
  switch (verspreiding.doelgroep.modus) {
    case 'iedereen':
      return { zichtbaar: true, via: 'iedereen' }
    case 'regels': {
      const r = evalueerRegels(verspreiding.doelgroep.regels, ctx)
      return r.match ? { zichtbaar: true, via: 'regels', gematcht: r.gematcht } : { zichtbaar: false }
    }
    case 'handmatig':
      return { zichtbaar: false }
    case 'groepen':
      return groepMatch ? { zichtbaar: true, via: 'groep' } : { zichtbaar: false }
  }
}

// ── Teller en popup ───────────────────────────────────────────────────────────

export interface OpenLijstInput {
  id: string
  /** questionnaires.created_at — volgorde-fallback zolang er geen uitnodigingsrij is. */
  created_at: string
  verspreiding: Verspreiding
  invitation: UitnodigingStaat | null
  has_completed: boolean
}

/**
 * "Open" = de gebruiker kan 'm nu invullen en heeft niet "niet meer" gezegd.
 * Dit is de N van de teller (ADR 0147): eindig, scherp, en hij daalt alleen
 * door handelen (invullen of definitief weigeren), niet door kijken.
 */
export function isOpenVoorGebruiker(l: OpenLijstInput): boolean {
  if (l.has_completed) return false
  if (l.invitation?.dismissed_at) return false
  return true
}

export function telOpen(lijsten: readonly OpenLijstInput[]): number {
  return lijsten.filter(isOpenVoorGebruiker).length
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

/** Mag de popup voor déze lijst nu verschijnen? */
export function popupToegestaan(l: OpenLijstInput, nu: Date): boolean {
  if (!l.verspreiding.popup.aan) return false
  if (!isOpenVoorGebruiker(l)) return false
  const inv = l.invitation
  if (!inv) return true
  if (inv.dismiss_count >= l.verspreiding.popup.max_weigeringen) return false
  const snooze = ms(inv.snoozed_until)
  if (snooze != null && snooze > nu.getTime()) return false
  const shown = ms(inv.shown_at)
  if (shown != null && nu.getTime() - shown < l.verspreiding.popup.cooldown_dagen * DAG_MS) return false
  return true
}

/**
 * Hoogstens ÉÉN popup tegelijk (deskresearch: één open prompt). Oudste
 * uitnodiging eerst; zonder rij telt de aanmaakdatum van de lijst.
 */
export function popupKandidaat(lijsten: readonly OpenLijstInput[], nu: Date): string | null {
  const kandidaten = lijsten
    .filter((l) => popupToegestaan(l, nu))
    .map((l) => ({ id: l.id, t: ms(l.invitation?.invited_at) ?? ms(l.created_at) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.t - b.t)
  return kandidaten[0]?.id ?? null
}

/** Body van PATCH /api/questionnaires/[id]/uitnodiging. */
export const UitnodigingActieSchema = z.object({
  actie: z.enum(['gezien', 'later', 'niet_meer']),
})
export type UitnodigingActie = z.infer<typeof UitnodigingActieSchema>['actie']

/** De nieuwe uitnodigingsstaat na een actie van de gebruiker (puur, testbaar). */
export function pasActieToe(
  huidig: Pick<UitnodigingStaat, 'shown_at' | 'snoozed_until' | 'dismissed_at' | 'dismiss_count'>,
  actie: UitnodigingActie,
  popup: Verspreiding['popup'],
  nu: Date,
): Pick<UitnodigingStaat, 'shown_at' | 'snoozed_until' | 'dismissed_at' | 'dismiss_count'> {
  const nuIso = nu.toISOString()
  switch (actie) {
    case 'gezien':
      // Alleen de EERSTE keer stempelen: de cooldown rekent vanaf de laatste
      // popup, en die wordt bij 'later' al opnieuw gezet via snoozed_until.
      return { ...huidig, shown_at: huidig.shown_at ?? nuIso }
    case 'later':
      return {
        ...huidig,
        shown_at: huidig.shown_at ?? nuIso,
        snoozed_until: new Date(nu.getTime() + popup.snooze_dagen * DAG_MS).toISOString(),
        dismiss_count: Math.min(huidig.dismiss_count + 1, 10),
      }
    case 'niet_meer':
      return { ...huidig, shown_at: huidig.shown_at ?? nuIso, dismissed_at: nuIso }
  }
}

/**
 * Beheer-body: verspreiding + de handmatig gekozen personen. Die id's leven NIET
 * in de lijstrij maar worden door de beheerroute naar `questionnaire_invitations`
 * (bron 'handmatig') gesynchroniseerd; het e-mailadres gaat mee in `bron_detail`
 * zodat de beheerlijst 'm kan tonen zonder een tweede auth-lookup.
 */
export const HandmatigLidSchema = z.object({
  user_id: uuid,
  // Een echt adres: de sheet vult het uit de e-mailzoeker, maar de route slaat
  // op wat de client stuurt en toont het terug — dus geen vrije tekst.
  email: z.email().max(320).optional(),
})
export type HandmatigLid = z.infer<typeof HandmatigLidSchema>

export const VerspreidingBeheerSchema = VerspreidingSchema.extend({
  handmatig: z.array(HandmatigLidSchema).max(500).default([]),
}).superRefine((v, ctx) => {
  // Alleen bij het OPSLAAN: een half ingevulde doelgroep is een invoerfout, geen
  // stille "niemand". (Bij het lezen van oude rijen blijft parseVerspreiding
  // mild — daar hoort deze eis niet.)
  if (v.doelgroep.modus === 'regels' && v.doelgroep.regels.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['doelgroep', 'regels'], message: 'Voeg minstens één regel toe' })
  }
  if (v.doelgroep.modus === 'groepen' && v.doelgroep.groep_ids.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['doelgroep', 'groep_ids'], message: 'Kies minstens één groep' })
  }
})
export type VerspreidingBeheer = z.infer<typeof VerspreidingBeheerSchema>
