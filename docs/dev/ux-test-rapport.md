# UX-testrapport TriFinity

**Getoetste belofte:** "De vrijheid om met inzicht en grip keuzes te maken voor nu en later."

**Opzet.** Zes testrondes op vijf accounts, uitgevoerd in een echte browser op een
lokaal draaiende instantie met volledige database. Drie persona's: beginner
(leeg account, zelf invoeren), groeiende gebruiker (persona Lisa, €130k netto
vermogen) en power user (persona Willem, €1,62M / persona Tessa, alle assettypen).
Beoordeeld is wat er op het scherm gebeurde, niet wat de code bedoelt.

**Wat níét is getest, en waarom.** Mobiel (Fase 16) is volledig blijven liggen:
de testomgeving raakte verzadigd en responsiviteit zou de waarneming vervuild
hebben. Een cijfer geven zou een gok zijn. Verder ontbreken: cashflow/transacties
en CSV-import, budget aanmaken, spaardoelenbeheer, rapportages, Fin-chat,
toegankelijkheid, en delen van de personalisatie-persistentie.

**Scheiding tussen product en omgeving.** De testomgeving bleek zes database-objecten
te missen die geen enkele migratie aanmaakt. Dat veroorzaakte lege schermen, €0
vermogen en mislukte opslag. Alle waarnemingen die daaruit voortkwamen zijn
verwijderd. Waar het *herstelgedrag* rond zo'n fout wél productgedrag is, staat dat
expliciet vermeld.

---

## De kern in vier zinnen

De app is op zijn best precies daar waar het moeilijk is, en op zijn zwakst waar het
makkelijk had gekund. De verdiepingspagina's leggen uit hoe een rendement berekend
is, waarom netto vermogen afwijkt van de som van je bezittingen, en wat 0,5%
beheerkosten je over dertig jaar kost — inhoudelijk lastig werk, goed gedaan.
Tegelijk geeft het scherm dat de hoofdvraag beantwoordt per laadbeurt een ander
antwoord, staat er een rendement van 665% in beeld, en telt de onboarding twintig
schermen zonder één keer te laten zien waar het allemaal voor is.
Dat is bemoedigend: de dure dingen zitten goed, de zwaarste problemen zijn tekst-,
teken- en volgordekwesties.

---

## Bevindingen

### 🔴 Critical

#### C1 · Het kernantwoord van de app is niet-deterministisch
**Scherm** `/toekomst` · **Persona** allemaal · **Gezien** ná reparaties

Drie keer dezelfde pagina laden, dezelfde gegevens, dezelfde sessie, seconden ertussen:

| Laadbeurt | Vrijheidsleeftijd | Doelbedrag |
|---|---|---|
| 1 | 52,9 jaar | € 537.598 |
| 2 | **67 jaar** | **€ 1.180.986** |
| 3 | 52,9 jaar | € 537.598 |

Een tweede tester zag hetzelfde op een ander account: "61,6 jaar / € 2.101.015"
versus "Je bent vrij / € 705.173", en "stop 58" versus "stop 62".

**Probleem** De vraag waarvoor mensen deze app openen krijgt per laadbeurt een ander
antwoord: veertien jaar verschil, een verdubbeld doelbedrag.
**Aanwijzing** Op datzelfde scherm staat "AOW-integratie: inbegrepen vanaf 67j", en
de afwijkende laadbeurt gaf exact 67. Dat wijst op een terugval op de AOW-leeftijd
wanneer de FIRE-berekening niet compleet is — een race waarbij pensioen- of
vermogensgegevens nog niet binnen zijn op het moment van rekenen.
**UX-principe** Een projectie mag onzeker zijn over de toekomst, niet over zichzelf.
**Impact** Wie dit één keer opmerkt, gelooft daarna geen enkel getal meer. Extra wrang:
hetzelfde scherm legt uit dat Monte Carlo "dezelfde invoer altijd dezelfde uitkomst geeft".
**Aanbeveling** Eén canonieke bundel per request; geen loaders die onafhankelijk van
elkaar meekomen. Toon liever "we kunnen dit nu niet berekenen" dan een tweede antwoord.

#### C2 · Het label van de vrijheids-delta zegt het omgekeerde van wat het getal betekent
**Scherm** `/toekomst/gebeurtenissen` · **Persona** allemaal · **Gezien** ná reparaties

