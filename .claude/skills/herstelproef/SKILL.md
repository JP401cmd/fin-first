---
name: herstelproef
description: Gebruik elk kwartaal (vaste rij in het ritme), na elke wijziging aan de back-upinrichting, en in elk geval vóór de allowlist opengaat. Zet een echte back-up terug naar een aparte omgeving en bewijst dat hij klopt; legt hersteltijd en uitkomst vast in het beheerders-runbook. Ook de bron voor de herstelroute tijdens een incident.
---

# Herstelproef — bewijzen dat terug kunnen geen aanname is

**Eerste regel — een ongeteste back-up is geen back-up.** Bij vermogensdata is "Supabase maakt toch backups" een hoop, geen zekerheid. En: **oefenen doe je nooit op productie** — altijd naar een aparte omgeving.

## Vooraf één keer vastleggen (in het runbook)

Twee waarden, in gewone taal:

- **Hoeveel data mag je kwijt zijn?** (RPO) — bepaalt de back-upfrequentie die je nodig hebt.
- **Hoe lang mag herstel duren?** (RTO) — de maat waarlangs je elke proef legt.

## De proef

1. **Pak de meest recente back-up** (Supabase) — de echte, niet een handmatige kopie van vandaag.
2. **Zet terug naar een aparte omgeving** — een tweede Supabase-project of branch, nooit productie.
3. **Controleer aan de hand van een vaste checklist:**
   - rij-aantallen van de kerntabellen kloppen met productie (op de back-updatum);
   - inloggen met een testaccount werkt tegen de herstelde omgeving;
   - **steekproef op bedragen** — een paar bekende saldi en uitkomsten van de rekenkern: bij een vermogensapp is "de data is er" niet genoeg, de bedragen moeten kloppen.
4. **Klok de hersteltijd** — van "besluit tot terugzetten" tot "checklist groen". Dát getal is de echte uitkomst van de proef; leg het naast je RTO.

## Vastleggen — altijd, ook bij succes

In `docs/beheerders-runbook.md`: datum, back-updatum, hersteltijd, uitkomst per controlepunt, en wat er schuurde (elke proef vindt iets — een vergeten omgevingsvariabele, een handmatige stap die nergens stond). **Faalt de proef, dan is dat een incident** (`incidentprotocol`), geen administratieve voetnoot: je hebt zojuist ontdekt dat je vangnet niet bestaat.

## Verwijzing

Stroom 12 en de kwartaalrij van stroom 07 in `trifinity-org/org_plan/30-werkstromen.md`. Verwant: `incidentprotocol`, `process-doc`.
