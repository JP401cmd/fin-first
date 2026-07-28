---
name: incidentprotocol
description: Gebruik bij elk productie-incident of signaal daarvan — nieuwe fouten op /beheer/errors, een gefaalde cron (job_runs of de cron-alert-mail), een Vercel-alarm, een site die niet reageert, of een gebruikersmelding die naar een storing ruikt. Beantwoordt binnen tien minuten de drie vragen die de route bepalen: herstellen, repareren, of óók de meldplichtklok starten.
---

# Incidentprotocol — drie vragen binnen tien minuten

**Eerste regel — eerst de drie vragen, dan pas de oorzaak.** Binnen tien minuten na het signaal beantwoord je, in deze volgorde:

1. **Is er data weg?** → de herstelroute: terugzetten volgens `herstelproef`, niet gaan repareren in een kapotte staat.
2. **Is er data gezien die niet gezien mocht worden?** → start meteen `datalek-72u` (de meldplichtklok loopt vanaf dit moment van kennisname) — parallel aan de rest, niet erna.
3. **Is het gestopt?** → zo nee: **eerst indammen**, dan pas onderzoeken. Ladder: sessie/key intrekken → route of RLS dichtzetten → kill-switch → onderhoudsmodus (`/beheer/platform`).

De antwoorden bepalen de route; alles daarna is uitvoering.

## De routes

- **Data weg** → herstel via de `herstelproef`-werkwijze (daar staat hoe, waarheen en waaraan je ziet dat het klopte) → daarna release van de herstelde staat.
- **Te repareren** → `bug-fix`-pijplijn met spoed. **De leak-check geldt ook in de spoedroute** — haast is de meest voorkomende reden dat een fix meer blootlegt dan het probleem dat hij oplost.
- **Data gezien** → `datalek-72u` draait parallel; de reparatie wacht daar niet op.

## Na afloop — altijd

1. **Gebruikers informeren** als zij iets gemerkt hebben (toon: `draft-response` — eerlijk, concreet, geen jargon).
2. **Postmortem** in `docs/beheerders-runbook.md` (formaat: `process-doc`): wat gebeurde er, hoe ontdekt, hoe lang, wat is er structureel veranderd. **Een runbook dat na een incident niet groeit, veroudert** — dit is de stap die het verschil maakt tussen een incident en een les.
3. **Structurele fix** via de gewone pijplijn — de spoedfix is zelden de echte fix.

## Verwijzing

Stroom 12 in `trifinity-org/org_plan/30-werkstromen.md`. Verwant: `herstelproef`, `datalek-72u`, `bug-fix`.
