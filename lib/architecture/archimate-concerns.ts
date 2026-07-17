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
    id: 'horizon-kernel-bekende-afwijkingen',
    title: 'Horizon-kernel: vier bekende, bewuste grenzen/afwijkingen t.o.v. het Excel-oracle',
    detail:
      'Vier structurele kanttekeningen bij de horizon-kernel (ADR 0032), geen bugs maar wel aandachtspunten. (1) B93 reached_now-quirk: bij een doelbedrag van €0 (bv. legacy-nalatenschap €0, of deplete zonder expliciet doel) geeft het solver-statusblok altijd status reached_now zodra Prognose!J(0) ≥ 0 — letterlijke Excel-parity, maar mogelijk verwarrend als UI-tekst ("je kunt nu al stoppen" bij een leeg doel). Nog geen apart gap-besluit genomen (docs/horizon-excel-oracle-plan.md §V12). (2) De scenario-band/Monte-Carlo-wrappers (lib/horizon-kernel/wrappers/band.ts, wrappers/mc.ts) leveren uitsluitend SCALAIRE uitkomsten per scenario (fireAge, netto-vermogen-bij-FIRE, netto-liquide-bij-eindleeftijd — de Sim!B/C/D-rij) — geen volledige per-jaar LedgerRow-achtige asset-/schuld-/onttrekkingsbreakdown per scenario. Een toekomstige UI die per-scenario samenstelling wil tonen (net als de hoofdgrafiek) vindt die breakdown niet; dat vereist een aparte volledige kernel-run per scenario. (3) Lege-surplus-doelpot-divergentie (gap-besluit V17, eigenaar 2026-07-03): staat de surplus-doelpot op €0, dan laat het Excel-oracle het maandspaar VERDAMPEN (Σgewicht=0 → inleg €0), terwijl de kernel via de bewuste degeneratie-fallback (toenameGewichten tak A) het spaargeld wél in de lege pot stort — bij het eigenaar-account het verschil tussen FIRE 59,58 (kernel) en 89,33 (Excel, zelfde invoer; end-to-end-verificatie scripts/horizon-oracle/*eigenaar-live*). De kernel-extensie is de gewenste semantiek; definitieve borging = Excel v6 fixen + fixtures herextraheren (eigenaar-actie); tot die tijd bewaken surplus-/withdrawal-evaporation-tests het kernel-gedrag en mag deze divergentie NIET "richting oracle" worden weggefixt zonder nieuw eigenaar-besluit. (4) Tekort-aflossing-uit-liquide (gap-besluit V19 / ADR 0033, eigenaar 2026-07-04, F6-bugfix): het Excel v5-oracle lost een tekort-lening alléén af uit de positieve maandkasstroom-surplus-tak — in de onttrekkingsfase 0 — waardoor een verkoop-transitie-lag-piek (eigenaar: €6.758 op leeftijd 75) 17 jaar met 5% rente compoundt terwijl er >€900k liquide náást staat. De kernel lost dit tekort voortaan (app-pad) maandelijks af uit de resterende liquide bezit-capaciteit (m−1-lag, onttrekking-waterval-volgorde, Σruw=0). Schakelbaar via KernelInput.tekortAflossingUitLiquide: app-pad AAN, parity-/fixture-pad UIT (input-from-fixture zet de vlag niet → 735 fixtures byte-groen). TRANSITIONEEL: borging = Excel v6 fixen + fixtures herextraheren; vangnet lib/horizon-kernel/tekort-aflossing-liquide.test.ts; niet "richting oracle" wegfixen zonder nieuw eigenaar-besluit.',
    severity: 'debt',
    elementIds: ['as-planning', 'fn-toekomstplannen'],
  },
  {
    id: 'vermogenshistorie-persoonlijk-only',
    title: 'Vermogenshistorie-laag is persoonlijk-only',
    detail:
      'De "Netto vermogen — verloop"-uitsplitsing draait op balance_snapshots, en die tabel heeft (anders dan assets/debts) nog geen household-model — dus de per-groep-historie toont alleen het persoonlijke perspectief, terwijl de rest van Kern het huishoud-perspectief kan tonen. loadWealthGroupHistory is perspectief-agnostisch gebouwd (ownership-parameter aanwezig, nog niet vertakt), maar tot balance_snapshots een huishoud-eigenaarschap kent divergeert deze laag stil van het gedeelde perspectief. Verwijder dit punt zodra de household-variant (ownership: "all") is uitgerold. Zie ADR 0046.',
    severity: 'debt',
    elementIds: ['as-vermogen', 'fn-vermogensregistratie'],
  },
  {
    id: 'signup-email-allowlist',
    title: 'Registratie-allowlist actief (besloten testfase)',
    detail:
      'Een Supabase auth-hook (signup_email_allowlist, ADR 0047) blokkeert registraties waarvan het e-mailadres niet op de allowlist staat — bedoeld om de app tijdens de besloten testfase gesloten te houden. Dit moet vóór publieke lancering weer uit, anders blijft de app onbereikbaar voor nieuwe gebruikers.',
    severity: 'debt',
    elementIds: ['t-supabase'],
  },
  {
    id: 'fragiele-webgpu-lokaal-ai',
    title: 'Fragiele WebGPU-runtime in het lokale AI-pad',
    detail:
      'Reproduceerbare unaligned accesses-crash op echte data (batch 20) in het Gemma-4-PLE-pad (Transformers.js/WebGPU), met sessievergiftiging tot een paginaherlaad. Gemitigeerd met batch 10 + per-batch-vangnet + automatisch sessieherstel + geen-cloud-fallback (fail-closed) + review-UI-only (ADR 0043). Verwijder dit punt zodra de runtime gehard of vervangen is (bv. LiteRT-LM-migratie of upstream-fix).',
    severity: 'debt',
    elementIds: ['t-lokale-ai', 'as-import'],
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
