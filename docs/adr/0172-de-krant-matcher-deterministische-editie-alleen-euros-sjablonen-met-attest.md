---
id: 0172-de-krant-matcher-deterministische-editie-alleen-euros-sjablonen-met-attest
title: 'De Krant-matcher: deterministische editie in de schaduw, alleen euro''s (B2), sjablonen met attest'
status: aanvaard
date: 2026-09-21
elements: [as-nieuws]
---

Op de duiding van ADR 0171 legt een pure, deterministische matcher (`lib/krant/matcher.ts`) per
lezer een editie samen: doelgroepregels toetsen op een profiel van dertien velden in banden, de
impact op de twee bandranden rekenen met de canonieke motoren (box 3, box 1 via een
params-override, AOW-tabel, DUO-rente en eigen risico uit `lib/constants.ts`), scoren op de
ondergrens per maand, selecteren (drempel 3, max 8, max 3 per rubriek, direct eerst) en
renderen uit een sjablooncatalogus die per formulering een attest draagt. De Krant rekent en
spreekt uitsluitend in euro's (B2) — de bewuste, in code bewaakte uitzondering op de
vrijheidstijd-regel. Fase 1 draait nergens live: geen tabel, cron of UI.

# 0172 — De Krant-matcher: deterministische editie in de schaduw

## Context

Het plan *De Krant op eigen benen* (K1) brengt het nieuws uit zonder AI aan de kant van de
gebruiker. ADR 0171 legde de duiding vast: elk artikel één keer, in de achterkant, naar een
gesloten schema met gegronde parameters. Deze ADR legt de tweede helft vast — hoe die duiding
per lezer een editie wordt zonder dat er een model aan te pas komt. De eigenaar nam op 21 sep
2026 vijf keuzes op de analyse van kaart 1B: eigen tabellen voor de schaduweditie
(`news_editions` onaangeraakt tot 1C), een params-override in `lib/box1-tax.ts`, fiscaal
partnerschap bij Geheel-gebruikers onbekend, constanten voor eigen risico en DUO-rente met de
gevoeligheidsvorm als terugval, en de itemcontrole via een testsectie op /nieuws.

De belangrijkste les uit de review van 1A gold ook hier: een getal in de editie mag alleen
komen uit de canonieke motoren of uit parameters die de codecontroles doorstonden — nooit uit
eerdere modeluitvoer.

## Besluit

1. **Profiel v1 in banden** (`lib/krant/profiel.ts`): de dertien velden van `profiel-velden.ts`,
   elk `null` voor "weet ik niet"; banden halfopen (`lo` erbij, `hi` niet), de bovenste open
   (`hi = null` → "minstens"). Er is geen uitgavenband (B2).
2. **Impact op de bandranden** (`lib/krant/impact.ts`): per rekenend mechanisme
   `{ lo, hi }` uit nieuw − huidig op beide randen, met `computeBox3Heffing`,
   `computeBox1Tax`/`grossFromNet` (netto-band per rand naar bruto, U4), `lookupAowAge` op
   1 januari en 31 december van het geboortejaar, en `DUO_RENTE_PCT`/`ZORG_EIGEN_RISICO`.
   "Huidig" is altijd exact het jaar vóór het aangekondigde jaar — geen terugval op een
   ouder jaar (anders vergelijkt een 2027-artikel met zichzelf zodra 2027 in de tabel staat).
   Drie eerlijke uitkomsten: bereik, ontbreekt (een profielveld is null) en onbekend (de
   drempel valt in de band, het jaar ervóór is niet canoniek bekend, de richting verschilt
   per rand, de rente staat nog vast, het besluit raakt een ander cohort). Een
   drempel-mechanisme (box 3, box 1) met een bandondergrens die Δ 0 geeft is `drempel-in-band`;
   een proportioneel mechanisme (studieschuld) geeft dan `{0, hi}` — "hoogstens". Een
   AOW-besluit "vanaf jaar X +m" raakt uitsluitend het cohort dat in jaar X de AOW-leeftijd
   bereikt (beide randen van het geboortejaar, de december-rand mét maanden); latere cohorten
   dragen de CBS-prognose al en krijgen `buiten-besluit`, nooit een gestapelde leeftijd.
   AOW-gerechtigdheid voor box 1 wordt in het regeljaar per cohortrand bepaald;
   `werk = pensioen` is geen AOW-bewijs (vroegpensioen) maar zet alleen het arbeidsinkomen
   op 0. Nooit gokken: fiscaal partner alleen bij `huishouden = fiscaal-partner` (keuze 10);
   een AOW-gerechtigde met een aangekondigd schijf-1-tarief of korting is `niet-afleidbaar`.
3. **Box 1 met een aangekondigde parameter** (keuze 9): `Box1Input.params` en
   `grossFromNet(..., { params })` rekenen met een override; weglaten is byte-identiek aan
   vóór 21 sep 2026 (`lib/box1-tax.params-override.test.ts`).
4. **Constanten** (keuze 11): `ZORG_EIGEN_RISICO` (2025/2026: 385; 2027 bewust niet — niet
   besloten), `DUO_RENTE_PCT` per jaar en stelsel (sf15/sf35; het profiel kent het stelsel
   niet, dus beide vormen het bereik) en `KRANT_GEVOELIGHEID_STAP_PP` (0,25) in
   `lib/constants.ts`. Ontbreekt een jaar, dan degradeert studieschuld naar de
   gevoeligheidsvorm en eigen risico naar relevant zonder bedrag.
