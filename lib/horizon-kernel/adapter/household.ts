/**
 * Horizon-kernel adapter — huishouden/partner-laag (FASE 3, snede 3, gap-besluit V3).
 *
 * De partner-laag bovenop het adapter-fundament (snede 1/2). Implementeert besluit
 * **V3** (plan §7): de kern draait als **huishouden-run** — de partner wordt niet als
 * tweede persoon in één maandloop gepropt, maar via de **PT-parameterlaag** (`tables/
 * pt.ts`): partner-inkomen + partner-AOW/-pensioen komen als eigen maandkolom PT!K in
 * `CF!D`/`Ont!D`, en de fiscale verdubbeling loopt via `box3.personen = 2`. De
 * per-partner-weergaven zijn **aparte kernel-runs met deel-invoer** (`buildPerspectief-
 * Inputs`): elke partner draait solo op z'n eigen tijdas met z'n eigen potten +
 * aandeel in de gedeelde potten — eigenschaps-getest, geen parity-claim (de `gezin`/
 * `partner-aan`-fixtures dekken de kern-kant al).
 *
 * ## Wat deze module doet
 *  - `buildPartnerParams(...)` — partner-profiel → `PartnerParams` (PT!B2-B9). Wat de app
 *    níet in het profiel-oppervlak kent (partner-pensioen, partner-AOW-opbouw) krijgt een
 *    **gedocumenteerde default + `EventMappingNotice`** — nooit een stille gok.
 *  - `buildPerspectiefInputs(...)` — splitst één huishouden-invoer in twee per-partner
 *    deel-invoeren (potten/inkomens naar eigenaar, gedeeld naar aandeel — spiegelt de
 *    toewijzingsregels van `lib/household-projection.ts`) + de gecombineerde run (= de
 *    huishouden-invoer zelf).
 *
 * De koppelingen zelf (`box3.personen = 2`, `autoGebeurtenissen.leefsituatie =
 * 'Samenwonend'`) worden in `index.ts` gelegd zodra `KernelAdapterInput.partner` gezet is;
 * zonder partner blijft de kern-invoer **byte-identiek** aan snede 2b (inertie).
 *
 * App-zijde (mag app-types importeren). Pure functies; geen Supabase/Date.now/Math.random.
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { LifeEvent } from '@/lib/horizon-data'
import type { PartnerParams } from '../types'
import type { EventMappingNotice } from './events'
import type { KernelAdapterProfile } from './params'
import type { KernelAdapterInput } from './index'
import { AOW_SAMENWONEND_PP_PER_MAAND } from './defaults'

// ── Partner-invoer op de app-zijde ──────────────────────────────────────────────────

/**
 * Partner-blok op `KernelAdapterInput`. Draagt het **volledige** partner-profiel (dat
 * de PT-laag van de huishouden-run voedt én de solo-run van het partner-perspectief) +
 * optioneel de partner-eigen AOW-tabel en levensgebeurtenissen. `date_of_birth` in
 * `profile` is verplicht: zonder geboortedatum kan de partner-tijdas (PT!H/B10-B12) niet
 * gebouwd worden — `buildPartnerParams` gooit dan een duidelijke fout.
 */
export interface KernelAdapterPartner {
  /** Volledig partner-profiel (PT-parameters + de partner-perspectief-run). */
  readonly profile: KernelAdapterProfile
  /** AOW-leeftijd-tabel voor de partner-geboortedatum; valt terug op de top-level `aowRows`. */
  readonly aowRows?: readonly AowLeeftijdRow[]
  /** Levensgebeurtenissen van de partner (voor de partner-perspectief-run). Leeg → geen. */
  readonly lifeEvents?: readonly LifeEvent[]
}

/** `PartnerParams` (PT!B2-B9) + de aannames/notices die de mapping opleverde. */
export interface PartnerBuildResult {
  readonly partner: PartnerParams
  readonly notices: readonly EventMappingNotice[]
}

/**
 * Partner-profiel/-gegevens → `PartnerParams` (PT!B2-B9). Cel-voor-cel:
 *  - **B2 aanwezig** = `true` (dit blok bestaat → partner aanwezig; voedt ook `P!B19`).
 *  - **B3 geboortejaar** — uit `date_of_birth` (jaar). De partner-startleeftijd (PT!H) en
 *    de drempels (PT!B11/B12) leidt de kern zelf af uit `persoon.startjaar − B3`.
 *  - **B4 netto jaarinkomen** — `net_monthly_income × 12` (tot de partner-AOW-drempel).
 *  - **B5 AOW-leeftijd** — canonieke `lookupAowAge` op de partner-geboortedatum (fallback 67).
 *  - **B6/B7/B8 partner-pensioen** — de app kent GEEN partner-pensioen in het profiel-
 *    oppervlak → **gedocumenteerde default 0** (inert; startleeftijd = AOW-leeftijd, niet
 *    geïndexeerd) + notice. Open punt voor FASE 4/5 (partner-pensioen-bron).
 *  - **B9 AOW-bedrag p.p./jaar** — samenwonend-tarief (`AOW_SAMENWONEND_PP_PER_MAAND
 *    × 12`), **consistent met de hoofd-persoon-bron** (kern-B21 samenwonend zodra
 *    `leefsituatie = 'Samenwonend'`). Volle opbouw aangenomen — de app kent de partner-
 *    AOW-opbouwjaren niet → notice.
 *
 * Gooit bij ontbrekende partner-geboortedatum (net als de hoofd-persoon-tijdas).
 */
