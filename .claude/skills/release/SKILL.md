---
name: release
description: Ship-gate pijplijn voor TriFinity. Gebruik deze skill wanneer werk als "klaar" wordt beschouwd en gecommit, gepusht, gemerged of gedeployed gaat worden — "ship het", "maak het af", "kan dit live?" — zeker wanneer de wijziging een Supabase-migratie, nieuwe API-route, rekenmotor-wijziging of nieuw UI-oppervlak bevat. Ook te gebruiken als losse eindcheck op een branch die al "af" heet te zijn.
---

# Release-pijplijn (ship-gate)

Brengt afgerond werk gecontroleerd naar master/productie. Kern: "het werkt bij mij" is geen ship-criterium — elke stap levert **echte output** als bewijs, en de gevaarlijkste stappen (migratie-drift, security) zijn expliciete poorten in plaats van aannames. Niets hieruit overslaan omdat de wijziging "klein" is; sla alleen stappen over die aantoonbaar niet van toepassing zijn (geen migratie ⇒ stap 4 vervalt).

Geef mee wat er geshipt wordt; onduidelijke scope ⇒ eerst de diff inventariseren.

## Rol van de hoofdchat — orchestrator

De hoofdchat voert deze pijplijn uit als **orchestrator**, niet als uitvoerder: hij zet subagents en skills in voor het inhoudelijke werk, bewaakt volgorde, samenhang en kwaliteit tussen de stappen, en beschermt zijn eigen contextvenster door te delegeren. Zelf doet hij alleen triviale lijm en snelle checks; onderzoek, bouw, test en review lopen via de gespecialiseerde agents — parallel waar stappen onafhankelijk zijn.

**Voortgangsrapportage (verplicht):** houd de gebruiker doorlopend op de hoogte van waar de pijplijn mee bezig is. Meld vóór elke stap in één à twee zinnen wat je gaat doen en welke agent(s) je inzet; meld na elke stap kort het resultaat (klaar / kernbevinding / blokkade) voordat je doorgaat. Duurt een stap naar verwachting langer dan ~5 minuten, draai de agent(s) dan met `run_in_background: true` en rapporteer tussentijds zodra een deelresultaat binnenkomt — laat nooit langer dan ~5 minuten stilte vallen. Stil doorwerken zonder updates is een fout, ook als het eindresultaat goed is.

## Proces

### 1. Scope & hygiëne
`git status` + `git diff master...HEAD --stat`: gaan alleen bedoelde bestanden mee? Geen debug-rommel, geen vergeten bestanden. Nieuwe env-variabelen ⇒ placeholder in `env.example` én de echte waarde in de productie-omgeving gezet vóór deploy.

### 2. Statische checks
`npx tsc --noEmit` schoon. Lint gericht op de gewijzigde bestanden (`npx eslint <geraakte paden>`): geen nieuwe errors t.o.v. master (baseline-errors blokkeren niet, vergelijk bij twijfel via stash). Geen repo-brede lint-run.

### 3. Tests — `tester`
Eerst gericht (de geraakte paden), dan volledig `npm run test:run`. Gedragswijziging in een rekenmotor of flow zonder test die het nieuwe gedrag vastlegt? Dan eerst die test (laten) toevoegen — anders niet klaar. Relevante in-app regressiesuites (`lib/regression-tests/suites/*`) meenemen.

### 4. Migratie naar remote — `supabase-db-specialist` (indien migratie)
**De lokale `supabase/migrations/`-map is níet de remote waarheid** (bekende drift). Daarom altijd:
1. `mcp__supabase__list_migrations` + `list_tables` — bestaat de tabel/kolom al, conflicteert er iets?
2. Toepassen via `mcp__supabase__apply_migration` (idempotent: `if not exists` / `create or replace`) — nooit blind een push-commando.
3. Verifiëren met `execute_sql` (kolommen/policies bestaan echt) en `mcp__supabase__get_advisors` (security) — vangt ontbrekende RLS direct.

Volgorde-regel: migratie **vóór** de code live gaat, anders 500's op de nieuwe route.

