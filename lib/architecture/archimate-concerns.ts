// ── Aandachtspunten op de architectuur (gecureerd) ───────────────────────────
// Bekende schuld, drift en risico's, verankerd op de elementen waar ze spelen.
// Eén oogopslag op de plaat: wáár zit de spanning. Houd dit bij wanneer je een
// punt oplost (verwijderen) of er een nieuw structureel risico ontstaat.
//
// severity:
//   info  — bewuste situatie, geen actie nodig (bv. legacy-route die nog leeft)
//   debt  — technische schuld; opruimen levert onderhoudswinst
//   risk  — kan tot verkeerde uitkomsten of datalekken leiden; prioriteit

import type { ArchimateModel } from './archimate-model'

export type ArchiConcernSeverity = 'info' | 'debt' | 'risk'

export interface ArchiConcern {
  id: string
  title: string
  detail: string
  severity: ArchiConcernSeverity
  /** Element-id's waarop dit punt slaat */
  elementIds: string[]
}

export const ARCHI_CONCERNS: ArchiConcern[] = [
  {
    id: 'legacy-backing-routes',
    title: 'Legacy backing-routes blijven leven',
    detail:
      'De canonieke navigatie is /overzicht · /toekomst · /mijn, maar /core · /will · /horizon · /identity bestaan nog als backing-routes. Bewust, maar dubbele paden vergroten de kans op drift.',
    severity: 'info',
    elementIds: ['app-comp'],
  },
  {
    id: 'better-auth-scaffolding',
    title: 'Vermoedelijk dode better-auth-scaffolding',
    detail:
      'Supabase Auth is canoniek (RLS op auth.uid()). De better-auth-resten in src/lib zijn waarschijnlijk dood; opruimen voorkomt verwarring over welk auth-model geldt.',
    severity: 'debt',
    elementIds: ['t-supabase'],
  },
  {
    id: 'nav-shell-cleanup',
    title: 'Navigatie-redesign — fase 4 cleanup openstaand',
    detail:
      'De nieuwe sidebar/mobile-shell staat achter feature-flag new_navigation_shell. Fase 0-3 zijn af; de opruimfase (oude shell verwijderen) loopt nog.',
    severity: 'debt',
    elementIds: ['app-comp'],
  },
  {
    id: 'horizon-god-component',
    title: 'horizon-client.tsx is een god-component',
    detail:
      'Eén client van ~6900 regels draagt /toekomst zonder eigen tests. Decompositie loopt (stap 1 HorizonTrendGrid klaar); tot dan is dit het grootste wijzigingsrisico van de app.',
    severity: 'debt',
    elementIds: ['fn-toekomstplannen', 'as-planning'],
  },
  {
    id: 'checkin-island',
    title: 'Check-in rekent op een eigen eiland',
    detail:
      'De check-in gebruikt SWR 4%, “deze maand” en ongewogen vermogen, terwijl de rest op resolveFireParams + gewogen vermogen draait. Inconsistente kerngetallen tussen check-in en dashboard.',
    severity: 'risk',
    elementIds: ['as-coach', 'as-planning'],
  },
  {
    id: 'tz-month-boundaries',
    title: 'Tijdzone-onveilige maandgrenzen',
    detail:
      '~15 call-sites bouwen maandgrenzen met toISOString() i.p.v. localMonthBounds(); in NL schuift dat een dag terug en lekt vorige-maand-salaris in de totalen. Gebruik lib/month-range.ts.',
    severity: 'risk',
    elementIds: ['as-budget', 'as-import'],
  },
  {
    id: 'public-intake-write',
    title: 'Eerste publieke service-role-schrijfpad',
    detail:
      'De Vrijheidscheck-funnel laat een anonieme bezoeker (geen auth.uid()) server-side wegschrijven naar lead_intakes — het eerste publieke schrijfpad dat via de service-role RLS omzeilt. De vangrails (zod + payload-grens + IP-rate-limit + Turnstile, fail-closed) zijn ontworpen en security gaf een voorwaardelijke GO, maar de migratie/secrets zijn nog niet uitgerold. Tot de hardening getest én gedeployed is, blijft dit het scherpste structurele risico. Verwijder dit punt zodra deploy + GO rond zijn.',
    severity: 'risk',
    elementIds: ['as-vrijheidscheck', 't-supabase', 'do-lead'],
  },
  {
    id: 'migration-drift',
    title: 'Supabase migratie-drift',
    detail:
      'De lokale supabase/migrations-map loopt niet gelijk met remote. DDL via apply_migration; check kolommen/functies vóór je erop bouwt, anders bouw je op een schema dat remote niet bestaat.',
    severity: 'risk',
    elementIds: ['t-supabase', 'data-cont'],
  },
  {
    id: 'horizon-kernel-flag-periode',
    title: 'Twee Horizon-rekenmotoren tijdens de kernel-cutover (Excel-oracle-traject)',
    detail:
      'Besloten koers (ADR 0032): een nieuwe maandbasis-rekenkern (lib/horizon-kernel, nominaal, Excel-parity ≤ €0,01) vervangt de v2-grootboek-engine. Tijdens de flag-periode bestaan beide motoren naast elkaar met omgekeerde modelkeuzes (jaarbasis/reëel vs maandbasis/nominaal) — divergentie-risico als oppervlakken op verschillende momenten flippen. Invariant: de convergentie-set (/overzicht, /toekomst, dashboard-loader/freedomPct via fire-target-shared, AI-context) flipt als geheel. Plan: docs/horizon-excel-oracle-plan.md. Verwijder dit punt zodra de default-flip rond is en de v2-paden fysiek weg zijn (FASE 6).',
    severity: 'risk',
    elementIds: ['as-planning', 'fn-toekomstplannen', 'as-vermogen'],
  },
  {
    id: 'deplete-doel-lijn-grondslag',
    title: 'Doel-lijn (V_nodig) is liquide; getekende curve is netto vermogen',
    detail:
      'De horizontale doel-lijn op /toekomst is gebaseerd op het liquide vermogen (V_nodig via backwardVnodig), terwijl de getekende hoofdcurve het netto vermogen weergeeft (inclusief eigen woning). Voor accounts met een groot niet-liquide eigen huis (netto >> liquide) blijft een zichtbare afstand tussen de FIRE-stip en de doel-lijn bestaan: twee opties open (aparte liquide-curve tekenen, of een hellende V_nodig-lijn). Verwijder zodra dat besluit genomen en doorgevoerd is. NB: de reverse_mortgage-desync (display vs engine op leenruimte-grondslag) is beslist via ADR 0029 en is GEEN deel meer van dit aandachtspunt; de downsize-display-desync is een eigen concern — zie downsize-display-eligibility-desync.',
    severity: 'info',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
  },
  {
    id: 'downsize-display-eligibility-desync',
    title: 'Downsize: engine-eligibility (liquidValue incl. huis) ≠ dashboard-display (getFireEligibleNetWorth excl. overwaarde)',
    detail:
      'De v2-engine telt de downsize-woning als FIRE-eligible (spendable, ADR 0028) waardoor engine-FIRE doorgaans vroeger valt. De DISPLAY-helper getFireEligibleNetWorth is engine-agnostisch en trekt voor downsize de overwaarde nog af (mode-switch exclude_from_fire/downsize → −equity). Daardoor tellen dashboard-"belegbaar vermogen", freedomPct (via computeFreedomProgress), de AI shared-context, de freedom-card en het rapport de downsize-gebruiker ÓNDER t.o.v. wat de engine als eligible ziet. Bewust open gelaten als cross-surface grondslag-besluit (ADR 0028 §Gevolgen + addendum). Verwijder zodra getFireEligibleNetWorth de spendable-grondslag meekrijgt en de ADR de consistentie bevestigt.',
    severity: 'risk',
    elementIds: ['as-planning', 'fn-toekomstplannen', 'as-vermogen'],
  },
  {
    id: 'downsize-fire-gate-eligibility-vs-besteedbaar',
    title: 'Downsize-trigger leunt op een hold-FIRE-omweg omdat de FIRE-gate op liquideVermogen (incl. spendable huis) detecteert',
    detail:
      'De v2 FIRE-detectie (meetsStrategyTarget/liquideAtFire) draait op de eligibility-pot liquideVermogen — incl. de spendable saleManaged downsize-woning (ADR 0028) — terwijl die woning niet rauw besteedbaar is (besteedbaarVermogen, ADR 0030). Een zelf-berekende downsize-graaf-FIRE claimt daardoor bij een late verkoop een onmogelijk-vroege FIRE; een vaste-punt-iteratie op die FIRE divergeert (41→79→83→41). resolveDownsizeTriggerV2 omzeilt dit met een hold-FIRE-anker (FIRE van de run waarin de woning óók rauw besteedbaar is → besteedbaarVermogen == liquideVermogen → eerlijke, sale-timing-onafhankelijke gate) + één income-gated verfijning (ADR 0031). De omweg is correct en getest, maar de trigger-correctheid blijft gekoppeld aan dit gate-grondslag-artefact: een toekomstige wijziging aan de FIRE-detectie moet hiermee rekenen. Principiële richting: detecteer de downsize-FIRE op de rauw-besteedbare pot (of de overwaarde-bijdrage) i.p.v. de volle spendable-waarde — raakt ADR 0028, de matrix-goldens en de display-grondslag, dus eigen besluit. Onderscheiden van downsize-display-eligibility-desync (dat is display vs engine; dit is gate-grondslag vs trigger-stabiliteit binnen de engine). Verwijder zodra de downsize-FIRE-gate op de besteedbare grondslag rust en het hold-FIRE-anker overbodig is.',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
  },
]

/** Aandachtspunten die een specifiek element raken. */
export function getConcernsFor(elementId: string): ArchiConcern[] {
  return ARCHI_CONCERNS.filter((c) => c.elementIds.includes(elementId))
}

/** Telling per element, voor badges op de plaat. */
export function concernCountByElement(): Map<string, number> {
  const map = new Map<string, number>()
  for (const c of ARCHI_CONCERNS) {
    for (const id of c.elementIds) map.set(id, (map.get(id) ?? 0) + 1)
  }
  return map
}

/** Valideert dat elk aandachtspunt naar bestaande elementen verwijst. */
export function validateConcerns(model: ArchimateModel): string[] {
  const ids = new Set(model.nodes.map((n) => n.id))
  const errors: string[] = []
  const seen = new Set<string>()
  for (const c of ARCHI_CONCERNS) {
    if (seen.has(c.id)) errors.push(`dubbel concern-id: ${c.id}`)
    seen.add(c.id)
    if (c.elementIds.length === 0) errors.push(`concern ${c.id} heeft geen elementen`)
    for (const e of c.elementIds) if (!ids.has(e)) errors.push(`concern ${c.id} verwijst naar onbekend element ${e}`)
  }
  return errors
}
