# Kansen — UX-vereenvoudiging TriFinity (functioneel, kort)

> Terug naar de basis van het plan: **één coherente filosofie ("geld is opgeslagen tijd"), simpeler en consistenter** — niet "financiële data + los AI-laagje".
> Hieronder de kansen functioneel uitgewerkt: wat de gebruiker ziet/kan, de gedragsregel, en waar het landt. Gebaseerd op de vier mockups in `docs/mockups/`.

---

## 1. Eén hoofdcijfer per scherm, in vrijheidstijd

**Wat de gebruiker ziet** — Boven elk scherm één groot getal in tijd (bv. "Nog 11 jaar & 4 maanden tot je vrijheidsmoment"), met de euro's als ondersteunende regel eronder.

**Gedragsregel** — Per scherm geldt: één moment → één hoofdcijfer. Geen tweede, concurrerend tijd-getal op hetzelfde scherm (bv. niet óók "22 jaar vrijheid opgebouwd" naast de aftelling). Bedragen > €100 tonen hun vrijheidstijd-equivalent via de canonieke `formatWithFreedom`-helper.

**Waar** — Alle hub-/landingschermen: Overzicht, de drie hefboom-/box-katernen, Toekomst.

**Klaar wanneer** — Elk landingsscherm opent met precies één tijd-hoofdcijfer; secundaire cijfers staan visueel ondergeschikt of in de tweede laag (zie §3).

---

## 2. Gedeeld bouwblok-systeem i.p.v. per-pagina maatwerk

**Wat de gebruiker ziet** — Elk scherm voelt als dezelfde publicatie: dezelfde kop (masthead), kolom-anatomie, pull-quote, hero en disclosure.

**Gedragsregel** — Eén set herbruikbare componenten met vaste props; pagina's leveren alleen data aan, geen eigen styling. Concreet als eerste: `EditorialMasthead`, `LeverColumn` (de kolom-anatomie: keyline · label · bedrag · tijd-framing · status-dot), `PullQuote`, `HeroFigure`, `DepthDisclosure`.

**Waar** — Start bij Overzicht + de vier hefbomen; daarna Toekomst en de box-detailpagina's.

**Klaar wanneer** — De vier mockup-schermen zijn opgebouwd uit dezelfde ~5 componenten; geen pagina definieert eigen varianten.

---

## 3. Consistente "diepte"-interactie (één gebaar)

**Wat de gebruiker ziet** — Verdieping zit altijd achter dezelfde handeling: een sectie "Meer over …" die uitklapt. Geen mix meer van modals, sheets en losse toggles voor hetzelfde doel.

**Gedragsregel** — Tweede-laag-content (grafieken, kalenders, opbouw/kassabon, scenario's) leeft standaard ingeklapt onder één `DepthDisclosure`. Modals blijven alleen voor échte onderbrekingen (bevestigen, bewerken), niet voor "meer tonen".

**Waar** — Overal waar nu "deep-dive" via een BottomSheet of aparte toggle gebeurt.

**Klaar wanneer** — Per scherm is er hooguit één diepte-gebaar; bestaande deep-dive-sheets die puur tonen zijn omgezet naar disclosure.

---

## 4. Eenvoudig ⇄ Volledig als groeipad

**Wat de gebruiker ziet** — Eén schakelaar (profiel-breed): **Eenvoudig** toont alleen hoofdcijfer, kern-elementen en de één belangrijkste kans; **Volledig** vouwt de tweede laag overal open.

**Gedragsregel** — De keuze is een server-side voorkeur (cross-device, eigen-rij JSONB op `profiles` — spiegel `status_banner_minimized`/appearance), niet localStorage. Default = Eenvoudig voor nieuwe gebruikers. In Volledig staan alle `DepthDisclosure`'s open.

**Waar** — App-breed, één toggle (bv. in `/mijn` of de TopBar-utility-cluster).

**Klaar wanneer** — Toggle bestaat, onthoudt zich cross-device, en stuurt de open/dicht-stand van alle diepte-secties aan.

---

## 5. Grondslag-discipline: liquide vs. vast vermogen

**Wat de gebruiker ziet** — Vrijheidstijd wordt berekend op het **liquide** vermogen (beleggingen/spaargeld/crypto), niet op netto vermogen incl. huis. Een split-balk + kleur (goud = liquide/vrijheid-eligible, ink = vast: huis + pensioen) maakt het verschil zichtbaar en uitlegbaar.

**Gedragsregel** — Harde regel uit CLAUDE.md: meng `nettoVermogen` en het FIRE-eligible liquide vermogen nooit op één as/marker. Cijfers consumeren uit de canonieke engine, niet herberekenen.

**Waar** — Bezittingen-katern (primair), en overal waar vrijheidstijd/FIRE-voortgang getoond wordt.

**Klaar wanneer** — Geen enkel scherm rekent vrijheidstijd op netto vermogen incl. niet-liquide assets; liquide/vast is overal hetzelfde kleur-/betekenissysteem.

---

## 6. Weglaten wat niet telt (relevantie boven volledigheid)

**Wat de gebruiker ziet** — Niet-toepasselijke surfaces tonen een rustige "n.v.t."-staat met één regel uitleg en een disclosure voor wie het tóch nodig heeft (bv. Box 2 voor niet-DGA's). Berekende uitkomsten verschijnen meteen; geen lege calculators.

**Gedragsregel** — Per gebruiker bepalen of een surface relevant is (data-gedreven); zo niet → ingeklapte, niet-prominente staat. Auto-eerst: open met de berekende uitkomst, calculator/aannames in de tweede laag.

**Waar** — Box 2, en elke optionele/conditionele module.

**Klaar wanneer** — Surfaces zonder relevante data nemen geen volle aandacht; alles wat rekenbaar is, opent berekend.

---

## Nog niet in de mockups (uit de oorspronkelijke spec)

- **Gamification** — voortgang/mijlpalen voelbaar maken (bv. soevereiniteitsfasen als motivatie, niet als gating — ADR 0001).
- **Unified historische inzicht-/voorspellingslaag** — één consistent patroon voor "verloop + voorspelling" over álle modules (vermogen, cashflow, belasting, FIRE).
- **Feature-gating als zichtbare progressie** i.p.v. onzichtbaar verbergen — laat zien wat er bij een volgende fase ontgrendelt.

---

## Voorgestelde volgende stap

Eén van twee sporen:

- **(a) Breedte** — Schulden + Cashflow als katern afmaken zodat de hele voorpagina doorklikt en het verhaal compleet is.
- **(b) Diepte** — Het bouwblok-systeem (§2) vertalen naar echte React-componenten, te beginnen met `EditorialMasthead` + `LeverColumn`.

*Mockups: `docs/mockups/{overzicht,bezittingen,belasting-hefboom,toekomst}-redesign.html` — één klikbaar geheel.*
