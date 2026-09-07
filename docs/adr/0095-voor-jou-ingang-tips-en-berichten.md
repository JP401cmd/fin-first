---
id: 0095-voor-jou-ingang-tips-en-berichten
title: Tips & acties en Berichten blijven aparte ingangen; de mobiele nav krijgt Tips erbij
status: aanvaard
date: 2026-08-09
elements: [sp-inzicht, as-coach]
---

Het audit-voorstel NAV-4 wilde "Tips & acties" en "Berichten" samenvoegen tot één ingang "Voor jou · N". Verificatie in de code laat zien dat de dubbeling alleen op de desktop-sidebar bestaat, dat er nooit twee badges waren, en dat één gedeelde teller twee onverenigbare datamodellen zou moeten optellen. Voorstel: de twee ingangen blijven bestaan; in plaats daarvan repareren we het werkelijke gat — "Tips & acties" ontbreekt volledig in de mobiele navigatie.

## Context

`/overzicht/tips` en `/berichten` staan allebei in `OVERIGE_BASE` van de desktop-sidebar en lijken daar op elkaar. Drie feiten uit de verkenning (`docs/verkenning-voor-jou-ingang.md`) sturen het besluit bij:

1. **Er zijn geen twee badges.** Berichten heeft één numerieke teller (`useNotifications().unreadCount`); Tips & acties heeft alleen een binaire freshness-stip (`sidebarSignals.tipsActions`).
2. **Mobiel is het omgekeerde probleem.** `globalNav` in `lib/nav-config.ts` bevat Krant, Berichten, Vraag Fin en Account — géén Tips & acties. Op mobiel is die pagina alleen bereikbaar via `/overzicht`-links, ⌘K, de gezondheidsscore-kassabon en een AI-`actionUrl`.
3. **"Voor jou · N" heeft geen definieerbare N.** Meldingen zijn een *afgeleide* stroom: `/api/notifications` genereert ze bij elke GET en merget ze in een JSON-blob (`app_settings.notifications_history_<uid>`). Aanbevelingen en acties zijn DB-rijen met een eigen levenscyclus (pending/postponed, toewijsbaar aan een partner). "Gelezen" en "afgehandeld" zijn verschillende begrippen; een gecombineerd getal daalt zodra iemand léést, zonder dat er iets gedaan is.

Daar komt bij dat `/overzicht/tips` een server-component op `loadFinData` is en `/berichten` volledig client-side draait zonder server-data. Samenvoegen betekent per definitie één van beide omkatten.

## Besluit

**Aanvaard (JP, 9 augustus 2026):** NAV-4 niet uitvoeren zoals beschreven. In plaats daarvan:

1. "Tips & acties" toevoegen aan `globalNav` in `lib/nav-config.ts`, zodat de mobiele nav-sheet dezelfde ingangen toont als de desktop-sidebar.
2. De numerieke badge blijft uitsluitend bij Berichten; Tips & acties houdt zijn freshness-stip in de **desktop-sidebar**. De mobiele nav-sheet toont bewust géén signalen — ook Berichten laat daar zijn ongelezen-getal niet zien. De sheet is een navigatie-index, geen statuspaneel; signaal-affordances horen bij de sidebar. Het item is dus vindbaar, maar zegt op mobiel niet uit zichzelf dát er iets ligt.
3. Samenvoegen blijft open, maar is geblokkeerd achter één voorafgaande beslissing: **wat telt "Voor jou · N"?** Zonder dat antwoord levert het een getal op dat niet uit te leggen is — precies het cijfer-zonder-context dat ADR-lijn NAV-5 (fase 4) juist heeft weggehaald.

## Gevolgen