| Gebeurtenis | Financieel effect | Badge |
|---|---|---|
| Kinderen naar middelbare school | −€200/mnd kosten (lasten omlaag) | **−11 mnd vrijheid** |
| Sabbatical jaar | +€500/mnd kosten, −€4.200/mnd inkomen | **+2.4 jaar vrijheid** |
| AOW | +€940/mnd inkomen | **−4.1 jaar vrijheid** |

**Probleem** De rekenkunde is consistent — het getal is de verschuiving van je
vrijheidsdatum, waarbij plus "later" betekent. Het woord is het probleem:
"+2.4 jaar vrijheid" leest als méér vrijheid, terwijl het lánger wachten betekent.
Een badge lokt uit dat je alleen de badge leest.
**UX-principe** Natural mapping.
**Aanbeveling** Formuleer als richting: "→ 2,4 jaar later vrij" / "→ 4,1 jaar eerder
vrij", met consistente kleur. Tekst- en tekenkwestie, geen rekenwerk.

#### C3 · Onboarding-invoer overleeft geen apparaatwissel, en een mislukte opslag wist alles
**Scherm** `/onboarding` · **Persona** allemaal

Voortgang staat in `localStorage` (`trifinity_onboarding_draft`), niet bij het account —
terwijl je ingelogd bent. Verversen in dezelfde browser gaat goed; een ander apparaat
begint bij vraag 1. Een tester moest de wizard vier keer doorlopen.

Erger is het herstelgedrag. De banner "✓ Je eerder ingevulde gegevens zijn hersteld"
herstelt alleen de stáppositie: drie ingevoerde bezittingen werden er één, de naam uit
stap 1 was verdwenen. En bij een mislukte eindopslag verschijnt "OPSLAAN MISLUKT —
Je antwoorden staan nog hier — probeer het opnieuw", terwijl de wizard áchter die
melding al op 1/8 staat met een leeg naamveld. "Opnieuw proberen" heeft dan niets
meer om te versturen.

**Nuance** De serverfout die dit uitlokte kwam door de testomgeving. Het gedrag
eromheen is productgedrag: een falende opslag hoort de state nooit te wissen, en een
melding hoort waar te zijn.
**Severity** Critical — verlies van tot twintig minuten invoer, precies op het moment
van afronden.
**Aanbeveling** Persisteer per sectie server-side. Herstel óf alles, óf meld eerlijk wat
niet hersteld is. Behoud de payload bij een mislukte submit.

#### C4 · De prominente knop in de publieke funnel vernietigt de invoer
**Scherm** `/check` stap 5 · **Persona** allemaal

Je typt €25.000 bij Spaargeld. De enige breed uitgevulde donkere knop op het scherm
zegt **"Overslaan (geen bezittingen)"**; "Toevoegen" is een klein knopje naast het veld,
en er is op dat moment géén "Verder". Klikken op de grote knop gooit je invoer weg
zonder waarschuwing, gaat door naar stap 6, en de teller "AL VRIJGEKOCHT" zakt stil van
1j 4m naar 8m. Hetzelfde patroon op stap 6, 8 en 9.

**Probleem** De visueel primaire actie vernietigt het werk dat je net deed, en het label
spreekt tegen wat je zojuist invulde.
**Aanbeveling** "Verder" moet altijd zichtbaar zijn; "Overslaan" is secundair.
Bij ingevulde velden: vul automatisch aan of waarschuw.

---

### 🟠 High

#### H1 · Het verwachte rendement staat honderd keer te hoog
`/overzicht`, FIRE-prognosewidget. "Verwacht rendement (portefeuille) **665,5%**"
(op een ander account 650,0%). Eén absurd getal besmet de geloofwaardigheid van de
prognose ernaast. **Aanbeveling** Formatter controleren, plus een vangrail: een
jaarrendement boven 100% is geen getal om te tonen maar een signaal.

