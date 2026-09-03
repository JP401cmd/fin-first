---
name: extend-feature
effort: high
description: "Pijplijn voor het UITBOUWEN van een BESTAANDE functionaliteit in TriFinity — een delta op iets dat al werkt. Gebruik deze skill wanneer een bestaande functie uitgebreid of verdiept moet worden (niet nieuw, niet een bug; kleine bijschaving zonder nieuw gedrag van betekenis → /kleine-aanpassing; AI-functionaliteit → /ai-feature)."
---

# Uitbouw-pijplijn (bestaande functie)

Breidt een bestaande functionaliteit uit. Het grote verschil met `new-feature`: je begint vanuit **wat er al is**. De risico's zitten in regressie (bestaand gedrag breken), duplicatie (een tweede manier introduceren) en onbedoelde blast radius. De pijplijn is daarop ingericht.

Geef mee welke functie uitgebreid moet worden en de gewenste uitbreiding; is dat vaag, laat de `business-owner` de waarde van de uitbreiding scherpen.

**Agent-budget: ≤5** voor een normale uitbreiding (verkenning, bouwspecialist(en), tester, gebundelde review). De volwaardige keten met `business-owner`/`requirement-specialist`/`architect` (stappen 2–4) draait alleen op de expliciete triggers hieronder; meer dan het budget alleen met motivering vooraf (zie de gedeelde conventies).

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`: orchestrator-rol (hoofdchat delegeert; bij een gestrande subagent eerst diens deelstaat per toegewezen deeltaak inventariseren), voortgangsritme (vóór/na elke stap melden, nooit >5 min stilte), git-hygiëne in de gedeelde werkboom (nooit `git stash`/`checkout --`/`reset`) en de zelfverbeterings-slotstap (definitie-wijzigingen alleen ná expliciet akkoord, aparte `self-improve:`-commit). Deze regels gelden onverkort.

## Proces

### 1. Huidige werking in kaart — hoofdthread of `Explore`; `deep-dive` alleen bij een onbekend/complex fundament
Breng de bestaande functie in kaart: betrokken bestanden, dataobjecten, bronnen-van-waarheid, gating, tests en de aannames waarop het rust. Ken je het geraakte gebied al (recent aan gewerkt, overzichtelijk domein), doe dit dan **zelf in de hoofdthread** met gerichte reads/greps; anders laat `Explore` het uitzoeken. Reserveer `deep-dive` voor een fundament dat écht complex of onbekend is (verweven rekenmotoren, externe integratie). Uitkomst: een accuraat beeld van **wat er is** en waar de uitbreiding op aanhaakt.

**De-escalatiepoort — de default-afslag.** Toets de delta aan dezelfde criteria als de "is dit wel klein?"-poort van `/kleine-aanpassing`: raakt ≤3 bestanden én geen nieuw dataobject, geen nieuwe route, geen migratie, geen rekenmotor-wijziging. Is dat allemaal waar — **en ook bij twijfel** — schakel dan expliciet over naar het **kleine-aanpassing-regime**: sla stappen 2–5 over en ga direct naar bouw + verificatie mét de gates van die skill; escaleer terug zodra je tijdens de bouw alsnog zo'n criterium daadwerkelijk raakt. Benoem de de-escalatie in de afronding.

### 2. Waarde van de uitbreiding — `business-owner` (alleen wanneer de waarde onduidelijk is)
Is de waarde of scope van de uitbreiding vaag of omstreden, dan weegt de `business-owner` haar tegen missie/pijlers en Wft-compliance en werkt de backlog-feature bij. Is de wens helder en de waarde evident (de gebruiker vraagt concreet gedrag op een bestaand oppervlak), sla deze stap over.

### 3. Delta-requirements — `requirement-specialist` (alleen bij nieuw dataobject/route/migratie/rekenmotor)
Op die triggers legt de `requirement-specialist` de **delta** vast: wat verandert, wat blijft, expliciete **scope in/uit**, acceptatiecriteria voor het nieuwe gedrag **én** een regressie-eis ("bestaand gedrag X blijft ongewijzigd"), Definition of Done. Daarbuiten legt de hoofdthread de delta zelf in enkele zinnen vast (scope in/uit + regressie-eis) als briefing voor de bouwstap.

### 4. Impact- & fit-review — `architect` (alleen bij dezelfde triggers)
De `architect` beoordeelt de **blast radius**: raakt de uitbreiding een single-source-of-truth, een domeingrens, RLS, of een bestaand ADR? Bepaalt of een besluit gewijzigd/aangevuld moet worden en welke platen mee moeten. Bewaakt: hergebruik bestaande bron, **geen parallelle berekening**. Zonder die triggers: overslaan.

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

### 8. Review — één gebundelde `code-review`-run (+ `security-specialist` alleen bij de harde triggers)
Eén `code-review`-agent beoordeelt correctheid, neveneffecten op bestaand gedrag én — in dezelfde opdracht — de UI-consistentie-lens (bij geraakte UI) en de security-lens; geen drie aparte review-spawns (zie de gedeelde conventies). Eén uitzondering blijft hard: raakt de uitbreiding auth, RLS, een migratie, een nieuwe route met datatoegang of partner-/huishouddata, dan draait de `security-specialist` zijn ship-gate-checklist als aparte run — let extra op een tweede datapad dat een privacy-bewuste loader omzeilt; een 🔴-bevinding blokkeert tot opgelost. De gebundelde review draait als **fork-subagent** (zie de gedeelde conventies).

### 9. Platen & UAT-definities synchroniseren — `architecture-docs-keeper` + `uat-docs-keeper` (indien structureel)
Veranderde de uitbreiding een domein/tabel/rekenmotor/capability? Dan werkt `architecture-docs-keeper` de relevante view(s) bij en regenereert facts; de `architect` bevestigt de fit. Raakt de uitbreiding zichtbaar gedrag of een oppervlak van een geteste zone? Dan werkt `uat-docs-keeper` de acceptatiecriteria in `lib/uat/acceptance/<zone>.ts` bij (en voegt een scenario toe waar een oppervlak nieuw is) — bijwerken, niet uitvoeren. Puur additief binnen bestaande grenzen, zonder UI/gedragswijziging? Sla over.

## Afronding
Lever op: de bijgewerkte feature, de delta-spec met scope in/uit, bewijs dat bestaand gedrag heelblijft (regressietests groen), wat gewijzigd is en eventuele plaat/ADR-updates. Benoem restrisico en next steps — en of er ge-de-escaleerd is naar het kleine-aanpassing-regime. De zelfverbeterings-slotstap draait alleen onder de opt-in-condities uit de gedeelde conventies.
