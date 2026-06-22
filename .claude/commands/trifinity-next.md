---
description: Pak het bovenste item uit de Trifinity Notion-queue op (gated workflow)
argument-hint: "[titel of Notion-URL — optioneel]"
---

Je werkt de **Trifinity Notion-werkqueue** af. Bugs en features staan in de Notion-database 🧩 Trifinity; het veld **CC-actie** stuurt alles. Deze flow staat los van de `features`-MCP backlog.

## Notion
- Data source id: `d87e54c5-fb52-4607-a72a-52e4b58ee806`
- Queue-view (op te pakken werk): https://app.notion.com/p/8efef29471384f17be6c96a78bcfe520?v=384f9e8d568a8195baef000c587d88ae
- Wacht-op-akkoord-view: https://app.notion.com/p/8efef29471384f17be6c96a78bcfe520?v=384f9e8d568a81f59cce000cd65afeeb
- Gebruik de **notion** MCP (zie `.mcp.json`) om te lezen en pagina-properties bij te werken. Property-namen exact gebruiken, incl. hoofdletters/spaties.

## Harde regels
1. Pak **uitsluitend** items met CC-actie `1. Onderzoek gevraagd` of `3. Implementatie akkoord`. Leeg veld = backlog → **NIET** aanraken.
2. Ga **nooit** voorbij een oranje gate (`2. Akkoord op analyse?` / `4. Akkoord op oplevering?`). Die zijn voor de gebruiker.
3. Claim een item meteen met CC-actie `Bezig (Claude Code)` voordat je begint (voorkomt dubbel werk).
4. Eén item per run; het bovenste in de queue-view is de hoogste prioriteit. Pak geen volgend item tenzij ik expliciet "ga door" zeg.
5. Vastgelopen of onduidelijk? Stel je vraag **niet** in de terminal — gebruik het Notion-kanaal: zet CC-actie op `Vraag aan gebruiker`, schrijf de concrete vraag in **Analyse & voorstel**, en stop. (Zo ziet de gebruiker alle openstaande vragen via een filter op CC-actie = `Vraag aan gebruiker` of de Wacht-op-akkoord-view.)

## Stappen
1. Lees de queue-view. `$ARGUMENTS` leeg → neem het bovenste item; anders het item dat matcht met die titel/URL. Lege queue → meld en stop.
2. **Afbeeldingen in het kaartje?** Heeft het kaartje een afbeelding (bv. een screenshot in de body of een property), download dan de gesigneerde Notion-afbeeldings-URL naar een tijdelijk bestand (bv. `curl -sL "<signed-url>" -o /tmp/notion-img.png`) en lees dat bestand als beeld — zo zie je de pixels. Werkt zolang de gesigneerde URL nog geldig is op het moment van verwerken. Lukt het ophalen niet, val dan terug op een eventuele tekstuele beschrijving naast de afbeelding.
3. Lees **CC-actie**: `1. Onderzoek gevraagd` → ONDERZOEK · `3. Implementatie akkoord` → IMPLEMENTATIE · iets anders → meld en stop.
4. Zet **CC-actie** op `Bezig (Claude Code)`.
5. **ONDERZOEK** — wijzig geen productiecode:
   - Lees **AI voorstel prompt**, **Acceptatiecriteria** en bij bugs **Steps to reproduce / Expected result / Actual result / Environment**.
   - Bug: reproduceer (schrijf zo mogelijk een falende vitest of repro-script) en achterhaal de oorzaak. Feature: maak een korte aanpak/spec.
   - Schrijf naar **Analyse & voorstel**: oorzaak, voorgestelde oplossing, te raken bestanden/modules, risico's, testplan.
   - Zet **CC-actie** op `2. Akkoord op analyse?` en **STOP**.
6. **IMPLEMENTATIE** — volg **Analyse & voorstel** + **Acceptatiecriteria**:
   - **Lees eerst de gekozen richting/optie:** kijk in **Notities** (en onderaan **Analyse & voorstel**) of de gebruiker een specifieke optie/richting koos (bv. "Optie B"). Staat die er, volg 'm dan exact — vraag er **niet** opnieuw naar in de terminal. Staat er niets, volg dan de oplossing zoals in **Analyse & voorstel** beschreven.
   - Implementeer de afgesproken oplossing en verifieer: `npx tsc --noEmit` + relevante vitest groen, plus een security-/UX-gate waar van toepassing (raakt het data/auth/routes/AI-context, dan een security-check).
   - Noteer **PR / Branch**, zet **CC-actie** op `4. Akkoord op oplevering?` en **STOP**. Niet committen/pushen — release is een aparte stap.

## Token-efficiëntie (delegeer het zware werk)
Houd het hoofd-contextvenster licht: lees zelf alleen het kaartje (queue + de Notion-pagina) en **delegeer het zware werk aan een sub-agent** (Agent-tool) die in z'n eigen context de bestanden leest, onderzoekt/implementeert, **zelf de Notion-properties bijwerkt** (Analyse & voorstel / Notities / PR-Branch + de nieuwe CC-actie) en alleen een **compacte** samenvatting teruggeeft (≤ ~10 regels). Kies het agent-type naar de aard: ONDERZOEK → `deep-dive` (of `bug-reporter` bij een bug); IMPLEMENTATIE → `senior-developer` of de best passende specialist (`frontend-ui-builder`/`calc-engine-specialist`/`supabase-db-specialist`/`ai-specialist-*`/`coder`). Verifieer daarna kort dat de juiste gate gezet is; maak een onvolledig sub-agent-rapport in de hoofdthread af i.p.v. het als klaar te behandelen. Voor het hele queue-leeg-draaien met deze aanpak: `/trifinity-drain`.

## /clear is veilig tússen runs (niet midden in een run)
Deze workflow is stateless per run: elke run leest de queue vers uit Notion. `/clear` is dus **veilig tussen runs** — na `/clear` start je gewoon `/trifinity-next` (of `/trifinity-drain`) opnieuw en pak je op waar de queue staat. Doe `/clear` echter **niet midden in een run**: dat wist de lopende lus-/werkstate.

## Slotstap — Zelfverbetering (altijd in overleg met de gebruiker)
Sluit **dit kaartje** af — ná het zetten van de gate, maar vóór de STOP — met een kort retrospectief. Schrijf het in de hoofdchat en voer **NIETS** automatisch door:

1. **Verzamel** de "Verbetervoorstel"-secties uit de samenvatting van de ingezette sub-agent(s) plus je eigen observaties over deze workflow: een onduidelijke gate-instructie, verkeerde agent-routering (ONDERZOEK vs IMPLEMENTATIE), een ontbrekende stap, of een command-instructie die tekortschoot. Kijk daarbij expliciet naar **token-efficiëntie**: had hetzelfde gekund met minder gelezen context / kortere sub-agent-runs / compactere samenvattingen — en welke instructie-aanpassing zou dat afdwingen?
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/commands/trifinity-*.md` (of een agent-/skill-definitie). Doe dit als **tekst in de hoofdchat-samenvatting**, niet als kaartje-gate.
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan de command-/agent-/skill-definities sleutelen.

Houd het schaars: max één scherp voorstel per kaartje; geen voorstel is prima. De Slotstap blokkeert de queue nooit en commit nooit zelf.