#### H2 · De briefing spreekt de rest van het dashboard tegen
Op hetzelfde scherm, op hetzelfde moment: de briefing zegt "Je vermogen staat voor
**0 dagen** aan vrijheid" en "Je noodfonds dekt **0,0** van de 6 maanden", terwijl de
pilaren-modal zegt "Noodfonds **Uitstekend 100** — 6,7× salaris" en De Toekomst
"5 jaar en 10 maanden vrijheid". De briefing bleef uren op "BIJGEWERKT 13:36" staan,
ook na uitloggen en opnieuw inloggen. **Aanbeveling** Invalideer briefing-inzichten bij
datamutaties, of herbereken de feitelijke cijfers live en cache alleen de AI-tekst.
Toon de ouderdom expliciet.

#### H3 · Onmogelijke waarden worden zonder vraag geaccepteerd
Een bezitting van **€999.999.999.999** wordt geaccepteerd met de toast "Golf test
toegevoegd". Daarna toont het dashboard "TOTALE WAARDE € 1.000.000.507.699",
"9999 jaar vrijheid" en "Afschrijving −€ 150.000.000.000/jr". Eén typefout maakt elk
inzicht in de app waardeloos zonder dat de gebruiker het merkt. Hetzelfde geldt voor het
onboarding-eindscherm, dat "NETTO VERMOGEN € -2.479.300" zonder commentaar toont.
**Aanbeveling** Soft-warning boven een drempel plus bevestigingsstap; toon de
vrijheidsvertaling al in het formulier als ingebouwde plausibiliteitscheck.

#### H4 · Bedragvelden muteren invoer stilzwijgend
"abc" wordt zonder melding leeggemaakt; "-500" wordt stil "500"; "Verder" werkt
gewoon door. Zo belandde ongemerkt €500 als maanduitgaven in een profiel terwijl het
inkomen leeg bleef. **Aanbeveling** Toon inline wat er niet mocht in plaats van tekens
weg te gooien.

#### H5 · Teruggaan in de wizard toont lege velden
Na "TERUG" zijn eerder ingevulde waarden onzichtbaar. Controleren of corrigeren van wat
er stond is onmogelijk; je moet gokken of opnieuw invoeren.

#### H6 · Er is geen reden om morgen terug te komen
Bij herbezoek in een verse browser is het dashboard identiek: dezelfde
briefing-timestamp, geen "sinds je vorige bezoek"-delta's, de welkomstchecklist blijft
op 0/4 ondanks vijf geregistreerde bezittingen, en de badge "Berichten · 1" leidt naar
"GEEN BERICHTEN". Zonder bankkoppeling verandert er niets vanzelf, en niets herinnert je
eraan om iets te herwaarderen. Het maandelijkse check-in-concept bestaat op `/mijn`, maar
wordt nergens aangeboden. **De app is een prachtige foto, nog geen film.**

#### H7 · De stappenteller telt secties, geen schermen
"2/8" staat op drie opeenvolgende schermen, "3/8" op vijf, "4/8" op acht. Twintig
schermen om sectie 6 van 8 te halen — terwijl het welkomstscherm "een paar korte vragen,
in een paar minuten klaar" belooft.

#### H8 · Acht losse ja/nee-schermen over schulden
Hypotheek, studielening, persoonlijke lening, doorlopend krediet, creditcard, roodstand,
autolening, overig — elk een eigen scherm. De meeste mensen hebben er nul tot twee.
**Aanbeveling** Eén aanvinkraster per domein; het bestaande scherm "Heb je nog andere
bezittingen?" doet dit al goed.

#### H9 · Zeven bijna identieke "DRINGEND"-meldingen, en 100% ≠ overschreden
`/berichten` opent met zeven gestapelde meldingen "X: 100% — over budget · €1280 van
€1280 — budget overschreden". Dat is je budget vól benutten, niet overschrijden.
Alarmmoeheid op dag één.

#### H10 · Import en bankkoppeling zijn niet vindbaar vanuit het menu
Bestandsimport alleen via een knop op de transactiepagina, op de legacy-route
`/core/cash/import`. Bankkoppeling onder `/mijn/koppelingen`. Fin's tip zegt wél steeds
"koppel je bank", maar het menu biedt die taak nergens aan — terwijl dit de
belangrijkste activatietaak is.

#### H11 · Kernjargon zonder uitleg op beslismomenten
"SWR 2.8%", "Interen", "Vermogen opeten", "inclusiepercentage", "PSD2-banken, UPO,
brokerage-sync". Juist waar een keuze gemaakt wordt verlaat de app het vrijheidsframe.

