// ── Development-view: het Claude-team van TriFinity ──────────────────────────
// De /beheer/development-pagina laat zien hoe dit project gebouwd wordt: welke
// gespecialiseerde subagents er zijn en welke skill-pijplijnen ze in volgorde
// inzetten. Eén principe (net als de architectuurplaat): *feiten gescand,
// betekenis gecureerd, zelf-actualiserend*.
//
//   FEITEN   — scripts/architecture/generate.mjs → architecture.json.claudeTeam
//              (agents + skills + pijplijn-stappen, rechtstreeks van .claude/)
//   BETEKENIS — dit bestand: groepen, rollen, inzetmomenten en taglines in NL.
//
// Houd de curatie bij wanneer een agent of skill verschijnt, verdwijnt of van
// rol verandert — in dezelfde PR (laat de documentatie beter achter dan je 'm
// vond). De sync-test (development-model.test.ts) bewaakt dat elke agent/skill
// op schijf hier een plek krijgt, en dat geen curatie naar een verwijderd
// bestand verwijst.

// ── Gescande feiten (vorm = architecture.json.claudeTeam) ───────────────────-
export type ClaudeAgentFact = { id: string; name: string; description: string; model?: string; color?: string }
export type ClaudeSkillStep = { index: number; title: string; agents: string[] }
export type ClaudeSkillFact = { id: string; name: string; description: string; steps: ClaudeSkillStep[] }
export type ClaudeTeamFacts = { agents: ClaudeAgentFact[]; skills: ClaudeSkillFact[] }

// ── Gecureerd model (wat de UI rendert) ─────────────────────────────────────-
export type SkillKind = 'pijplijn' | 'tooling' | 'ongecategoriseerd'

export type DevelopmentSkill = ClaudeSkillFact & {
  kind: SkillKind
  /** Gecureerde NL één-zin: wanneer gebruik je deze skill. */
  tagline: string
  /** Stappen met per-agent of de referentie ook echt bestaat (drift zichtbaar). */
  steps: Array<ClaudeSkillStep & { agentRefs: Array<{ id: string; exists: boolean }> }>
}

export type DevelopmentAgent = ClaudeAgentFact & {
  groupId: string
  /** Gecureerde NL rol in één zin. */
  rol: string
  /** Gecureerd NL inzetmoment: wanneer wordt deze agent ingezet. */
  inzet: string
}

export type TeamGroup = { id: string; label: string; description: string }

export type DevelopmentModel = {
  groups: Array<TeamGroup & { agents: DevelopmentAgent[] }>
  /** Agents op schijf zonder curatie — hoort leeg te zijn (test bewaakt dit). */
  ungrouped: DevelopmentAgent[]
  /** Skills: pijplijnen eerst, dan tooling, dan ongecategoriseerd. */
  skills: DevelopmentSkill[]
  counts: { agents: number; skills: number; pijplijnen: number }
}

