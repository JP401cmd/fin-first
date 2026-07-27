# UAT-diepte-modus — volledige a/b/c/d/mobiel-dekking in /uat

**Datum:** 2026-07-27
**Status:** ontwerp goedgekeurd → klaar voor implementatieplan
**Module:** Beheer / Test & ontwikkeling (`/beheer/uat`, `.claude/commands/uat.md`)
**Anker:** het bestaande `/uat`-command en de UAT-procesplaat op `/beheer/uat` (`lib/uat/catalog.ts`, `lib/uat/status.ts`, `docs/uat/uat-plan.md`)

## Aanleiding

De 26 juli 2026 volledige 16-zone live-run testte alleen sub 'a' (happy path, webapp) per scenario: 421 van de 1427 sub×platform-instanties in de catalogus (30% dekking). Het go/no-go-blok op `/beheer/uat` eist ≥95% dekking + alle KERN uitgevoerd én geslaagd — met alleen happy-path-runs is die drempel structureel onbereikbaar. Dit ontwerp voegt een dieptemodus toe aan `/uat` om b (randgeval), c (foutpad) en d (persistentie) — en het mobiele platform waar van toepassing — gefaseerd te dekken, over meerdere sessies verspreid.

## Doel

Beide, in fasen:
1. Eerst de KERN-scenario's van gekozen zones optrekken naar volledige dekking (a+b+c+d+mobiel), gericht op de go/no-go-drempel.
2. Daarna, los en on-demand, opportunistisch verdiepen op zones met bekend risico (bv. BELAST, KRUIS na eerdere bugs).

Niet het doel: één moonshot-run die alles in één keer dekt — de sessiekosten (zie "Kosten-context" hieronder) maken dat onrealistisch.

## Kosten-context (waarom gefaseerd)

De happy-path-only run van 26 juli kostte al ~8,6 miljoen subagent-tokens over 16 zone-sub-agents (300-800k tokens, 20-60 min per zone voor gemiddeld ~25 instanties). Volledige a+b+c+d+mobiel is naar schatting 3-4x zwaarder per scenario. Vandaar: geen "test alles" maar een expliciete, door de gebruiker begrensde batch per sessie.

## Ontwerp

### 1. Architectuur: nieuwe stap in het bestaande /uat-command

Geen nieuw command — uitbreiding van `.claude/commands/uat.md`. De bestaande flow (zone-vraag → per-zone sub-agents) blijft ongewijzigd voor het huidige gedrag. Nieuw:

```
Stap 1: Welke zones? (ongewijzigd)
Stap 1b: NIEUW — Diepte?
  a) Happy-path (huidig gedrag — sub 'a', webapp)
  b) Volledige dekking (a+b+c+d + mobiel waar van toepassing)
Stap 1c: NIEUW, alleen bij (b) — prioriteitswachtrij berekenen, voorstel doen, batch laten kiezen
Stap 2: Per zone/scenario een sub-agent (zelfde serieel-gedeelde-browser-patroon), briefing uitgebreid (zie §4)
```

Bij diepte=happy-path: 0% gedragswijziging t.o.v. vandaag — dit is een zuiver additieve uitbreiding.

### 2. Prioriteitswachtrij-berekening (data flow)

Uitgevoerd in de hoofdthread via `evaluate_script` in de browsersessie (geen nieuwe API-route nodig):

1. Haal alle `uat_rounds` + per ronde de `uat_results` op; reduceer tot "laatst bekend per (scenario_id, sub, platform)" — hergebruikt de bestaande `buildResultLookup`/`deriveSubStatus`-logica uit `lib/uat/status.ts` (dezelfde reductie die de plaat zelf al doet), nu client-side buiten React om.
2. Grijs = nooit geregistreerd, voor elke sub×platform-combinatie in de catalogus van de gekozen zones.
3. Sorteer: KERN eerst, dan BELANGRIJK, dan OVERIG (matcht het go/no-go-criterium "alle KERN uitgevoerd én geslaagd").
4. Bundel per scenario: alle nog-grijze subs van hetzelfde scenario worden één wachtrij-item, zodat een scenario niet over meerdere sessies heen wordt heropend.