#### H12 · Het dashboard is extreem dicht bezet
Ruim twintig blokken op `/overzicht`, met de welkomstchecklist bovenaan — vóór de
begroeting. De belofte "geen klinisch dashboard, een rustig overzicht" wordt op deze
route visueel niet waargemaakt, terwijl de verdiepingspagina's hem wél nakomen.

#### H13 · Verschillende oppervlakken geven verschillende antwoorden
`/overzicht` en `/toekomst` noemen andere vrijheidsleeftijden; op `/toekomst` staat
"NETTO VERMOGEN € 1.731.640" vijf regels boven "€ 1.619.700 netto vermogen", beide
zonder grondslagvermelding; de Monte-Carlo-widget zegt "99% succeskans" terwijl bij
Marktcheck een badge "4,1%" verschijnt zonder label.

#### H14 · Vrijheidstijd rondt verkeerd af bij twaalf maanden
"€ 498.550 — **10 jaar en 12 maanden** vrijheid". Randgeval waarbij de maanden niet
doortellen naar een jaar.

---

### 🟡 Medium

- **M1 · De welkomstgids weet niet wat de app al weet.** Vraagt "Zijn al je bezittingen
  geregistreerd?" en staat op 0/4 bij een account met 16 bezittingen, 11 schulden,
  33 budgetten en 405 transacties.
- **M2 · Vraag vier blijft onbeantwoord.** De toekomstschermen beantwoorden "kan ik dit?",
  "wanneer?" en deels "wat als?", maar nergens staat *wat moet ik veranderen om mijn doel
  te halen?* Er is geen "om op je 60e vrij te zijn: €X per maand extra". Precies de stap
  van inzicht naar actie ontbreekt op het scherm dat erover gaat.
- **M3 · Afgeleide cijfers zonder zichtbare aanname.** De hypotheekwizard vraagt geen
  looptijd maar toont "€ 1.514 maandlasten" en "23 jr resterend" (30 jaar stilzwijgend
  aangenomen). Belasting toont "Inkomen onbekend" naast "MARGINAAL 35.8%".
- **M4 · Schijnzekerheid in prognoses.** "Vermogen bij vrijheid → € 887.689",
  "DOELBEDRAG € 676.698", "VRIJHEIDSLEEFTIJD 52.8 jaar" — vijftien jaar vooruit, op de
  euro. Er ís een bandbreedtevlak en een disclaimer, maar de kopgetallen dragen geen
  onzekerheid. De welkomstmodal doet het wél goed: "werken wordt een keuze rond je 53e".
- **M5 · Onmogelijke uitkomsten worden als feit gerenderd.** Bij onvolledige data:
  "VRIJHEIDSLEEFTIJD 100.0 jaar", "DOELBEDRAG € -11.328.971", "tekort-lening piek
  € 8.165.154". Vangrails ontbreken in de weergavelaag.
- **M6 · Geen feedback bij een negatieve waarde.** "-8000" in een bezittingformulier:
  geen foutmelding, geen rood veld, geen toast. Niet te onderscheiden van een kapotte knop.
- **M7 · Na verwijderen blijf je op de pagina van het verwijderde item**, zonder undo,
  terwijl de bevestiging belooft "je kunt deze later weer toevoegen".
- **M8 · De Tips-overlay kaapt de pagina.** Een uitleg-laag met backdrop onderschept elke
  klik; sluiten kan alleen via de onzichtbare backdrop.
- **M9 · De diepste verdiepingslaag is niet te openen.** De grafiekvoettekst belooft
  "Klik Details voor jaar-op-jaar tabel", maar de knop viel buiten de viewport en kliks
  werden onderschept. *(Voorbehoud: mogelijk interactie-artefact, handmatig verifiëren.)*
- **M10 · Zijbalk-"APPS" verspringt per pagina.** Crypto holdings en Verhuurrendement
  bestaan maar waren nergens zichtbaar. Je kunt niet leren waar iets woont.
- **M11 · "100% — je bent klaar" naast lege kernvelden.** Het percentage meet "einde
  wizard", niet "profiel compleet".
- **M12 · Twee, soms drie stappentellers tegelijk.** Wizard "3/8" → modal "STAP 1 VAN 2"
  → daarbinnen nog een vraag → "STAP 2 VAN 2".