// ── Curatie: skills ─────────────────────────────────────────────────────────-
// Pijplijnen zetten het team in volgorde in; tooling-skills zijn losse
// gereedschappen. Onbekende skill op schijf → 'ongecategoriseerd' (test rood).
type SkillCuration = { kind: SkillKind; tagline: string }
export const SKILL_CURATION: Record<string, SkillCuration> = {
  // pijplijnen
  'new-feature': {
    kind: 'pijplijn',
    tagline: 'Bouw iets nieuws dat nog niet bestaat — van waarde & scope tot bouw, test en bijgewerkte platen.',
  },
  'extend-feature': {
    kind: 'pijplijn',
    tagline: 'Bouw een bestaande functie uit — minimale blast radius, bestaand gedrag beschermd tegen regressie.',
  },
  'bug-fix': {
    kind: 'pijplijn',
    tagline: 'Los een defect gestructureerd op — van reproduceerbaar bugrapport tot geverifieerde fix.',
  },
  'kleine-aanpassing': {
    kind: 'pijplijn',
    tagline: 'Voer een kleine wens snel en licht door — bijschaven van iets dat al werkt, mét vangrails en escalatiepad.',
  },
  refactor: {
    kind: 'pijplijn',
    tagline: 'Verbouw de structuur zonder gedragswijziging — elke stap een aantoonbare pure move.',
  },
  release: {
    kind: 'pijplijn',
    tagline: 'De ship-gate: breng afgerond werk gecontroleerd naar productie, met echte verificatie als bewijs.',
  },
  'ai-feature': {
    kind: 'pijplijn',
    tagline: 'Bouw of wijzig AI-functionaliteit — met de guardrails (sanitize, PII-mask, kill-switch, tier-gate) als harde eis.',
  },
  'ai-gedrag': {
    kind: 'pijplijn',
    tagline: 'Stuur het gedrag van de AI bij — een evaluatie-loop van voorbeelden naar chirurgische prompt-aanpassing.',
  },
  // tooling
  'lokale-prompt-parity': {
    kind: 'tooling',
    tagline: 'Houdt de gecondenseerde lokale Fin-DNA in sync met de cloud-bron-DNA — drift-detectie via manifest, hercondenseren binnen budget, eigenaar-gate vóór ship.',
  },
  'frontend-design': {
    kind: 'tooling',
    tagline: 'Gereedschap voor onderscheidende, productiewaardige frontend — vermijdt generieke AI-look.',
  },
  'playwright-cli': {
    kind: 'tooling',
    tagline: 'Gereedschap voor browser-automatisering — navigeren, formulieren, screenshots, web-tests.',
  },
  'ui-ux': {
    kind: 'tooling',
    tagline: 'De canonieke TriFinity-design-taal: kwaliteitstoets, patroon-catalogus en page-type-blueprints voor elke UI-bouw en -review.',
  },
  'datalek-72u': {
    kind: 'tooling',
    tagline: 'De 72-uursroute bij een (vermoed) datalek: kennisname vastleggen, drie vragen, indammen, AP-melding met voorbereide tekst — en het meldregister, ook voor lekken die je niet meldt.',
  },
  'avg-verzoek': {
    kind: 'tooling',
    tagline: 'De 30-dagenroute voor inzage-, export-, verwijder- en correctieverzoeken: klok vanaf ontvangst, identiteit via het geregistreerde adres, afhandeling via de bestaande export-/verwijder-API, altijd een aantekening.',
  },
  incidentprotocol: {
    kind: 'tooling',
    tagline: 'De tien-minuten-triage bij een productie-incident: data weg → herstel, te repareren → bug-fix mét leak-check, data gezien → parallel datalek-72u; daarna informeren en een postmortem in het runbook.',
  },
  herstelproef: {
    kind: 'tooling',
    tagline: 'Kwartaaloefening die bewijst dat een back-up echt terug te zetten is: naar een aparte omgeving, met controlepunten tot op bedrag-niveau en een geklokte hersteltijd — een ongeteste back-up is geen back-up.',
  },
  verwerkersregister: {
    kind: 'tooling',
    tagline: 'Wie verwerkt wat en op welke grond: nieuwe dienst éérst in het register, kwartaalcontrole naast de BTW-administratie, per verwerker gegevens, doel, grondslag en overeenkomst.',
  },
  'compliance-check': {
    kind: 'tooling',
    tagline: 'De Wft/AVG-poort vóór elke publieke uiting, AI-wijziging en SEO-pagina: inzicht mag, vergunningsplichtig advies niet — plus de claimlijst, en altijd een beslisbare uitkomst (goedkeuren · aanpassen · afwijzen).',
  },
  'woonstrategie-check': {
    kind: 'tooling',
    tagline: 'Live-verificatie van de vier eigen-woningstrategieën in de Toekomst-grafiek: gekalibreerd seed-account (FIRE ≈ 60, interen), per strategie Pad + Opbouw via chromedev, invarianten-toets bovenop de matrix-goldens, rapport met oordeel.',
  },
}

// ── Curatie: groepen + agents ───────────────────────────────────────────────-
export const TEAM_GROUPS: TeamGroup[] = [
  { id: 'product', label: 'Product & Requirements', description: 'Bepaalt wat we bouwen en waarom, en legt de verwachtingen scherp vast.' },
  { id: 'architectuur', label: 'Architectuur', description: 'Bewaakt de structurele blauwdruk en houdt de architectuurplaten waarheidsgetrouw.' },
  { id: 'bouw', label: 'Bouw', description: 'Zet het ontwerp om in code — van migraties en rekenmotoren tot schermen.' },
  { id: 'ai', label: 'AI', description: 'De AI-plumbing en de prompt-DNA: hoe de app met het model praat en hoe het model antwoordt.' },
  { id: 'kwaliteit', label: 'Kwaliteit & Security', description: 'Toetst correctheid, gebruikerservaring en veiligheid voordat iets als klaar geldt.' },
  { id: 'onderzoek', label: 'Onderzoek', description: 'Diepe analyse en verkenning wanneer grondigheid belangrijker is dan snelheid.' },
  { id: 'specialisten', label: 'Externe specialisten', description: 'Diepe domeinkennis voor specifieke integraties.' },
]