export function buildPartnerParams(
  partner: KernelAdapterPartner,
  aowRows: readonly AowLeeftijdRow[],
): PartnerBuildResult {
  const dob = partner.profile.date_of_birth
  if (!dob) {
    throw new Error(
      'buildPartnerParams: partner.profile.date_of_birth ontbreekt — kan geen partner-tijdas bouwen',
    )
  }

  const notices: EventMappingNotice[] = []
  const geboortejaar = new Date(dob).getFullYear()
  const nettoJaarinkomen = Number(partner.profile.net_monthly_income ?? 0) * 12
  const aow = lookupAowAge([...(partner.aowRows ?? aowRows)], dob)

  // Partner-pensioen: geen profiel-veld → gedocumenteerde inerte default + notice.
  notices.push({
    kind: 'info',
    message:
      'Partner-pensioen (bruto/jaar, startleeftijd, indexatie) is niet in het profiel bekend — op 0 gezet (gedocumenteerde default, FASE 4/5).',
  })
  // Partner-AOW: samenwonend-tarief, volle opbouw aangenomen (app kent partner-opbouw niet).
  notices.push({
    kind: 'info',
    message:
      'Partner-AOW aangenomen op het samenwonend-tarief met volledige opbouw (de app kent de partner-AOW-opbouwjaren niet).',
  })

  return {
    partner: {
      aanwezig: true,
      geboortejaar,
      nettoJaarinkomen,
      aowLeeftijd: aow.fractional,
      // Pensioen inert (bedrag 0); startleeftijd = AOW-leeftijd zodat de PT!B12-drempel
      // een zinnige (ongebruikte) waarde heeft, niet geïndexeerd.
      pensioenBrutoPerJaar: 0,
      pensioenStartleeftijd: Math.round(aow.fractional),
      pensioenGeindexeerd: false,
      aowBedragPpPerJaar: AOW_SAMENWONEND_PP_PER_MAAND * 12,
    },
    notices,
  }
}

// ── Per-partner-perspectief (aparte kernel-runs met deel-invoer) ─────────────────────

/**
 * Eigenaar-toewijzing + gedeelde-potten-verdeling voor `buildPerspectiefInputs`.
 * `gedeeldAandeelHoofd` (0..1) is het aandeel van de hoofd-persoon in de GEDEELDE
 * potten (de partner krijgt het complement); default 0,5. De caller berekent dit uit de
 * huishoud-split-mode (`computeSharePct / 100`), net als `household-projection.ts`.
 */
export interface HouseholdSplit {
  /** user_id van de hoofd-persoon (eigenaar van de top-level `profile`). */
  readonly hoofdUserId: string
  /** user_id van de partner (eigenaar van `partner.profile`). */
  readonly partnerUserId: string
  /** Aandeel (0..1) van de hoofd-persoon in gedeelde potten; partner = 1 − aandeel. Default 0,5. */
  readonly gedeeldAandeelHoofd?: number
}

/** De drie deel-invoeren van een huishouden: twee solo-perspectieven + de gecombineerde run. */
export interface PerspectiefInputs {
  /** Hoofd-persoon-perspectief: solo-run met eigen persoonlijke potten + aandeel gedeeld. */
  readonly hoofd: KernelAdapterInput
  /** Partner-perspectief: solo-run met partner-persoonlijke potten + partner-aandeel gedeeld. */
  readonly partner: KernelAdapterInput
  /** Gecombineerde run = de huishouden-invoer zelf (met partner-blok → PT-laag + personen=2). */
  readonly gecombineerd: KernelAdapterInput
}

/** Numerieke clamp naar [0,1] (NaN → 0,5, het neutrale 50/50-aandeel). */
function clampFractie(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0.5
  return Math.min(1, Math.max(0, n))
}

/** Schaal een gedeelde bezitting naar een aandeel (waarde + maandinleg; overige velden ongemoeid). */
function scaleAsset(a: Asset, frac: number): Asset {
  return {
    ...a,
    current_value: Number(a.current_value) * frac,
    monthly_contribution: Number(a.monthly_contribution) * frac,
  }
}

/** Schaal een gedeelde schuld naar een aandeel (saldo + betalingen). */
function scaleDebt(d: Debt, frac: number): Debt {
  return {
    ...d,
    current_balance: Number(d.current_balance) * frac,
    monthly_payment: Number(d.monthly_payment) * frac,
    minimum_payment: Number(d.minimum_payment) * frac,
  }
}