- **M13 · Weergave-switches zijn onverklaard.** "Persoonlijk" en "Toekomstige euro's"
  bovenin de zijbalk, zonder toelichting en zonder afleesbare stand — bij een app die
  over de interpretatie van bedragen gaat.
- **M14 · Dubbele namen en ingangen.** "Nieuws" (menu) versus "Krant" (paginatitel);
  Rapportages en Account staan zowel in de zijbalk als op `/mijn`.

---

### 🔵 Low

- Taalfouten: "2 bezitten" / "5 bezitten", "Nog een beleggingen?", reekswissel
  "Heb je een creditcardschuld?" → "Nog een creditcard?".
- Engelse breadcrumbs: "Overzicht › Schulden › **Mortgage**", "Overzicht › Vermogen ›
  **Vehicle**".
- Dubbele foutmelding op een scherm met één veld (banner plus inline).
- "verder niets verplichts" boven een veld met een sterretje.
- Het Noodfonds-doel rekent niets voor als de maandlasten onbekend zijn, terwijl de
  andere doelen wél voorstelbedragen hebben.

---

### 🟢 Sterk — behouden en uitbouwen

1. **De gezondheidsscore legt zichzelf volledig uit.** Radar met zes pilaren, expliciete
   formule, per pilaar de waarde en de drempels, plus een actie en "Bespreek met Fin".
   Dit is het niveau van herleidbaarheid dat elders ontbreekt — maak het de standaard.
2. **Rekenschap over de berekening.** "TOON DE REKENKETEN": *7,0% bruto − ~2,0% inflatie
   = ~5,0% reëel − ~2,1% Box 3-heffing = ~2,9% netto reëel.* En op Bezittingen:
   *"16 bezittingen bij elkaar, elk voor zijn volle waarde — je netto vermogen weegt ze
   naar inclusiepercentage en valt daardoor anders uit."* Dat is uitleggen waaróm twee
   getallen verschillen, precies waar de meeste financiële apps zwijgen.
