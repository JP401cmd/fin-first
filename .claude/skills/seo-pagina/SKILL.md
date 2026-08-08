---
name: seo-pagina
description: Gebruik bij het maken of herzien van een publieke pagina die één zoekvraag volledig beantwoordt — een vindbaarheidspagina, geen blogpost. Regelt de volgorde (eerst de vraag, dan de tekst, dan de poort, dan de bouw), de drie harde grenzen, en de bestanden die je aanraakt zodat de pagina daadwerkelijk vindbaar is.
---

# SEO-pagina — één vraag, volledig beantwoord, met een uitgang

**Eerste regel — een pagina zonder route naar `/check` is een doodlopende weg.** De Vrijheidscheck is de uitgang van elke publieke pagina; zonder die route heb je verkeer zonder bestemming.

**Tweede regel — deze skill dupliceert geen claims en geen toon.** Die staan elders canoniek (zie de tabel onderaan). Schrijf ze hier nooit over: een tweede exemplaar driftet, en publieke tekst is precies de plek waar dat duur wordt.

## Wat het wel en niet is

Geen blog. Eén pagina beantwoordt **één** vraag die mensen werkelijk stellen — volledig, zodat de bezoeker niet verder hoeft te zoeken — en eindigt bij de Vrijheidscheck. Vijf halve antwoorden zijn minder waard dan één heel antwoord.

## De drie harde grenzen

1. **Route naar `/check`.** Elke pagina, zonder uitzondering. Bron: `org_plan/20-skills.md` §seo-pagina; het funnel- en conversiemechanisme staat in **ADR 0022** (*Vrijheidscheck — publieke pre-account intake en conversie*). *Let op: de blueprint citeert hier ADR 0065, maar dat gaat over repo-topologie (landingspagina blijft in fin-first) — niet over de eindroute.*
2. **Langs `compliance-check`, vóór publicatie.** Publieke tekst is de Wft/AVG-poort. Dat is een poort, geen formaliteit — de claimlijst en de grens (inzicht mag, vergunningsplichtig advies niet) staan daar, niet hier.
3. **Geen "we nemen contact op"-beloften** zolang **ADR 0068** geldt: leads worden bewust niet opgevolgd tot F1. Een belofte die we niet nakomen is erger dan geen belofte.

## De volgorde

1. **Kies de vraag** — `zoekvraag-onderzoek`: wordt hij gesteld, wordt hij nu slecht beantwoord, en mág ik hem beantwoorden binnen de Wft-grens. Een vraag met oordeel `inzicht` en zonder bestaande pagina in `docs/zoekvragen.md` is precies de invoer voor deze skill.
2. **Schrijf het antwoord** — via `content-creation`; toon en framing volgen `merkstem` (dat wijst door naar `lib/ai/dna/base.ts`). Bedragen van betekenis ook in vrijheidstijd.
3. **Poort** — `compliance-check`. Uitkomst: goedkeuren, aanpassen of afwijzen. Pas daarna bouwen.
4. **Bouw** — ontwerp via `frontend-design` (de ontwerpbron voor niet-app-oppervlakken; in-app UI valt onder `ui-ux`).
5. **Registreer** — zie hieronder. Sla je dit over, dan bestaat de pagina wel maar vindt niemand hem. Werk daarna de regel in `docs/zoekvragen.md` bij met de nieuwe pagina.

## Wat je aanraakt

Publieke routes staan **top-level onder `app/`** (naast `functies`, `prijzen`, `veiligheid`, `over`, `contact`, `check`) — niet in een routegroep.

- `app/<route>/page.tsx` — de pagina, met een `metadata`-export (title + description).
- **`app/sitemap.ts` — VERPLICHT bijschrijven.** Statische, hardgecodeerde lijst van op dit moment **negen** routes. Staat je route er niet in, dan is de pagina onvindbaar — en er faalt niets, het is een stille misser. Priority-conventie staat in dat bestand zelf: `1.0` voor de homepage, `0.8` voor conversiepagina's (`/functies`, `/prijzen`, `/veiligheid`), `0.4` voor informatief/juridisch. **Een seo-pagina krijgt `0.4`; `0.8` alleen als hij écht een conversiepagina is.** *Nuttig om te weten: `/check` staat zelf niet in de lijst (wel crawlbaar — `robots.ts` weert hem niet). Ga er dus niet vanuit dat hij er staat, en voeg hem niet op eigen houtje toe.*
- `app/robots.ts` — alleen aanraken als de pagina om een bijzondere reden geweerd moet worden. Hij weert de ingelogde app-surfaces en auth-flows; de marketing-routes blijven geïndexeerd.
- `app/opengraph-image.tsx` — het gedeelde OG-beeld; een eigen beeld alleen als de pagina daarom vraagt.

## Waar toon, claims en ontwerp vandaan komen

| Wat | Canonieke bron | Nooit |
|---|---|---|
| Toegestane claims + Wft-grens | `.claude/skills/compliance-check/SKILL.md` | een tweede claimlijst |
| Toon & framing | `merkstem` → `lib/ai/dna/base.ts` (`== TOON ==`, `== FRAMING ==`) | een eigen toonlijstje |
| Ontwerp (niet-app) | `frontend-design` | in-app patronen lenen |
| Juridische pagina's | `CLAUDE.md`, uitzondering juridische pagina's (Grenswachter-route + `juridische-brief`) | via `kleine-aanpassing` |
| Getallen | de canonieke engines (*consume, don't recompute*) | zelf een getal noemen |

## Verwijzing

`org_plan/20-skills.md` §seo-pagina; rollen De Wegwijzer en De Vormgever (`org_plan/10-rollen.md`), stroom 09. Verwant: `zoekvraag-onderzoek` (levert de vraag), `content-creation` (schrijft de tekst), `compliance-check`, `frontend-design`, `kb-article`.