5. **Score en selectie** (`MATCHER_VERSIE = 1`): score op de ondergrens per maand (≥ €25 → 5,
   ≥ €10 → 4, ≥ €2 → 3, > 0 → 2, anders 1); AOW-verschuiving 4; gevoeligheid hoogstens 3;
   relevant gericht 2, algemeen 1. Een ONBEVESTIGDE doelgroep (een regel onbekend) krijgt
   geen som, geen bonus en het sjabloon "wat mist" — "misschien raakt dit jou" wordt nooit
   een stellige zin met een bedrag. Deadline +1 en rubriekvoorkeur +1 alléén bij een
   bevestigde doelgroep; beursbeweging nooit boven 2; een gedempte rubriek alleen met 4 of 5.
   Drempel 3, hoogstens 8, hoogstens 3 per rubriek tenzij er anders te weinig is; direct
   vóór gevoeligheid vóór relevant, dan score, dan artikel-id. Leeg is een geldige editie.
   "Wat mist" en "relevant" scoren bewust onder de drempel: laat de meting dunne edities
   zien, dan is dat de eerste knop.
6. **Leescontract van 1A** in code (`voldoetAanLeescontract`): alleen `geduid`, `category` als
   rubriek, `fetched_at` binnen zeven dagen óf een deadline in de toekomst; gezien telt niet.
   Het item draagt de door 1A gecontroleerde `samenvatting`, maar de matcher legt haar nog
   langs de Wft-woordenlijst en zet haar op null bij een treffer (grep-bare reden in
   `waarom`). Het algemene katern sorteert op recency en id — bewust los van
   `is_used`/`potential_impact`, staat van het AI-editiepad (keuze 8).
7. **Alleen euro's** (B2): geen dagtarief, geen vrijheidstijd, geen uitgavenband. Een
   bewuste, gedocumenteerde uitzondering op de app-brede regel "elk bedrag boven €100 ook in
   vrijheidstijd", in code bewaakt door `lib/krant/euro-only.test.ts` (verboden identifiers in
   elk bronbestand onder `lib/krant/`) en de `euro-only`-markering per bestand.
8. **Sjablonen met attest**: de teksten staan apart in `sjablonen-catalogus.ts` (zonder
   imports, zodat een script ze kan lezen), zijn merkstem-oppervlak `krant-sjablonen` én dragen
   per formulering een sha256 in `sjablonen-attest.json` met de uitkomst van de
   compliance-check; `sjablonen-attest.test.ts` is een TEST-TIJD-poort (geen runtime-gate):
   een gewijzigde of niet-getoetste formulering maakt de suite rood, en het attest mag niet
   stil stale zijn t.o.v. het merkstem-manifest (zelfde copy-hash, zelfde attestatiedatum).
   Het attest is op 21 sep 2026 geschreven door de bouwende agent na de compliance-check-skill;
   de herbevestiging door de eigenaar/Grenswachter is een open punt op de K1-poort. Bedragen
   komen uitsluitend via `formatCurrency`, de AOW-leeftijd via `formatAowAge`; een ongevuld
   slot gooit. De gevoeligheidsvorm (B5) zegt in de tekst dat de bank niet hoeft te volgen;
   deadlines zijn beschrijvend; het algemene katern is gelabeld (B7).
9. **Wft-woordenlijst in code** (`wft-woordenlijst.ts`): gebiedende wijs, aanbieders, de
   sparen-of-beleggen-keuze en de vrijheidstijd-woorden — de vangrail die ADR 0171 open liet,
   nu toegepast op de catalogus en herbruikbaar voor de samenvatting (1A fase 2 / 1C).
10. **Determinisme**: alles via `MatchContext` (tijd, gezien, gedempt, parameters); ties op
    artikel-id; sjabloonvariant = FNV-1a van het artikel-id. Golden edities per persona in
    `lib/krant/__golden__/` zijn de referentie voor "geen fout getal".

## Gevolgen

- **Fase 1 draait nergens**: geen tabel, geen cron, geen UI. De K1-meting begint pas met fase 2
  (eigen tabellen voor de schaduweditie — keuze 8 —, profiel-afleiding uit eigen data met
  `.eq('user_id')` op élke tabel, weekcron, herberekening na terugtrekken via
  `editie-herberekening.ts`, security-run) en fase 3 (meting op `/beheer/nieuws`, testsectie
  op `/nieuws`).
- **Dunne edities zijn de bedoeling**: met drie velden die bij Geheel-gebruikers vaak
  onbekend blijven (werk, fiscaal partner, kindleeftijd) zullen sommen vaak `ontbreekt` of
  `onbekend` zijn en scoort het bericht onder de drempel. De meting per profieltype laat zien
  of de drempel te streng is; hij wordt niet vooraf verlaagd.
- **Contract met 1A**: `mechanismeSchema` discrimineert op `soort`, maar `params` is op
  typeniveau de unie van alle params-schema's; de matcher cast per tak
  (`MechanismeParams<'…'>`). Een scherpere typing in `lid()` is een verbetering voor 1A,
  geen blokkade. `jaar = null` valt terug op het jaar van `ingangsdatum`; `_pct`-params worden
  door 100 gedeeld tegen de fracties van `DREMPEL_EENHEID`; het teken van `verschuiving_pp`
  speelt in de gevoeligheidsvorm geen rol (richting is per definitie 'geen').
- **Merkstem**: `krant-sjablonen` is een vijfde oppervlak in `scripts/merkstem/scan.mjs`, met
  de B2-caveat; het manifest is herattesteerd op 21 sep 2026. Een tekstwijziging vraagt
  herattestatie van beide (manifest én sjabloon-attest).
- **Architectuur**: rekenmotor `nieuwsimpact` in het nieuwe domein *Nieuws* van de
  Berekeningen-view; geen HLD-wijziging (geen gebruikersfunctie tot 1C).