Géén los voortgangsbestand — de `uat_results`-tabel blijft de enige bron van waarheid (Deel 3 §3.4 van `docs/uat/uat-plan.md`: "niet wat je denkt getest te hebben, maar wat je kunt aantonen").

### 3. Batch-voorstel & keuze (interactie)

Toon een compacte tabel (grijze KERN-/BELANGRIJK-/OVERIG-instanties per zone), plus een voorgestelde behapbare hap voor déze sessie: **de KERN-gaten van precies één zone — de zone met de minste resterende grijze KERN-instanties (tie-breaker: eerste in catalogus-volgorde)**. Dat matcht de kosten-context hierboven (één zone per sessie, net als vandaag) en is identiek aan optie 3 hieronder, alleen automatisch gekozen i.p.v. handmatig aangewezen.

`AskUserQuestion` met:
1. Volg het voorstel (aanbevolen)
2. Alles in één keer (alle grijze KERN+BELANGRIJK van de gekozen zones)
3. Eén zone volledig afmaken — zone via "Other"
4. Other — vrije tekst (zone-namen, "alleen KERN", aantallen, scenario-ID's), geïnterpreteerd door de orchestrerende Claude tegen de berekende wachtrij, met een korte bevestigingsstap ("ik ga dan X draaien, klopt dat?") vóórdat de sub-agents starten. Geen mini-syntax om te leren — natuurlijke taal, want een LLM interpreteert het, geen strikte parser.

Lege wachtrij (alles al gedekt op de gekozen diepte) → direct melden, geen sub-agent-dispatch.

### 4. Zone-agent-briefing-wijzigingen

- **Expliciete instantie-lijst** i.p.v. "doorloop de hele zone": `[{scenarioId, subs: [...], platforms: [...]}, ...]` uit stap 1c.
- **Bron voor b/c/d-inhoud**: grep `docs/uat/uat-plan.md` op de exacte kop `#### UAT-<ID>` (bv. `#### UAT-SCHULD-07`) en lees alleen die sectie (niet het hele ~13.500-regels-document) voor de volledige a/b/c/d-given/when/then-prose. `lib/uat/acceptance/<zone>.ts` blijft de bron voor de exacte cijfer-assertie (doorgaans alleen sub 'a').
- **CANON-fallback**: CANON staat niet in het oorspronkelijke Deel-2-document (latere toevoeging, alleen in `catalog.ts`). Bestaat er geen `#### UAT-CANON-NN`-kop, gebruik dan `given`/`when`/`then` uit `lib/uat/acceptance/canon.ts` als enige bron voor alle subs van dat scenario, en meld dit als observatie voor `uat-docs-keeper` (niet blokkeren).
- **Falende sub blokkeert niet**: faalt sub 'b', ga gewoon door met 'c'/'d' van hetzelfde scenario — elke sub is een onafhankelijke test, geregistreerd als aparte `uat_results`-rij.
- **Rondelabel**: `'ZONE diepte-run — datum (chromedev)'` i.p.v. `'live-run'`, met de gedekte instanties in `notes`, zodat de rondegeschiedenis op `/beheer/uat` het runtype onderscheidt.
- Alle overige regels (niet-uitloggen, niet-destructief, bugs→Notion-formaat, tooling-tips uit eerdere zones) blijven ongewijzigd t.o.v. de bestaande briefing.

## Buiten scope

- Geen apart command naast `/uat`.
- Geen los voortgangs-/campagnebestand — de DB blijft de enige bron.
- Geen automatische re-test van al-groene instanties (alleen grijs wordt opgepakt; bewust hertesten van een gefixte bug blijft een aparte, handmatige `/uat`-happy-path-aanroep zoals vandaag).
- Geen wijziging aan het bestaande happy-path-gedrag.

## Open vragen / risico's

- De CANON-fallback (§4) is een aanname — nooit geverifieerd of `uat-plan.md` daadwerkelijk geen CANON-secties bevat. Bij implementatie eerst met een grep controleren, niet blind op deze aanname vertrouwen.

## Implementatie

Wijzigt alleen `.claude/commands/uat.md` — geen migraties, geen nieuwe API-routes, geen UI-wijziging. Vervolgstap: implementatieplan via de `writing-plans`-skill.
