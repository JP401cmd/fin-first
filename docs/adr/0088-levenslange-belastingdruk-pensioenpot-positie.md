---
id: 0088-levenslange-belastingdruk-pensioenpot-positie
title: 'Levenslange belastingdruk (Fase 3): Box 1 als rapportagelaag náást de kernel, sturen via categorie_prios, scope versmald tot de pensioenpot-positie'
status: aanvaard
date: 2026-08-05
elements: [as-belasting, as-planning]
---

# 0088 — Levenslange belastingdruk: Box 1 als rapportagelaag, sturen via `categorie_prios`, scope = pensioenpot-positie

## Context

ADR 0040 (fiscale-strategie-optimizer, Box 3-MVP) noemde de "onttrekkingsvolgorde-as"
als openstaande vervolgfase: een kernel-preset-sweep, doel = laagste levenslange
Box 3 + FIRE-leeftijd-behoud. Die formulering wees op twee dingen die bij het
bouwen niet hielden: (1) de horizon-kernel kent alleen Box 3 — pensioen en
lijfrente komen bruto en onbelast binnen, AOW netto — dus "laagste levenslange
Box 3" alleen zou een pensioenpot leegtrekken altijd als gratis winnaar
aanwijzen, en (2) `WITHDRAWAL_ORDER_PRESETS` is geen bruikbare sweep-as (zie
Besluit 2). Fase 3 loste beide op, met drie besluiten die ADR 0040 niet nam.

## Besluit

**1. Box 1 als rapportagelaag náást de kernel-cashflow, niet erin.**
`lib/tax-lifetime/lifetime-tax.ts#computeLifetimeTax` leidt de werkelijk
verschuldigde Box 1 af uit de projectierijen (`Box1Streams`: AOW netto,
pensioenuitkering bruto, pensioenonttrekking bruto), door het verschil te nemen
tussen de heffing over de volledige grondslag en de heffing die al in het netto
AOW-bedrag verrekend zat. De horizon-kernel zelf blijft ongewijzigd — hij is
Excel-oracle-bewezen (ADR 0032) en draait onder ieders FIRE-datum; een Box
1-tabel die in de kernel-cashflow terugvloeit zou een buiten-oracle-extensie
zijn met regressierisico op iedere bestaande projectie.

**Bewust geaccepteerd gevolg:** de heffing vloeit niet terug in de cashflow, dus
het model rekent niet mee dat een gebruiker extra bruto moet opnemen om die
belasting te kunnen betalen. De uitkomst is de heffing over het plan zoals de
kernel het doorrekende, niet het (hogere) plan dat de heffing zou financieren.
Dat is een gebruiker-zichtbare kanttekening op `/overzicht/belasting/optimizer`
(katern IV), geen stille aanname — zie ook aandachtspunt
`box1-buiten-kernel-cashflow`.

**2. Sturen via `categorie_prios.onttrekking`-overlays, niet via
`WITHDRAWAL_ORDER_PRESETS`.** De voor de hand liggende sweep — de vier
benoemde presets doorrekenen — zou hebben gelogen. `orderedGroupsToPrio`
(`lib/horizon-kernel/adapter/prio-overgang.ts`) klemt de positie van een groep
op `Math.min(i + 1, 4)`. De presets `liquide-eerst`
(`[spaargeld, beleggingen, overig, pensioen, vastgoed]`) en `pensioen-sparen`
(`[spaargeld, beleggingen, overig, vastgoed, pensioen]`) zetten pensioen op
respectievelijk positie 4 en 5 (1-based) — na de klem leveren beide exact prio
4 op, dus een identieke prio-vector en een identieke projectie. Een
preset-sweep had dus "pensioen als laatste bespaart € 0" getoond op precies de
preset die pensioen-sturing belooft — een vertaalartefact, geen fiscale
waarheid.

De sweep (`lib/tax-lifetime/varianten-sweep.ts`) gebruikt daarom de V5-overlay
`categorie_prios.onttrekking` (`sanitizeCategoriePrios`, schaal 1..5) rechtstreeks,
vóór de preset-vertaling: prio 1 = als eerste aanspreken, prio 5 = reserve/echt
achtergesteld. Dat is een knop die wél fiscaal onderscheid maakt.

**De klem in `orderedGroupsToPrio` zelf blijft bewust ongemoeid.** Hem verruimen
(bv. naar `Math.min(i + 1, 5)`) zou stil de onttrekkingsvolgorde van élke
bestaande gebruiker met een niet-default preset herrangschikken — een
gedragswijziging op live projecties zonder dat iemand erom vroeg, en oracle-nabij
code die niet lichtvaardig verandert. Fase 3 werkt eromheen, niet erdoorheen.