- **Winst:** het enige aantoonbare gebruikersprobleem (tips onvindbaar op mobiel) verdwijnt met één nav-config-regel plus een test. Geen redirects, geen migratie, geen tellerdefinitie, geen omkatting van server↔client.
- **Blijft staan:** de desktop-sidebar houdt vier "overige"-regels, waarvan er twee als "wat ligt er voor mij" lezen. Dat is bewust: ze doen echt iets anders — bij Tips *handel* je, bij Berichten *lees* je.
- **Als samenvoegen later alsnog op tafel komt:** de tellerdefinitie is de eerste stap, niet de tab-indeling. Uitvoeringsschets in §4 van de verkenning; verwacht raakvlak: `nav-config.ts`, sidebar, nav-sheet, ⌘K-index, ~7 deeplinks naar `/overzicht/tips` (incl. `#acties`) en de UAT-zones WILL/NAV/OVZ.

## Uitgevoerd

Geïmplementeerd op 9 augustus 2026:

- `lib/nav-config.ts` — `globalNav` opent nu met `{ label: 'Tips & acties', icon: Zap, href: '/overzicht/tips' }`. Geen badge: het numerieke ongelezen-getal blijft exclusief bij Berichten.
- `/overzicht/tips` is uit `EXTRA_ROUTE_TITLES` gehaald — die map is per contract voor routes búiten de nav-structuur, en de route levert zijn titel nu uit `globalNav`. `resolveRouteTitle('/overzicht/tips')` blijft ongewijzigd `'Tips & acties'`.
- `lib/nav-config.test.ts` — twee asserties die bijten: het item moet in `globalNav` staan, en `/overzicht/tips` mag niet dubbel in `EXTRA_ROUTE_TITLES` staan.

De desktop-sidebar (`OVERIGE_BASE`) is bewust ongemoeid gelaten.

## Herbevestigd — 7 september 2026 (UR3-27)

Persona Bas kon het verschil tussen briefing, Tips & acties en Berichten niet
uitleggen. Kaart UR3-27 heropende dit besluit expliciet. Uitkomst: **dit ADR
blijft staan**, maar op nieuwe gronden — niet op de oude.

**Wat er sinds augustus veranderde.** De meldingstroom groeide van enkele naar
tien typen. De blokkade uit §3 hierboven ("wat telt N?") is daarmee zwaarder
geworden, niet lichter: één gedeelde teller zou nog steeds dalen zodra iemand
*leest* zonder dat er iets *gedaan* is, over tien producenten in plaats van
enkele.

**Wat het onderzoek toevoegde.** Het zijn geen vier ingangen maar acht
(briefing, tips, berichten op drie oppervlakken, krant, volgende-stap-widget,
status-duiding, check-in-banner, Fin). Belangrijker: drie van de vier zijn
**al samengevoegd**, alleen niet zichtbaar. De briefing consumeert de tips
(`lib/briefing/engine.ts`), het topitem uit de Krant-cache
(`lib/briefing/news-market.ts`) én de aandachtspunten-bus
(`lib/aandachtspunten-loader.ts`, mét actie-suppressie). De briefing *is* de ene
plek; hij zei het alleen niet.

**Besluit (eigenaar, 6 september 2026): variant B — samenvoegen op de bron-as,
niet op de route-as.** De routes blijven gescheiden; het werk zit in de bronnen
die nog niet aan de aandachtspunten-bus hangen (`/api/notifications`, `/nieuws`)
en in het uitspreken van de rolverdeling op het scherm. Variant A (één "Voor
jou"-ingang) valt op dezelfde tellerdefinitie als in 2026-08. Variant C (alles in
de briefing) valt op het *moment*-argument: de briefing is per ISO-week bevroren
(`lib/briefing/snapshot.ts`) en kan geen gebeurtenis-gedreven meldingen dragen —
een bankkoppeling die vandaag verloopt mag niet tot maandag wachten.

**Heropeningsgrond.** Landt UR3-31 (geheugen van het vorige bezoek), dan verdient
variant A een nieuwe weging: "sinds je vorige bezoek" ís een uitlegbare N, waar
"openstaand" dat niet was. Dat is precies het getal dat dit ADR in 2026-08 miste.

**Uitgevoerd in dezelfde ronde (fase 1 van variant B):** de twee defecten die de
ingangen elkaar lieten tegenspreken — het filterverschil op de tips-stip en de
meldingen die op een hub landden. Zie `lib/recommendation-status.ts` en
`app/api/notifications/action-url.test.ts`.
