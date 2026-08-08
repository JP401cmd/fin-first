---
name: release
effort: high
description: Ship-gate pijplijn voor TriFinity. Gebruik deze skill wanneer werk als "klaar" wordt beschouwd en gecommit, gepusht, gemerged of gedeployed gaat worden — "ship het", "maak het af", "kan dit live?" — zeker wanneer de wijziging een Supabase-migratie, nieuwe API-route, rekenmotor-wijziging of nieuw UI-oppervlak bevat. Ook te gebruiken als losse eindcheck op een branch die al "af" heet te zijn.
---

# Release-pijplijn (ship-gate)

Brengt afgerond werk gecontroleerd naar master/productie. Kern: "het werkt bij mij" is geen ship-criterium — elke stap levert **echte output** als bewijs, en de gevaarlijkste stappen (migratie-drift, security) zijn expliciete poorten in plaats van aannames. Niets hieruit overslaan omdat de wijziging "klein" is; sla alleen stappen over die aantoonbaar niet van toepassing zijn (geen migratie ⇒ stap 4 vervalt).

Geef mee wat er geshipt wordt; onduidelijke scope ⇒ eerst de diff inventariseren.

**Master = productie.** Er is geen CI en geen vangnet ná de push: `git push` naar master triggert direct een Vercel-productie-deploy (`vercel.json` in de root). "Even pushen om werk veilig te stellen" bestaat dus niet op master — dat is deployen. De poorten in deze pijplijn zijn de énige poorten. Werk je op een feature-branch, dan is de push onschuldig en gaat de poortenreeks vooraf aan de merge/PR; werk je (zoals gebruikelijk in deze repo) direct op master, dan gaat de volledige poortenreeks vooraf aan de push.

