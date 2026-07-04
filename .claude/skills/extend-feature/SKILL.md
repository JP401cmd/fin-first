---
name: extend-feature
effort: high
description: "Pijplijn voor het UITBOUWEN van een BESTAANDE functionaliteit in TriFinity — een delta op iets dat al werkt. Gebruik deze skill wanneer een bestaande functie uitgebreid of verdiept moet worden (niet nieuw, niet een bug; kleine bijschaving zonder nieuw gedrag van betekenis → /kleine-aanpassing; AI-functionaliteit → /ai-feature)."
---

# Uitbouw-pijplijn (bestaande functie)

Breidt een bestaande functionaliteit uit. Het grote verschil met `new-feature`: je begint vanuit **wat er al is**. De risico's zitten in regressie (bestaand gedrag breken), duplicatie (een tweede manier introduceren) en onbedoelde blast radius. De pijplijn is daarop ingericht.

Geef mee welke functie uitgebreid moet worden en de gewenste uitbreiding; is dat vaag, laat de `business-owner` de waarde van de uitbreiding scherpen.

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`: orchestrator-rol (hoofdchat delegeert; bij een gestrande subagent eerst diens deelstaat per toegewezen deeltaak inventariseren), voortgangsritme (vóór/na elke stap melden, nooit >5 min stilte), git-hygiëne in de gedeelde werkboom (nooit `git stash`/`checkout --`/`reset`) en de zelfverbeterings-slotstap (definitie-wijzigingen alleen ná expliciet akkoord, aparte `self-improve:`-commit). Deze regels gelden onverkort.

## Proces

### 1. Huidige werking in kaart — `deep-dive` (of `Explore`)
Laat `deep-dive` de bestaande functie doorgronden: betrokken bestanden, dataobjecten, bronnen-van-waarheid, gating, tests en de aannames waarop het rust. Uitkomst: een accuraat beeld van **wat er is** en waar de uitbreiding op aanhaakt. Zonder dit geen betrouwbare delta.

**De-escalatiepoort — blijkt de delta klein?** Toets de delta na de deep-dive aan dezelfde criteria als de "is dit wel klein?"-poort van `/kleine-aanpassing`: raakt ≤3 bestanden én geen nieuw dataobject, geen nieuwe route, geen migratie, geen rekenmotor-wijziging. Is dat allemaal waar, schakel dan expliciet over naar het **kleine-aanpassing-regime**: sla de requirements-/architect-stappen (2–5) over en ga direct naar bouw + verificatie mét de gates van die skill (juiste specialist, `tsc` + gericht testpad, UX-/security-gate waar geraakt). Benoem de de-escalatie in de afronding.

### 2. Waarde van de uitbreiding — `business-owner`
De `business-owner` weegt de uitbreiding tegen missie/pijlers en Wft-compliance, en werkt de backlog-feature bij. Bewaakt dat het de coherentie versterkt, niet fragmenteert.

### 3. Delta-requirements — `requirement-specialist`
De `requirement-specialist` legt de **delta** vast: wat verandert, wat blijft, en expliciet de **scope in/uit** om scope-creep te voorkomen. Acceptatiecriteria voor het nieuwe gedrag **én** een regressie-eis ("bestaand gedrag X blijft ongewijzigd"). Definition of Done.

### 4. Impact- & fit-review — `architect`
De `architect` beoordeelt de **blast radius**: raakt de uitbreiding een single-source-of-truth, een domeingrens, RLS, of een bestaand ADR? Bepaalt of een besluit gewijzigd/aangevuld moet worden en welke platen mee moeten. Bewaakt: hergebruik bestaande bron, **geen parallelle berekening**.

### 5. Plan met minimale blast radius — `senior-developer`
De `senior-developer` ontwerpt de kleinst mogelijke, veilige wijziging, identificeert de risicovolle naden en dispatcht de specialisten. Voorkeur voor uitbreiden/hergebruiken boven herschrijven.

### 6. Bouwen — specialisten (hergebruik-eerst)
Zelfde routering als bij een nieuwe functie, maar met de opdracht **hergebruik bestaande componenten/bronnen** en raak alleen wat nodig is:
- DB/RLS/migratie (append-only, nooit een gemigreerde migratie editen) → `supabase-db-specialist`
- Rekenmotor/afgeleide cijfers (+ catalogus) → `calc-engine-specialist`
- AI-plumbing → `ai-specialist-general` · Prompts/DNA → `ai-specialist-prompt-dna`
- UI → `frontend-ui-builder` · lijm/overig → `coder`

Raakt de uitbreiding een **rekenmotor of een financiële constante**: grep niet alleen op de canonieke functienaam, maar óók op de rúwe constante-literalen van de oude/bestaande formule (bv. `0.133`, `17_545`) — een tweede surface die de metric volledig herimplementeert met magic numbers verschijnt nooit in een grep op de geëxporteerde functie, en drijft anders verder uit elkaar.

### 7. Testen — bestaand beschermen + nieuw dekken — `tester`
De `tester` voegt tests toe voor het nieuwe gedrag **en** draait de bestaande suites om regressie uit te sluiten; voegt waar nodig een regressiecase toe die het oude gedrag vastpint. `tsc`/lint/tests groen, echte output. Bepaal of een fout pre-existing is door het pad/bestand te inspecteren (is het een bestand dat jij aanraakte?) — nooit door een "schone baseline" te meten met werkboom-muterende git-commando's (zie de gedeelde conventies).

### 8. Review — `code-review` (+ `ux-review-expert` bij UI, + `security-specialist` bij data/auth/routes)
Beoordeling op correctheid, neveneffecten op bestaand gedrag, en UI-consistentie. Raakt de uitbreiding data-toegang, auth, routes, AI-context of partner-/huishouddata (bij twijfel: ja), dan draait de `security-specialist` zijn ship-gate-checklist — let extra op een tweede datapad dat een privacy-bewuste loader omzeilt; een 🔴-bevinding blokkeert tot opgelost.

### 9. Platen synchroniseren — `architecture-docs-keeper` (indien structureel)
Veranderde de uitbreiding een domein/tabel/rekenmotor/capability? Dan werkt `architecture-docs-keeper` de relevante view(s) bij en regenereert facts; de `architect` bevestigt de fit. Puur additief binnen bestaande grenzen? Sla over.

## Afronding
Lever op: de bijgewerkte feature, de delta-spec met scope in/uit, bewijs dat bestaand gedrag heelblijft (regressietests groen), wat gewijzigd is en eventuele plaat/ADR-updates. Benoem restrisico en next steps — en of er ge-de-escaleerd is naar het kleine-aanpassing-regime. Sluit daarna af met de zelfverbeterings-slotstap uit de gedeelde conventies.