### 5. Security-gate — `security-specialist`
Verplichte poort wanneer de diff data-toegang, auth, routes, AI-context, secrets of admin-paden raakt (bij twijfel: wél draaien). De `security-specialist` loopt zijn ship-gate-checklist: geen secrets/JWT's in de diff, geen dev/test/debug-route bereikbaar in productie, partner-privacy via de perspective-loaders, RLS/RPC-dekking, AI-sanitize/PII-mask, geen lekkende foutmeldingen. Een 🔴-bevinding blokkeert de release tot opgelost.

### 6. Architectuurdocumentatie — `architecture-docs-keeper`
Per CLAUDE.md verplicht: rekenmotor geraakt ⇒ `lib/architecture/calculations.ts`; nieuw domein/service/datastroom ⇒ ArchiMate-curatie; zichtbare functionaliteit ⇒ HLD. Daarna `npm run arch:diagram` (ERD/feiten regenereren) en de architecture-vitests groen.

### 7. Build & echte verificatie
`npm run build` — Next 16 production-build vangt wat tsc mist. Nieuwe/gewijzigde UI **daadwerkelijk bekijken** (dev-server of playwright/chrome-devtools): rendert het, juiste gating, vrijheidstijd-framing, design tokens, mobiel. Nieuwe API-route end-to-end aanroepen: 401 zonder sessie, validatie werkt, RLS houdt vreemde data tegen. Een component dat alleen tsc passeert is niet geverifieerd.

### 8. Review — gericht via domein-specialisten (licht houden)
Geen brede review-pass over alles: stappen 2–7 hebben statics, tests, security en build al bewezen. Deze stap is uitsluitend een **diff-review op correctheid en single-source-of-truth** (lezen álle surfaces het nieuwe getal uit dezelfde bron?) — herhaal geen tsc/lint/tests en geen security (stap 5).
- **Routeer naar de specialist van het geraakte domein** in plaats van één generieke zware review: rekenmotor → `calc-engine-specialist`, DB/RLS → `supabase-db-specialist` (niet herhalen als stap 4 al draaide), AI-plumbing → `ai-specialist-general`, prompts → `ai-specialist-prompt-dna`, UI → `ux-review-expert`. Raakt de diff meerdere domeinen wezenlijk: maximaal twee parallelle specialist-reviews; anders volstaat één.
- **Scope strak**: geef de reviewer alleen de diff (`git diff master...HEAD`) en de direct geraakte bestanden mee — geen vrije veldtocht door de codebase. Vraag een compact rapport (alleen bevindingen, gesorteerd op ernst).
- Alleen bij een **architectuur-brede of risicovolle wijziging** (nieuwe datastroom, cross-domein refactor, rekenmotor-aanname) zet je de volledige `code-review`-agent of `senior-developer` op de complete diff — dat is de uitzondering, niet de standaard.

### 9. Ship
Expliciete `git add` van de bedoelde bestanden (geen `add -A`), commit met heldere message, hooks laten draaien (geen `--no-verify`). Push + PR naar master met: wat het is, de migratie-status (al remote toegepast), en de bijgewerkte architectuurdocs. **Post-deploy**: de nieuwe flow één keer op productie doorlopen en `mcp__supabase__get_logs` checken op errors.

## Afronding
Rapporteer per poort het bewijs (commando + uitkomst), de security-bevindingen en hun status, en wat er bewust is overgeslagen met reden. "Alles groen" zonder output is geen afronding.

## Slotstap — Zelfverbetering (altijd in overleg met de gebruiker)

Sluit elke run af met een korte retrospectief:

1. **Verzamel** de "Verbetervoorstel"-secties uit de eindrapporten van de ingezette subagents, plus je eigen observaties over deze pijplijn: overbodige of ontbrekende stap, verkeerde routering, onduidelijke instructie, een agent-definitie die tekortschoot. Kijk daarbij ook expliciet naar **token-efficiëntie**: had hetzelfde resultaat gekund met minder gelezen context, minder of kortere agent-runs of compactere rapporten — en welke instructie-aanpassing zou dat de volgende keer afdwingen?
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/skills/*/SKILL.md` of `.claude/agents/*.md` — bij voorkeur als keuzevraag (doorvoeren / aanpassen / afwijzen).
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan de eigen definities sleutelen.

Houd het schaars: één scherp voorstel per run is het maximum; geen voorstel is prima.