**Herdraai-regel (poorten verlopen).** Elke codewijziging ná een gehaalde poort — een fix uit review, security of build — maakt eerdere poorten stale. Na zo'n fix draaien minimaal opnieuw: `npx tsc --noEmit` + de tests van de geraakte paden; raakte de fix een route/RLS/AI-context, dan ook de security-blik daarop. "De build was net nog groen" telt niet als de tree sindsdien veranderde.

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`: orchestrator-rol (hoofdchat delegeert; bij een gestrande subagent eerst diens deelstaat per toegewezen deeltaak inventariseren), voortgangsritme (vóór/na elke stap melden, nooit >5 min stilte), git-hygiëne in de gedeelde werkboom (nooit `git stash`/`checkout --`/`reset`) en de zelfverbeterings-slotstap (definitie-wijzigingen alleen ná expliciet akkoord, aparte `self-improve:`-commit). Deze regels gelden onverkort.

## Proces

**Achtergrond-exitcodes liegen:** draai je een check als `cmd | tail; echo EXIT=$?` in de achtergrond, dan rapporteert de task-notificatie de exitcode van het hele *compound* commando (de laatste `echo` = altijd 0), níet die van het commando dat je toetst. Lees daarom bij elke poort de echte uitvoer en controleer de eigen exitcode (`PIPESTATUS[0]`), nooit alleen de wrapper-melding. Voorbeeld waar dit misging: `next build` faalde op een type-error terwijl de notificatie "exit code 0" meldde — alleen het lezen van de output ving het.

**Pipes beslissen nooit een poort:** een poort-commando dat direct een vervolgstap gate't (zeker de ship-push) draait KAAL, met zijn eigen exitcode als beslisser; filteren/grep-en doe je daarna op de bewaarde output. Les 19 jul 2026: `npm run test:run … | grep "Tests"` gaf exit 0 van de grep terwijl 1 test faalde — de push in dezelfde `&&`-keten ging door.

**Deploy-verificatie = `npx vercel ls`** (Status ● Ready / ● Error van de nieuwste Production-deploy), niet URL-/chunk-polling: die bleek blind voor server-only releases (client-chunks identiek) en gevoelig voor tekens-encoding in filters (les 19 jul 2026, 2×).

### 1. Scope & hygiëne
`git status` + `git diff master...HEAD --stat`: gaan alleen bedoelde bestanden mee? Geen debug-rommel, geen vergeten bestanden. Nieuwe env-variabelen ⇒ placeholder in `env.example` én de echte waarde in de productie-omgeving gezet vóór deploy.

### 2. Statische checks
`npx tsc --noEmit` schoon. Lint gericht op de gewijzigde bestanden (`npx eslint <geraakte paden>`): geen nieuwe errors t.o.v. master (baseline-errors blokkeren niet, vergelijk bij twijfel via stash). Geen repo-brede lint-run.

### 3. Tests — `tester`
Eerst gericht (de geraakte paden), dan volledig `npm run test:run`. Gedragswijziging in een rekenmotor of flow zonder test die het nieuwe gedrag vastlegt? Dan eerst die test (laten) toevoegen — anders niet klaar. Relevante in-app regressiesuites (`lib/regression-tests/suites/*`) meenemen.

### 4. Migratie naar remote — `supabase-db-specialist` (indien migratie)
**De lokale `supabase/migrations/`-map is níet de remote waarheid** (bekende drift). Daarom altijd:
1. `mcp__supabase__list_migrations` + `list_tables` — bestaat de tabel/kolom al, conflicteert er iets? Vergelijk daarbij op **schema-effect** (tabel/kolom/index/policy via `execute_sql` op `information_schema`/`pg_catalog`), niet op bestandsnaam/timestamp — door de drift staan migraties remote vaak onder een ándere versie-string, en een naam-diff markeert al-toegepaste migraties dan onterecht als "ontbrekend".
2. Toepassen via `mcp__supabase__apply_migration` (idempotent: `if not exists` / `create or replace`) — nooit blind een push-commando.
3. Verifiëren met `execute_sql` (kolommen/policies bestaan echt) en `mcp__supabase__get_advisors` (security) — vangt ontbrekende RLS direct.

Volgorde-regel: migratie **vóór** de code live gaat, anders 500's op de nieuwe route.

**Destructieve DDL is een aparte poort.** `DROP TABLE/COLUMN`, kolom hernoemen, `NOT NULL` op een bestaande kolom of een type-wijziging kan de nú draaiende productie-code breken (de oude code draait tot de nieuwe deploy klaar is) en is niet terug te draaien. Daarom: (a) expliciet akkoord van de gebruiker vóór toepassen, (b) expand-contract waar mogelijk — eerst additief uitbreiden en de code omzetten, pas in een latere release het oude pad opruimen, (c) vóór een DROP met `execute_sql` controleren dat niets in de code het oude pad nog leest.

### 5. Security-gate — `security-specialist`
Verplichte poort wanneer de diff data-toegang, auth, routes, AI-context, secrets of admin-paden raakt (bij twijfel: wél draaien). De `security-specialist` loopt zijn ship-gate-checklist: geen secrets/JWT's in de diff, geen dev/test/debug-route bereikbaar in productie, partner-privacy via de perspective-loaders, RLS/RPC-dekking, AI-sanitize/PII-mask, geen lekkende foutmeldingen. Een 🔴-bevinding blokkeert de release tot opgelost.

Diff-aanlevering: zijn onderdelen van de diff al apart en aantoonbaar security-geverifieerd (bv. DB-migraties met een multi-lens-verificatie in stap 4), filter die hunks dan uit de aangeleverde diff en vervang ze door één regel "DB-contract: al geverifieerd (verwijzing)". De agent leest dan alleen wat nog een oordeel nodig heeft — geen honderden regels pre-goedgekeurde DDL herlezen (les 19 jul 2026). Twee aanvullende eisen aan die aanlevering: (a) de contract-verwijzing vermeldt expliciet welke RLS-vorm de app-code veronderstelt (eigen-rijen-alleen vs. huishouden-gedeeld per tabel) — anders moet de agent dat zelf live uit pg_policies herleiden, en precies dáár zat de enige echte bevinding (les 19 jul 2026); (b) controleer dat álle bronbestanden als leesbare tekst-hunks in de gefilterde diff staan — een bestand dat als "Binary files … differ" verschijnt MOET expliciet als tekst worden bijgevoegd of benoemd, anders reviewt de specialist het blind (les 19 jul 2026).

### 6. Architectuurdocumentatie — `architecture-docs-keeper`
Per CLAUDE.md verplicht: rekenmotor geraakt ⇒ `lib/architecture/calculations.ts`; nieuw domein/service/datastroom ⇒ ArchiMate-curatie; zichtbare functionaliteit ⇒ HLD. Daarna `npm run arch:diagram` (ERD/feiten regenereren) en de architecture-vitests groen.

### 7. UAT-definitiesynchronisatie — `uat-docs-keeper` (indien gedrag/oppervlak wijzigt)
Draai `npm run uat:stale` met de scope uit stap 1: welke acceptatiecriteria wijzen (via `assertion.source`) naar gewijzigde bestanden, en welke nieuwe pagina's/routes hebben nog geen scenario. **Geen treffers én geen nieuw gebruikersoppervlak ⇒ één regel "geen UAT-impact", klaar** — de detector is de lichtheidsgarantie: hij draait altijd goedkoop, maar escaleert alleen bij echte impact. Anders dispatcht `uat-docs-keeper` de precieze lijst: werk `given/when/then` + `assertion` in `lib/uat/acceptance/<zone>.ts` bij, voeg voor een nieuw oppervlak een scenario toe aan `catalog.ts` + een `AcceptanceCriterion` + een node in `flows/<zone>.ts`, en houd de geraakte `*.engine.test.ts` + `test/uat-<zone>-suite-check.test.ts` groen. **Definities bijwerken en aanvullen, de live-run NIET uitvoeren — dat is `/uat`, wanneer de zone weer getest wordt.** Herdraai-regel: dit editte testbestanden ⇒ draai de geraakte `*.engine.test.ts` opnieuw.

### 8. Build & echte verificatie
`npm run build` — Next 16 production-build vangt wat tsc mist. Nieuwe/gewijzigde UI **daadwerkelijk bekijken** (dev-server of playwright/chrome-devtools): rendert het, juiste gating, vrijheidstijd-framing, design tokens, mobiel. Nieuwe API-route end-to-end aanroepen: 401 zonder sessie, validatie werkt, RLS houdt vreemde data tegen — én **minstens één INGELOGDE aanroep met het testaccount tegen een echte PostgREST** (lokale prod-build of preview): unit-mocks en het 401-pad bewijzen niets over de query-vorm die supabase-js/PostgREST werkelijk uitvoert (les 17 jul 2026: `update().or().select()` gaf productie-breed 42703 terwijl mocks én 401-smoke groen waren). Een component dat alleen tsc passeert is niet geverifieerd.

### 9. Review — gericht via domein-specialisten (licht houden)
Geen brede review-pass over alles: stappen 2–8 hebben statics, tests, security, UAT-sync en build al afgehandeld. Deze stap is uitsluitend een **diff-review op correctheid en single-source-of-truth** (lezen álle surfaces het nieuwe getal uit dezelfde bron?) — herhaal geen tsc/lint/tests en geen security (stap 5).
- **Routeer naar de specialist van het geraakte domein** in plaats van één generieke zware review: rekenmotor → `calc-engine-specialist`, DB/RLS → `supabase-db-specialist` (niet herhalen als stap 4 al draaide), AI-plumbing → `ai-specialist-general`, prompts → `ai-specialist-prompt-dna`, UI → `ux-review-expert`. Raakt de diff meerdere domeinen wezenlijk: maximaal twee parallelle specialist-reviews; anders volstaat één.
- **Scope strak**: geef de reviewer alleen de diff (`git diff master...HEAD`) en de direct geraakte bestanden mee — geen vrije veldtocht door de codebase. Vraag een compact rapport (alleen bevindingen, gesorteerd op ernst).
- Alleen bij een **architectuur-brede of risicovolle wijziging** (nieuwe datastroom, cross-domein refactor, rekenmotor-aanname) zet je de volledige `code-review`-agent of `senior-developer` op de complete diff — dat is de uitzondering, niet de standaard.

### 10. Ship
Expliciete `git add` van de bedoelde bestanden (geen `add -A`), commit met heldere message, hooks laten draaien (geen `--no-verify`). **Na de commit, vóór de push: hercontroleer `git status`.** Verschijnen bestanden opnieuw als gewijzigd (een editor/IDE die buffered edits laat flushen, of een lint-/format-hook die de tree herschreef), dan ving de commit een verouderde of half-geschreven versie — inspecteer die diff, valideer (tsc + de geraakte test) en amendeer vóór de push. Push nooit in de aanname dat de commit de bedoelde tree ving; een schone tree ná de commit is het bewijs. Feature-branch: push + PR naar master met wat het is, de migratie-status (al remote toegepast) en de bijgewerkte architectuur- én UAT-definities. Master: de push zelf is de deploy — extra reden dat álle poorten hiervóór gehaald zijn.

### 11. Deploy-verificatie & rollback-pad
Een groene lokale build is geen groene Vercel-build (andere env, NFT-excludes, regio, lambda-limieten — hier eerder misgegaan). Na de push:
1. **Deploy bevestigen**: controleer dat de Vercel-deploy slaagt (`npx vercel ls`/dashboard, of na enkele minuten de productie-URL met een verse response). Rapporteer pas "geshipt" als de deploy live staat — niet bij de push.
2. **Smoke op productie**: de nieuwe/geraakte flow één keer echt doorlopen en `mcp__supabase__get_logs` checken op nieuwe errors.
3. **Rollback-pad bij een kapotte deploy**: `git revert` van de commit(s) + push (geen force-push, geen reset op gedeelde history). Het schema blijft staan — migraties zijn forward-only; idempotente, additieve migraties (stap 4) zijn er precies zodat de oude code naast het nieuwe schema blijft werken. Meld de gebruiker wat er terugrolde en waarom.

### 12. Slotstap — wat merkt de gebruiker hiervan?
Schrijf in **drie regels mensentaal** op wat deze release voor een gebruiker betekent — geen commit-taal, geen bestandsnamen. Bewaar ze bij de release; ze zijn het ruwe materiaal voor de vrijgavenotities zodra het testerspanel opengaat.

- Wat kan iemand nu wat eerst niet kon, of wat werkt er nu wél goed?
- Is het alleen intern (refactor, migratie, tooling)? Dan: "geen zichtbare verandering" — ook dat is een geldig antwoord, en korter dan het verzinnen van een voordeel.
- **Doet de tekst een nieuwe belofte over veiligheid, opslag of rendement, dan is het een claim** → `compliance-check` vóórdat er iets naar buiten gaat.

Toon volgt `merkstem`, die de canonieke bron aanwijst — schrijf hier geen eigen toonlijst. Dit is géén tweede UAT-oordeel: stap 7 vraagt of een getest oppervlak geraakt is en schrijft naar `lib/uat/**`; deze stap vraagt wat een mens ervan merkt en schrijft alleen proza bij de release. De twee antwoorden mogen verschillen ("geen UAT-impact" naast een zichtbare verbetering, of andersom) — dat is geen tegenspraak. Niet publiceren op `/nieuws`: dat is de financiële-nieuwsfeed, geen productchangelog.

## Rationalisaties die de pijplijn niet passeren

| Gedachte | Werkelijkheid |
|---|---|
| "Het is maar één regel, direct pushen" | Eén regel op master = één regel op productie. Poorten gelden per aard van de wijziging, niet per omvang. |
| "De build/tests waren net nog groen" | Elke wijziging daarná maakt dat bewijs stale — herdraai-regel. |
| "Deze test raakt dit pad toch niet" | Dat is precies wat de poort moet bewíjzen, niet wat je aanneemt. |
| "Migratie is idempotent, gewoon toepassen" | Remote drift is hier de norm; eerst schema-effect vergelijken (stap 4.1). |
| "Security n.v.t., het is alleen UI" | UI lekt ook: masking, partner-privacy, client-side data. Bij twijfel draaien. |
| "Push maar vast, dan staat het veilig" | Push naar master ís de deploy. Veiligstellen doe je op een branch. |
| "De deploy zal wel goed gaan, lokaal bouwde het" | Vercel-build ≠ lokale build (env/NFT/regio) — stap 11 bestaat omdat dit hier eerder misging. |

## Afronding
Rapporteer per poort het bewijs (commando + uitkomst), de security-bevindingen en hun status, en wat er bewust is overgeslagen met reden. "Alles groen" zonder output is geen afronding. De zelfverbeterings-slotstap draait alleen onder de opt-in-condities uit de gedeelde conventies.