type AgentCuration = { groupId: string; rol: string; inzet: string }
export const AGENT_CURATION: Record<string, AgentCuration> = {
  // ── product ──
  'business-owner': {
    groupId: 'product',
    rol: 'Product owner — houdt de missie ("Geld is opgeslagen tijd"), de backlog en de Wft-compliance.',
    inzet: 'Aan de start van een idee: is dit waardevol, past het, en hoe knip je het in features.',
  },
  'requirement-specialist': {
    groupId: 'product',
    rol: 'Vertaalt een greenlit idee naar scherpe requirements en acceptatiecriteria (Given/When/Then).',
    inzet: 'Nadat een idee groen is en vóór de bouw, of wanneer de verwachtingen vaag zijn.',
  },
  // ── architectuur ──
  architect: {
    groupId: 'architectuur',
    rol: 'Enterprise- & solution-architect — eigenaar van de blauwdruk, de ADR’s en de fit-review.',
    inzet: 'Aan de start (solution design) én als reviewer: respecteert dit de architectuur en de single-source-of-truth?',
  },
  'architecture-docs-keeper': {
    groupId: 'architectuur',
    rol: 'Houdt de vier views van /beheer/architectuur in sync met de code (scanners + curatie).',
    inzet: 'Wanneer een domein, tabel, rekenmotor of capability verschijnt, verdwijnt of van naam verandert.',
  },
  // ── bouw ──
  'senior-developer': {
    groupId: 'bouw',
    rol: 'Senior/principal engineer — technische richting, harde cross-cutting beslissingen en de risicovolle naden.',
    inzet: 'Bij architectonisch significante of subsysteem-overschrijdende wijzigingen; coördineert de specialisten.',
  },
  coder: {
    groupId: 'bouw',
    rol: 'Implementeert productiewaardige code en de lijm tussen onderdelen.',
    inzet: 'Voor algemene implementatie en refactors die geen specialist vereisen.',
  },
  'frontend-ui-builder': {
    groupId: 'bouw',
    rol: 'Bouwt schermen en componenten in TriFinity-stijl, met vrijheidstijd-framing en gating.',
    inzet: 'Wanneer een nieuw scherm, widget, modal of restyling nodig is.',
  },
  'supabase-db-specialist': {
    groupId: 'bouw',
    rol: 'Supabase/PostgreSQL — migraties, indexen, RPC’s en vooral RLS en eigenaarschap.',
    inzet: 'Bij elke schemawijziging, nieuwe tabel, RLS-policy of service-role schrijfpad.',
  },
  'calc-engine-specialist': {
    groupId: 'bouw',
    rol: 'De rekenmotoren — spaarquote, netto vermogen, belastingdruk, FIRE en vrijheidstijd, single-sourced.',
    inzet: 'Wanneer een berekening, constante of aanname verandert, of een getal geverifieerd moet worden.',
  },
  // ── ai ──
  'ai-specialist-general': {
    groupId: 'ai',
    rol: 'De AI-plumbing — Vercel AI SDK, providers, tools, schemas, context-builders en de guardrails.',
    inzet: 'Voor nieuwe AI-routes, tools, structured outputs of provider/config-wijzigingen.',
  },
  'ai-specialist-prompt-dna': {
    groupId: 'ai',
    rol: 'De prompt-DNA — hoe Fin praat, redeneert en categoriseert (over de domeinen overzicht/tips/toekomst).',
    inzet: 'Voor toon/lengte-bijsturing, categorisatie-fouten of het verfijnen van een prompt.',
  },
  // ── kwaliteit & security ──
  tester: {
    groupId: 'kwaliteit',
    rol: 'Schrijft, draait en debugt tests (Vitest + de in-app regressie-suites) en verifieert dat werk echt werkt.',
    inzet: 'Na elke niet-triviale wijziging, bij ontbrekende dekking of een falende suite.',
  },
  'code-review': {
    groupId: 'kwaliteit',
    rol: 'Grondige code-review op correctheid, kwaliteit, technische schuld en security.',
    inzet: 'Nadat een stuk code is geschreven en vóór het mergen.',
  },
  'ux-review-expert': {
    groupId: 'kwaliteit',
    rol: 'Reviewt UI/UX op consistentie met het designsysteem, interactie en toegankelijkheid.',
    inzet: 'Na elke betekenisvolle UI-wijziging.',
  },
  'security-specialist': {
    groupId: 'kwaliteit',
    rol: 'Applicatie-security en privacy over alle lagen — routes, service-role, AI-data-exposure, partner-privacy.',
    inzet: 'Als ship-gate bij wijzigingen die data-toegang, auth, externe calls of admin-paden raken.',
  },
  'bug-reporter': {
    groupId: 'kwaliteit',
    rol: 'Maakt van een vage klacht een compleet, reproduceerbaar bugrapport — fixt niet, documenteert.',
    inzet: 'Wanneer een bug gemeld of waargenomen is en je een scherpe write-up wilt vóór de fix.',
  },
  'uat-docs-keeper': {
    groupId: 'kwaliteit',
    rol: 'Houdt de UAT-definities (acceptatiecriteria, scenario’s en flows in lib/uat) in sync met de code — werkt bij en voegt toe, voert niet uit.',
    inzet: 'Bij release (UAT-sync-poort) of tijdens het bouwen wanneer een wijziging geteste zones raakt; de live-run blijft /uat.',
  },
  // ── onderzoek ──
  'deep-dive': {
    groupId: 'onderzoek',
    rol: 'Diepe analyse en verkenning van code, architectuur of oplossingen — grondigheid boven snelheid.',
    inzet: 'Bij plan-reviews, onbekende codebases, lastige bugs of kritieke beslissingen.',
  },
  // ── externe specialisten ──
  'polar-payments-expert': {
    groupId: 'specialisten',
    rol: 'Polar-betalingen — webhooks, checkout, abonnementen, met documentatie-first en zero-tolerance op security.',
    inzet: 'Bij het bouwen, reviewen of debuggen van de Polar-betaalintegratie.',
  },
}

