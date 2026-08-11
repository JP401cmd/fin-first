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
`categorie_prios.onttrekking` (`sanitizeCategoriePrios`, schaal 1..5) rechtstreeks.
`buildTsParams` legt die overlay ÓVER de orde-afleiding heen (`overlayBezitPrio`,
`prio-overgang.ts`) — dáárom wint hij van de klem, en dáárom is hij een knop die
wél fiscaal onderscheid maakt: prio 1 = als eerste aanspreken, prio 5 =
reserve/echt achtergesteld.

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
belasting besparen door later vrij te zijn is geen winst), en een variant
waarvan de laagste buffer (`computeLaagsteBuffer`) onderweg UITGEPUT raakt is
onhaalbaar, niet goedkoop. Zie de docstrings in `varianten-sweep.ts` voor de
volledige regels (gelijkspel-tolerantie, eindvermogen verplicht meegeleverd in
twee expliciete grondslagen).

**Correctie (eindreview Fase 3).** Dit tweede veto stond hier — en in de code en
in `calculations.ts` — beschreven als "een negatieve laagste buffer", en zo was
het ook geïmplementeerd (`bedrag < 0`). Die drempel kon per constructie nooit
afgaan: `computeLaagsteBuffer` minimaliseert `spendablePortfolio`, een som van
bucket-`endValue`s die nooit met schulden wordt verrekend — een tekort landt als
Tekort-lening (schuld), niet als negatief bezit. Een variant die de portefeuille
volledig leegtrok bereikte dus `bedrag === 0`, passeerde het veto en kon met de
minste Box 3 de badge "laagste druk" krijgen: exact het geval dat het veto moest
afvangen. De drempel is verlegd naar UITPUTTING (`<= 0`, met een ruisband van één
cent) en de diskwalificatie heet nu `buffer-uitgeput`. Bewust géén relatieve
drempel ten opzichte van de jaarbehoefte: nul is de bodem van deze grootheid en
daarmee een feit uit het rij-contract, terwijl "hoeveel buffer is genoeg" een
norm zou zijn die deze laag niet mag verzinnen. Een reachability-test met een
leegtrek-fixture (`varianten-sweep.test.ts`) bewijst nu dát de diskwalificatie
afgaat op een echte kernel-run.

## Gevolgen

- Eén nieuwe rekenmotor geregistreerd in `lib/architecture/calculations.ts`
  (`levenslange-belastingdruk`, domein Belasting), plus een bijgewerkte
  `fiscale-optimizer`-entry (vierde katern niet langer "binnenkort").
- Nieuw aandachtspunt `box1-buiten-kernel-cashflow` in
  `lib/architecture/archimate-concerns.ts` — blijft staan tot Box 1 (met een
  eigen pariteitsbewijs) de kernel in gaat.
- Nieuwe datastroom op de ArchiMate-plaat: `as-planning -> as-belasting`
  (de optimizer consumeert projectierijen uit de horizon-kernel), plus de
  nieuwe route `/api/belasting/varianten-sweep`.
- HLD-praatplaat: de vijfde belasting-capability ("wanneer je je pensioenpot
  aanspreekt") gaat van impliciet/afwezig naar een echte "ik wil…"-regel. (Het
  gaat om het vierde KATERN op de optimizer-pagina, maar om het vijfde item in
  de belasting-groep van `hld-model.ts` — twee verschillende tellingen.)

## Drie resterende beperkingen (bewust buiten deze fase)

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
## Ingetrokken beperking: de arbeidskorting-afwijking (11 aug 2026)

Dit ADR noemde als vierde beperking dat `computeBox1Tax` de arbeidskorting over
het volledige `grossYearlyIncome` berekende, dus ook over AOW/pensioen — fiscaal
geen arbeidsinkomen. Die beperking is **opgeheven**, niet verzacht.

`lib/box1-tax.ts` kent nu `Box1Input.arbeidsinkomen` als eigen grondslag voor de
arbeidskorting én de IACK, met terugval op `grossYearlyIncome` zodat een
niet-omgezette aanroeper niets merkt. `lib/tax-lifetime/lifetime-tax.ts` geeft
`arbeidsinkomen: 0` mee — voor de tariefstap én voor de netto→bruto-inversie van
de AOW (`grossFromNet`), want een korting in de inversie zou de fout via een te
laag `aowBruto` alsnog binnenlaten. Er is nog steeds precies één tariefmotor; dit
is invoer, geen tariefvariant.

Gevolg voor deze sectie, gemeten op `BOX1_PARAMS[2026]` (nieuw − oud per jaarrij
`box1NietVerrekend`): AOW € 0 + pensioen € 30.000 → **+€ 5.381** vóór de AOW en
**+€ 2.687** erna; AOW € 16.000 netto + pensioen € 30.000 → **+€ 1.990** ná de
AOW; met een pensioen van € 150.000 draait het naar **−€ 707**. De heffing gaat
in het gangbare bereik dus omhoog, en het sterkst in de pre-AOW-jaren — precies
waar "pensioen vroeg" zijn onttrekkingen concentreert. **De rangschikking van de
sweep kan hierdoor verschuiven**; de variant "pensioen vroeg" werd voorheen te
gunstig voorgesteld.

De zesde kanttekening onder katern IV die dit meldde is daarmee **ingetrokken**
(zeven → zes punten): hem laten staan zou een onwaarheid op het scherm zijn. De
tests in `lifetime-tax.test.ts` heten nu "GRONDSLAG" in plaats van "BEKENDE
AFWIJKING" en pinnen de nieuwe uitkomst exact plus de gemeten sprong.

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