3. **Onzekerheid tonen in plaats van één schijnzeker getal.** Scenario's leggen twee
   lijnen over de grafiek (voorzichtig 4% / optimistisch 8%, "zo zie je hoe gevoelig je
   pad is"); Marktcheck legt uit dat Monte Carlo het plan 200 keer doorrekent; er is een
   P40–P60-band.
4. **Elke onboardingstap legt uit waaróm.** "Met je leeftijd vertaal ik je geld naar jouw
   vrijheid in tijd." "Pensioen is vrijheid die later vanzelf binnenkomt."
5. **Defaults zijn berekend, niet generiek.** "≈ 80% van nu" vulde €24.960 voor — exact
   80% van de ingevoerde uitgaven, mét redenering. "Noodfonds €15.600" = zes keer de
   maandlasten.
6. **Het FEITEN-paneel geeft context mét bron**, gemarkeerd als indicatief, en verandert
   in je eigen totaal zodra je gegevens invoert.
7. **Aanname plus schuifknop plus bron.** De fee-simulator ("0,5% extra beheerkosten kost
   je € 51.091 over 30 jaar — 13% van je eindwaarde"), de samengestelde-rente-slider en
   het koopkrachtblok met instelbare inflatie en CBS-bronvermelding.
8. **Acties dragen hun effect in vrijheidstijd, met prioriteit.** "+132d/jr vrijheid"
   totaal, per actie "★4 Plan Meesman verhoging +45d/jr".
9. **Foutpreventie op profielvelden.** "Naam is verplicht", "Geboortedatum kan niet in de
   toekomst liggen" met geblokkeerde knop, en een nette melding bij dubbele namen.
10. **Het redactionele stramien van de verdiepingspagina's.** Statement-kop in
    vrijheidstaal, vier KPI's mét tijd-equivalent, genummerde secties, breadcrumb,
    uitklapbare uitleg. Dít is de maat waar het dashboard naartoe moet.
11. **De her-inlogmodal bewaart context.** "Je gegevens zijn veilig. Na het opnieuw
    inloggen ga je verder waar je gebleven was."
12. **Overal een uitweg in de onboarding**, plus een bevestigingsscherm "Dit zijn je
    bezittingen — klopt het?"

---

## Data → Informatie → Inzicht → Actie

| Onderdeel | Positie | Toelichting |
|---|---|---|
| Gezondheidsscore + onderverdeling | **Actie** | Score, pilaren, drempels én een actie per pilaar |
| Fee-simulator (Bezittingen) | **Actie** | Maakt een abstractie voelbaar en wijst een keuze aan |
| Acties / Tips | **Actie** | Effect in vrijheidsdagen plus prioriteit |
| Bezittingen-overzicht | **Inzicht** | Totaal, rendement, tijd-equivalent, uitleg over grondslag |
| Belastingpagina | **Inzicht** | "€ 79.658 = 1 jaar en 4 maanden per jaar" |
| Cashflow-maandblok | **Inzicht** | "+€ 1.772 · +14d vrijheid" |
| Briefing | **Informatie** | Specifiek en gekwantificeerd, maar spreekt de rest tegen (H2) |
| Toekomst / tijdas | **Informatie** | Toont wanneer, niet wat je moet veranderen (M2) |
| Budgetten-heatmap | **Informatie** | Percentages zonder duiding wat te doen |
| Welkomstchecklist | **Data** | Statisch, weet niet wat de app al weet |
| Berichten | **Data** | Zeven identieke meldingen, geen prioritering |

---

## Scores

| Dimensie | Score | Grond |
|---|---|---|
| Waardepropositie | **8** | "Geld is opgeslagen tijd" is onderscheidend en wordt consequent doorgevoerd |
| First impression | **7** | Sterke landingspagina; drie concurrerende call-to-actions boven de vouw |
| Onboarding | **6** | Uitstekend vakmanschap per scherm, maar twintig schermen en verliesrisico |
| Time-to-value | **3** | Geen enkel vrijheidsgetal tijdens de onboarding; de publieke funnel doet het beter |
| Gebruiksgemak beginner | **7** | Rustige wizard, één vraag per scherm, overal een uitweg |
| Informatiearchitectuur | **7** | Heldere driedeling, maar legacy-routes en dubbele ingangen |
| Navigatie | **6** | Import en koppelen onvindbaar; menu-inhoud verspringt per pagina |
| Begrijpelijkheid | **6** | Sterk frame, ondermijnd door jargon en een omgekeerd lezend label |
| Visualisatie | **7** | Goede grafieken met bandbreedte; heatmap zonder duiding |
| Inzicht | **7** | Fee-simulator en gezondheidsonderverdeling zijn echt inzicht |
| Grip | **5** | Acties dragen hun effect, maar "wat moet ik veranderen" ontbreekt |
| Ondersteuning bij keuzes | **5** | Wel de prijs van een keuze, niet de weg naar een doel |
| Toekomstwaarde | **5** | Rijk instrumentarium, maar het kernantwoord wisselt per laadbeurt |
| Progressive disclosure | **7** | Voorbeeldige gelaagdheid; diepste laag onbereikbaar |
| Terugkerende waarde | **4** | Geen delta's, dode checklist, lege berichten achter een badge |
| Power-userfunctionaliteit | **6** | Aannames zichtbaar en deels instelbaar; jaar-tabel niet bereikt |
| Personalisatie | **4** | Defaults zijn berekend, maar de checklist negeert bestaande data |
| Customization | **6** | Instrumenten aanwezig; weergavekeuze bleek cross-device bewaard |
| Vertrouwen | **5** | Uitstekende uitleglagen, ondermijnd door tegenstrijdige getallen |
| Foutafhandeling | **5** | Voorbeeldig op profielvelden, afwezig op bedragvelden |
| Mobiele UX | **n.v.t.** | Niet getest — een cijfer zou een gok zijn |
| **Totale gebruikerservaring** | **6** | |

### Hoofdscore op de kernbelofte

> "De vrijheid om met inzicht en grip keuzes te maken voor nu en later."

## **5,5 / 10**

Onderbouwing per deel. **Inzicht: ruim voldoende.** De app laat zien wat er gebeurt en
legt uit waarom — de gezondheidsonderverdeling, de rekenketen en de fee-simulator zijn
beter dan gebruikelijk in deze categorie. **Grip: onvoldoende.** Je ziet wat er is en wat
iets kost, maar niet wat je moet veranderen om je doel te halen; het scherm dat daarover
gaat beantwoordt die vraag niet. **Keuzes voor nu: voldoende.** Cashflow, budgetten en
acties leiden tot concrete handelingen. **Keuzes voor later: onvoldoende**, en dat is
beslissend — een projectie die per laadbeurt veertien jaar verschilt kan geen keuze
dragen, hoe goed de omliggende uitleg ook is.

De score wordt dus niet gedrukt door gebrek aan functionaliteit of doordacht ontwerp.
Hij wordt gedrukt doordat het fundament onder het onderscheidende deel — het getal dat
zegt wanneer je vrij bent — op dit moment niet betrouwbaar is.

---

## Prioriteiten

### Top 5 belangrijkste problemen
1. Het kernantwoord verschilt per laadbeurt (C1)
2. Onboarding-invoer gaat verloren en de foutmelding liegt erover (C3)
3. Het label van de vrijheids-delta leest omgekeerd (C2)
4. Er is geen reden om terug te komen (H6)
5. De briefing spreekt de rest van het dashboard tegen (H2)

### Top 5 quick wins
1. **"+2,4 jaar vrijheid" → "→ 2,4 jaar later vrij"** — tekstwijziging, herstelt de
   leesbaarheid van de kernmetric (C2)
2. **Vangrail op het rendementspercentage** — boven 100% is geen getal maar een fout (H1)
3. **"Verder" altijd zichtbaar houden in de funnel, "Overslaan" secundair** (C4)
4. **Afronding twaalf maanden → jaar** in de vrijheidstijd-formatter (H14)
5. **De acht schuldvragen vervangen door één aanvinkraster** — het patroon bestaat al
   op het bezittingenscherm (H8)

### Top 5 structurele verbeteringen
1. Eén canonieke databundel per request, zodat alle oppervlakken hetzelfde antwoord geven
   (C1, H13)
2. Onboarding-concept server-side per sectie opslaan, met eerlijk herstel (C3)
3. Een vrijheidsteller tijdens de onboarding, zoals de publieke funnel die al heeft —
   time-to-value van "nooit" naar "scherm 4" (H7, score 3)
4. Een terugkeerlaag: delta's sinds het vorige bezoek, een levende checklist, en het
   bestaande maandelijkse check-in-ritueel actief aanbieden (H6, M1)
5. Het omgekeerde antwoord toevoegen: "om op je 60e vrij te zijn heb je €X per maand
   extra nodig" (M2)

### Top 5 sterke onderdelen om te behouden
1. De gezondheidsscore die zichzelf volledig uitlegt
2. De rekenketen en de uitleg waarom netto vermogen afwijkt van de som
3. Berekende defaults en het FEITEN-paneel met bronvermelding
4. De fee-simulator en het koopkrachtblok: aanname, schuifknop, bron
5. Het redactionele stramien van de verdiepingspagina's

---

## Roadmap

**Nu** — herstel het fundament onder het onderscheidende deel.
C1 (determinisme), H1 (rendementspercentage), C2 (label vrijheids-delta), H14 (afronding),
C4 (funnelknop). Vier van deze vijf zijn tekst-, teken- of vangrailkwesties.

**Vervolgens** — maak de eerste sessie en de terugkeer waardevol.
C3 (server-side concept), time-to-value in de onboarding, H7 en H8 (tellerlogica en het
aanvinkraster), H2 (briefing-invalidatie), H6 en M1 (delta's en een levende checklist),
H3 en H4 (plausibiliteit en invoerfeedback).

**Later** — verdiep en ruim op.
M2 (het omgekeerde antwoord), H10 (import en koppelen in de navigatie), H11 en de
terminologie, H12 (dashboarddichtheid terugbrengen naar het stramien van de
verdiepingspagina's), M13 (weergave-switches uitleggen), en de openstaande mobiele test.

---

## Eén observatie tot slot

Het valt op dat de kwaliteit toeneemt naarmate je dieper in de app komt. De landingspagina
is goed, de onboarding is mooi maar te lang en levert niets op, het dashboard is
overvol — en dan worden de verdiepingspagina's opeens uitstekend. Dat is precies andersom
dan gebruikelijk, en het is een kans: het moeilijke werk is al gedaan. De eerste twintig
minuten van een nieuwe gebruiker doen het product op dit moment tekort.