// ── builder ──────────────────────────────────────────────────────────────────
const SKILL_KIND_ORDER: Record<SkillKind, number> = { pijplijn: 0, tooling: 1, ongecategoriseerd: 2 }

function curateSkill(fact: ClaudeSkillFact, agentIds: Set<string>): DevelopmentSkill {
  const cur = SKILL_CURATION[fact.id]
  const kind: SkillKind = cur?.kind ?? 'ongecategoriseerd'
  const tagline = cur?.tagline ?? (fact.description || fact.name)
  const steps = (fact.steps ?? []).map((s) => ({
    ...s,
    agents: s.agents ?? [],
    agentRefs: (s.agents ?? []).map((id) => ({ id, exists: agentIds.has(id) })),
  }))
  return { ...fact, kind, tagline, steps }
}

function curateAgent(fact: ClaudeAgentFact): DevelopmentAgent {
  const cur = AGENT_CURATION[fact.id]
  return {
    ...fact,
    groupId: cur?.groupId ?? '',
    rol: cur?.rol ?? fact.description ?? '',
    inzet: cur?.inzet ?? fact.description ?? '',
  }
}

/**
 * Bouwt het gecureerde development-model uit de gescande feiten. Puur en
 * defensief: ontbrekende/lege feiten leveren een leeg-maar-geldig model.
 */
export function buildDevelopmentModel(facts: ClaudeTeamFacts | undefined | null): DevelopmentModel {
  const agentFacts = Array.isArray(facts?.agents) ? facts!.agents : []
  const skillFacts = Array.isArray(facts?.skills) ? facts!.skills : []
  const agentIds = new Set(agentFacts.map((a) => a.id))

  const curatedAgents = agentFacts.map(curateAgent)

  const groups = TEAM_GROUPS.map((g) => ({
    ...g,
    agents: curatedAgents
      .filter((a) => a.groupId === g.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))
  const ungrouped = curatedAgents
    .filter((a) => !TEAM_GROUPS.some((g) => g.id === a.groupId))
    .sort((a, b) => a.name.localeCompare(b.name))

  const skills = skillFacts
    .map((s) => curateSkill(s, agentIds))
    .sort((a, b) => SKILL_KIND_ORDER[a.kind] - SKILL_KIND_ORDER[b.kind] || a.name.localeCompare(b.name))

  return {
    groups,
    ungrouped,
    skills,
    counts: {
      agents: curatedAgents.length,
      skills: skills.length,
      pijplijnen: skills.filter((s) => s.kind === 'pijplijn').length,
    },
  }
}