/**
 * Bezittingen voor één eigenaar-perspectief: persoonlijke potten van díe eigenaar 1:1,
 * gedeelde potten geschaald naar `sharedFrac`. Persoonlijke potten van de andere partner
 * vallen weg. Spiegelt `household-projection.ts#scaleSharedAssets` (personal + shared×frac).
 */
function assetsForOwner(assets: readonly Asset[], ownerId: string, sharedFrac: number): Asset[] {
  const out: Asset[] = []
  for (const a of assets) {
    if (a.ownership === 'shared') out.push(scaleAsset(a, sharedFrac))
    else if (a.user_id === ownerId) out.push(a)
  }
  return out
}

/**
 * Schulden voor één eigenaar-perspectief. Persoonlijke schulden 1:1 naar de eigenaar;
 * gedeelde schulden naar `partner_split_pct` (het % van de schuld-EIGENAAR; de ander
 * draagt het complement) of anders naar `sharedFrac`. Spiegelt exact
 * `household-projection.ts#scaleSharedDebts` (+ `household-data.ts#debtShareFraction`),
 * zodat het aandeel overal identiek is. Gedeelde schulden zonder matchende `user_id`
 * vallen terug op `sharedFrac` (som blijft 100%).
 */
function debtsForOwner(
  debts: readonly Debt[],
  ownerId: string,
  sharedFrac: number,
): Debt[] {
  const out: Debt[] = []
  for (const d of debts) {
    if (d.ownership === 'shared') {
      let frac = sharedFrac
      if (d.partner_split_pct != null) {
        const ownerFrac = d.partner_split_pct / 100
        frac = d.user_id === ownerId ? ownerFrac : 1 - ownerFrac
      }
      out.push(scaleDebt(d, frac))
    } else if (d.user_id === ownerId) {
      out.push(d)
    }
  }
  return out
}

/**
 * Splits één huishouden-invoer in drie deel-invoeren voor de weergave-runs (V3):
 *  - **hoofd** — solo-run op `household.profile` met de hoofd-persoonlijke potten + het
 *    hoofd-aandeel van de gedeelde potten;
 *  - **partner** — solo-run op `household.partner.profile` met de partner-persoonlijke
 *    potten + het partner-aandeel; géén partner-blok (solo, personen=1);
 *  - **gecombineerd** — de huishouden-invoer zelf (partner-blok → PT-laag + personen=2).
 *
 * Toewijzingsregels (spiegel `household-projection.ts`): persoonlijke potten landen bij
 * precies één eigenaar; gedeelde potten worden per aandeel gesplitst zodat de som van de
 * twee perspectieven exact de huishouden-som is (geen dubbeltelling, geen verlies). De
 * inkomens splitsen impliciet mee: elk perspectief gebruikt het inkomen van z'n eigen
 * profiel (hoofd-inkomen → hoofd-run/CF!D; partner-inkomen → partner-run/CF!D én, in de
 * gecombineerde run, de partner-PT-laag).
 *
 * **Afwijkingen t.o.v. `household-projection.ts` (gedocumenteerd):** de privacy-degrade
 * ('totals'/'hidden' → aggregaat/verborgen), de gecombineerde uitgave-methoden
 * (`auto_shared`/`sum_partners`/`custom`) en de dual-AOW-omrekening op de head-as horen
 * bij het weergave-oppervlak (FASE 4/5) — de adapter levert alleen de deel-INVOER. In de
 * gecombineerde run drijft de PT-laag het partner-inkomen; de gecombineerde uitgaven
 * komen (nog) uit `household.profile` — de caller zet daar een huishoud-brede
 * uitgave-schatting (open punt FASE 4/5).
 */
export function buildPerspectiefInputs(
  household: KernelAdapterInput,
  split: HouseholdSplit,
): PerspectiefInputs {
  const partnerBlok = household.partner
  if (!partnerBlok) {
    throw new Error('buildPerspectiefInputs: geen partner-blok op de huishouden-invoer — niets te splitsen')
  }

  const hoofdFrac = clampFractie(split.gedeeldAandeelHoofd)
  const partnerFrac = 1 - hoofdFrac

  const hoofd: KernelAdapterInput = {
    profile: household.profile,
    assets: assetsForOwner(household.assets, split.hoofdUserId, hoofdFrac),
    debts: debtsForOwner(household.debts, split.hoofdUserId, hoofdFrac),
    lifeEvents: household.lifeEvents,
    aowRows: household.aowRows,
    taxYear: household.taxYear,
    // geen partner → solo-run (personen=1, geen PT-laag)
  }

  const partner: KernelAdapterInput = {
    profile: partnerBlok.profile,
    assets: assetsForOwner(household.assets, split.partnerUserId, partnerFrac),
    debts: debtsForOwner(household.debts, split.partnerUserId, partnerFrac),
    lifeEvents: partnerBlok.lifeEvents,
    aowRows: partnerBlok.aowRows ?? household.aowRows,
    taxYear: household.taxYear,
    // geen partner → solo-run
  }

  return { hoofd, partner, gecombineerd: household }
}