**3. Scope versmald van "laagste levenslange Box 3" (ADR 0040) naar de positie
van de pensioenpot.** Alleen de categorie 'Pensioen' heeft in dit model een Box
1-gevolg — spaargeld en beleggingen verplaatsen uitsluitend Box 3, en die
vergelijking dekt katern II van de optimizer al. "Laagste belastingdruk over je
hele leven" (de brede ADR 0040-formulering) beloofde dus meer dan het model
draagt; katern IV toont daarom drie varianten van één as (de plek van de
pensioenpot: huidige volgorde / zo laat mogelijk / zo vroeg mogelijk), niet een
optimalisatie over de volledige onttrekkingsvolgorde.

Dit besluit **vervangt** de bullet "Onttrekkingsvolgorde-as" uit ADR 0040's
vervolgfasen-lijst.

## Rangschikking (kort, voor de volledigheid)

Primair op de laagste `levenslangeTotaleDrukNominaal`, met twee vetorechten: een
variant die FIRE later zet dan de referentie kan nooit winnen (ADR 0040 —
belasting besparen door later vrij te zijn is geen winst), en een variant met
een negatieve laagste buffer (`computeLaagsteBuffer`) is onhaalbaar, niet
goedkoop. Zie de docstrings in `varianten-sweep.ts` voor de volledige regels
(gelijkspel-tolerantie, eindvermogen verplicht meegeleverd in twee expliciete
grondslagen).

## Gevolgen

- Twee nieuwe rekenmotoren geregistreerd in `lib/architecture/calculations.ts`:
  `levenslange-belastingdruk` (nieuw, domein Belasting) en de bijgewerkte
  `fiscale-optimizer`-entry (vierde katern niet langer "binnenkort").
- Nieuw aandachtspunt `box1-buiten-kernel-cashflow` in
  `lib/architecture/archimate-concerns.ts` — blijft staan tot Box 1 (met een
  eigen pariteitsbewijs) de kernel in gaat.
- Nieuwe datastroom op de ArchiMate-plaat: `as-planning -> as-belasting`
  (de optimizer consumeert projectierijen uit de horizon-kernel), plus de
  nieuwe route `/api/belasting/varianten-sweep`.
- HLD-praatplaat: de vierde belasting-capability ("wanneer je je pensioenpot
  aanspreekt") gaat van impliciet/afwezig naar een echte "ik wil…"-regel.

## Vier resterende beperkingen (bewust buiten deze fase)

1. **Gewogen trekking, geen strikte volgorde.** Een "volgorde" is in het model
   geen harde rij maar een gewogen gelijktijdige opname: een pot met een hogere
   prioriteit levert per euro ongeveer twee keer zoveel op als de pot erna.
   Alleen prio 5 ("als laatste") is echt achtergesteld.
2. **Lijfrente niet los stuurbaar.** Lijfrente valt in het model samen met
   bedrijfspensioen in dezelfde kern-categorie 'Pensioen'; de sweep kan ze niet
   los van elkaar plaatsen.
3. **Partner volledig uitgesloten (ADR 0036).** Box 1 is per persoon; het
   partner-inkomen wordt nergens als bruto grootheid vastgehouden, dus een
   partner-Box 1 zou verzonnen zijn. `Box1Streams.partnerBatenNetto` bestaat
   uitsluitend om die uitsluiting aantoonbaar en testbaar te maken.
4. **Arbeidskorting-afwijking in de tariefmotor.** `computeBox1Tax` berekent de
   arbeidskorting over het volledige `grossYearlyIncome`, dus ook over
   AOW/pensioen — fiscaal geen arbeidsinkomen. De heffing valt daardoor
   systematisch te laag uit (de reeks is conservatief). Gemeld en gepind in
   `lib/tax-lifetime/lifetime-tax.test.ts` ("BEKENDE AFWIJKING"); de correctie
   hoort in `lib/box1-tax.ts`, niet in de rapportagelaag.

## Alternatieven

- **Box 1 in de kernel-cashflow laten terugvloeien.** Verworpen: de kernel is
  Excel-oracle-bewezen; een terugkoppeling die niet in het oracle bestaat is een
  buiten-oracle-extensie met regressierisico op iedere bestaande projectie voor
  een MVP-katern.
- **`WITHDRAWAL_ORDER_PRESETS` sweepen (de voor de hand liggende lezing van ADR
  0040's vervolgfase).** Verworpen: aantoonbaar fout door de `Math.min(i+1,4)`-
  klem (Besluit 2) — had een reëel fiscaal effect als "€ 0" getoond.
- **De klem in `orderedGroupsToPrio` verruimen.** Verworpen: zou stil de
  onttrekking van elke bestaande gebruiker met een niet-default volgorde
  herrangschikken; een gedragswijziging die niemand vroeg, op oracle-nabije code.
- **Scope houden op "laagste levenslange Box 3" (volledige onttrekkingsvolgorde).**
  Verworpen: alleen de pensioenpot heeft een Box 1-gevolg; een bredere
  volgorde-optimalisatie zou hetzelfde Box 3-terrein herhalen dat katern II al
  dekt, zonder extra fiscale waarheid.
