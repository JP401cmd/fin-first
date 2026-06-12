---
name: extend-feature
description: Pijplijn voor het UITBOUWEN van een BESTAANDE functionaliteit in TriFinity — een delta op iets dat al werkt. Zet de juiste subagents in met nadruk op de huidige werking begrijpen, hergebruik, minimale blast radius en het beschermen van bestaand gedrag (regressie). Gebruik deze skill wanneer een bestaande functie uitgebreid, verdiept of aangepast moet worden (niet nieuw, niet een bug).
---

# Uitbouw-pijplijn (bestaande functie)

Breidt een bestaande functionaliteit uit. Het grote verschil met `new-feature`: je begint vanuit **wat er al is**. De risico's zitten in regressie (bestaand gedrag breken), duplicatie (een tweede manier introduceren) en onbedoelde blast radius. De pijplijn is daarop ingericht.

Geef mee welke functie uitgebreid moet worden en de gewenste uitbreiding; is dat vaag, laat de `business-owner` de waarde van de uitbreiding scherpen.

## Proces

### 1. Huidige werking in kaart — `deep-dive` (of `Explore`)
Laat `deep-dive` de bestaande functie doorgronden: betrokken bestanden, dataobjecten, bronnen-van-waarheid, gating, tests en de aannames waarop het rust. Uitkomst: een accuraat beeld van **wat er is** en waar de uitbreiding op aanhaakt. Zonder dit geen betrouwbare delta.

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

### 7. Testen — bestaand beschermen + nieuw dekken — `tester`
De `tester` voegt tests toe voor het nieuwe gedrag **en** draait de bestaande suites om regressie uit te sluiten; voegt waar nodig een regressiecase toe die het oude gedrag vastpint. `tsc`/lint/tests groen, echte output.

### 8. Review — `code-review` (+ `ux-review-expert` bij UI, + `security-specialist` bij data/auth/routes)
Beoordeling op correctheid, neveneffecten op bestaand gedrag, en UI-consistentie. Raakt de uitbreiding data-toegang, auth, routes, AI-context of partner-/huishouddata (bij twijfel: ja), dan draait de `security-specialist` zijn ship-gate-checklist — let extra op een tweede datapad dat een privacy-bewuste loader omzeilt; een 🔴-bevinding blokkeert tot opgelost.

### 9. Platen synchroniseren — `architecture-docs-keeper` (indien structureel)
Veranderde de uitbreiding een domein/tabel/rekenmotor/capability? Dan werkt `architecture-docs-keeper` de relevante view(s) bij en regenereert facts; de `architect` bevestigt de fit. Puur additief binnen bestaande grenzen? Sla over.

## Afronding
Lever op: de bijgewerkte feature, de delta-spec met scope in/uit, bewijs dat bestaand gedrag heelblijft (regressietests groen), wat gewijzigd is en eventuele plaat/ADR-updates. Benoem restrisico en next steps.

## Slotstap — Zelfverbetering (altijd in overleg met de gebruiker)

Sluit elke run af met een korte retrospectief:

1. **Verzamel** de "Verbetervoorstel"-secties uit de eindrapporten van de ingezette subagents, plus je eigen observaties over deze pijplijn: overbodige of ontbrekende stap, verkeerde routering, onduidelijke instructie, een agent-definitie die tekortschoot.
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/skills/*/SKILL.md` of `.claude/agents/*.md` — bij voorkeur als keuzevraag (doorvoeren / aanpassen / afwijzen).
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan de eigen definities sleutelen.

Houd het schaars: één scherp voorstel per run is het maximum; geen voorstel is prima.
