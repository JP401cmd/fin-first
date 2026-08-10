# Horizon — bracketing-ontwerp (V_op / V_nodig)

> **Herkomst.** Dit document is op 9 augustus 2026 geëxporteerd uit de Notion-kaart
> *"De horizon"* (aangemaakt 14 april 2026, laatst bewerkt 11 mei 2026) voordat die
> kaart uit de werkqueue werd gesloten. Het is de **oorspronkelijke ontwerpbeschrijving**
> van de bracketing-aanpak die aan de horizon-kernel ten grondslag ligt.
>
> **Status: historisch ontwerpdocument, geen actuele specificatie.** De kernel is
> inmiddels gebouwd (`lib/horizon-kernel/**`, ADR's 0013–0017); waar dit document en
> de code uiteenlopen, is de code leidend. Bewaard omdat het de *redenering* vastlegt —
> waaróm bracketing, waarom per-asset, waarom een vaste rekenvolgorde — en die
> redenering staat nergens anders zo compleet.

## Context

Er waren twee manieren om de Horizon-grafiek te berekenen: de methode op de
Horizon-pagina zelf, en een tijdelijke methode op `/horizon/doorrekening-test/opbouw`.
Doel van vervanging: meer **transparantie** in de opbouw-, tussen- en afbouwfase — met
instellingen was lastig te zien wat er precies gebeurde.

## Doel van dit document

Een gestructureerde beschrijving van een **vermogensprojectie op basis van bestaande
data**, inclusief de fasering (opbouw → tussenfase → onttrekking), welke
inputs/instellingen impact hebben, en hoe levensgebeurtenissen en interventies het
verloop beïnvloeden.

---

## Basisverloop vermogensprojectie

### 1) Opbouwfase

Netto vermogen laten groeien door sparen en rendement, gecorrigeerd voor kosten en
schuldpositie.

- **Spaargeld opbouwen** — spaarquote op basis van geschat jaarinkomen
- **Rendement op vermogen** — per bezitting doorgerekend
- **Kosten** — Box 3-belastingdruk, nu en in de toekomst, op basis van type bezitting
  en hoeveelheid netto vermogen
- **Aflossing schulden** — model was nog onduidelijk. Workaround destijds: aflossing bij
  de spaarquote optellen. *Dat klopt niet* — zie §Schulden in projectie.

### 2) Tussenfase

De overgangslogica tussen opbouw en onttrekking, afhankelijk van het moment van
financiële vrijheid versus AOW.

- **Vrijheid vóór AOW** — alles uit de opbouw, maar spaargeld wordt vervangen door
  onttrekking (levensgeld), gebaseerd op de verwachte uitgaven na pensioen
- **Vrijheid ná AOW** — doorwerken tot de middelen de ingestelde levensstandaard dekken;
  stoppen op AOW met scenario's als minder uitgeven of eerder overlijden

### 3) Onttrekkingsfase

Vanaf AOW-leeftijd. Rendement loopt door op krimpend vermogen. Onttrekking komt uit
vermogen, aangevuld met AOW en aanvullend pensioen.

---

## Impact op het verloop

### Levensgebeurtenissen

Eenmalige, tijdelijke of continue **injecties** of **extracties**. Twee dimensies doen
ertoe: waar instroom wordt bijgeschreven, en waaruit uitstroom wordt gehaald.

| Gebeurtenis | Indicatieve bandbreedte |
|---|---|
| Kinderen | €100K–€200K totaal (NIBUD 0–18 jr) |
| Trouwerij | €15K–€25K eenmalig |
| Overlijden partner | inkomensafhankelijk (alleen huishouden-modus) |
| Scheiding | €20K–€200K+ |
| Begrafenis / uitvaart | €7K–€15K |
| Verbouwing | €10K–€80K |
| Huis kopen | €15K–€40K k.k. + hypotheeklast |
| Huis verkopen | overwaardevrijval + maandlastenverschil |
| Verhuizing | €3K–€10K + maandlastenverschil |
| Sabbatical | €15K–€25K |
| Carrière-switch | €5K–€30K (gap → overgang → nieuw) |
| Part-time werken | €500–€1.500/mnd inkomensverlies |
| Bijverdienste | +€300–€1.500/mnd |
| Werkloosheid / ontslag | €2K–€3,5K/mnd gat + WW + transitievergoeding |
| Vervroegd pensioen | €50K–€200K overbrugging |
| AOW | +€1.072–€1.558/mnd netto (default vanaf 67) |
| Aanvullend pensioen | +€200–€2.000/mnd bruto |
| Auto kopen | €15K–€50K + ~€350/mnd |
| Erfenis | €10K–€500K+ (incl. erfbelasting per relatie) |
| Schenking | €1K–€200K+ (vrijstellingen 2026) |
| Wereldreis | €25K–€60K (3 reisstijlen) |
| Studie | €1K–€30K (cursus → MBA) |
| Custom | vrij in te vullen |

### Interventies (destijds nog niet gebouwd)

Bijvoorbeeld: procentueel af laten nemen van de uitgaven na pensioen na leeftijd 75.

---

## Instellingen die impact hebben

### Eindstrategie

1. Opmaken van vermogen op leeftijd X
2. Nalaten van vermogen op leeftijd X
3. Behouden van vermogen (app rekent tot 100 jaar)
4. Doorwerken tot pensioenleeftijd (geen cap op eindstatus, wel op doorwerkleeftijd)

### Onttrekkingsstrategie

- **Vast (SWR)** — 4%-regel, jaarlijks geïndexeerd. Voorspelbaar en beproefd, maar past
  zich niet aan bij slechte markten.
- **Guardrails (Guyton-Klinger)** — corridor floor 80% / ceiling 120%, raise- en cutstep
  10%. Beschermt tegen dalingen, maar inkomen varieert.
- **VPW** — jaarlijks dynamisch percentage op resterende levensverwachting. Wiskundig
  optimaal, maar grote inkomensvariatie.
- **Bucket** — drie emmers (cash 15%, obligaties 30% @ 3%, rest aandelen) met 3 jaar
  cash-buffer. Dempt sequence-of-returns-risk ten koste van totaalrendement.

### Onttrekkingsvolgorde

`cash_first` · `low_return_first` · `own_home_last` · `pro_rata` (proportional) ·
`highest_value_first`

### Verdeling bij instroom

`proportional` · `cash_first` · `lowest_return` · `highest_return`

### Verdeling bij uitstroom

`proportional` · `cash_first` · `lowest_return_first`

---

## De USP

> Eén grafiek die alles bindt: een eerlijke projectie de toekomst in.

---

## Oplossingsrichting — bracketing met twee lijnen

> Conclusie uit een ontwerpgesprek, 11 mei 2026. Eén engine die alle instellingen,
> levensgebeurtenissen, onttrekkings- en eindstrategieën consistent verwerkt in een
> transparante, auditable projectie.

De FIRE-leeftijd is het **kruispunt van twee functies van leeftijd `t`**. Dat vervangt de
statische 25× SWR-vuistregel door een berekening die álle inputs respecteert.

**Opbouwlijn V_op(t)** — netto vermogen op leeftijd `t`, forward-gesimuleerd per asset:

```
V_i(t+1) = V_i(t) × (1 + r_i) + instroom_i(t) − uitstroom_i(t) − kosten_i(t)
V_op(t)  = Σ_i V_i(t)
Netto(t) = V_op(t) − Σ schulden(t)
```

**Vrijheidslijn V_nodig(t)** — vermogen dat op leeftijd `t` nodig is om tot eindleeftijd
`D` zonder werken rond te komen. Backward-iteratie vanaf `D`:

```
V_nodig(D) = eindstrategie-residu   (0 bij opmaken, Y bij nalaten, huidig reëel bij behouden)
V_nodig(t) = [V_nodig(t+1) + uitgaven_post(t) − inkomen_post(t)
              + belasting_post(t) − events_post(t)] / (1 + r_onttrek(t))
r_onttrek(t) = Σ_i w_i(t) × r_i     (gewogen rendement, optionele glide path)
```

**FIRE-leeftijd t\*** = de eerste `t` waarvoor `V_op(t) ≥ V_nodig(t)`.

### Wat dit oplost

- Levensgebeurtenissen, onttrekkingsstrategie en eindstrategie hebben *aantoonbaar*
  effect (op V_op, V_nodig of beide) in plaats van impliciet
- AOW en aanvullend pensioen worden inkomensstromen die V_nodig structureel verlagen —
  niet langer eenmalige "events"
- De aflossing-workaround verdwijnt: aflossen is een cashflow-shift binnen de balans,
  geen vermogensgroei
- Twijfel aan de waarheid wordt ondervangen door per-cel auditability

### Waar elke instelling aangrijpt

**Alleen V_op:** spaarquote, inkomen, salarisgroei, rendement opbouwfase, asset-allocatie
nu, aflossingstempo (via cashflow), Box 3 in de opbouwfase, events vóór t\*,
instroom-allocatie.

**Alleen V_nodig:** uitgaven na pensioen + fasering (actief/slow/late), AOW-leeftijd en
-bedrag, aanvullend pensioen, events ná t\*, onttrekkingsstrategie en -volgorde,
eindstrategie, eindleeftijd, rendement onttrekkingsfase.

**Beide:** inflatie, belastingregime (Box 3 2026 → 2028), levensstandaard, hypotheek die
over de FIRE-grens loopt.

---

## Per-asset modellering is fundament

Elke bezitting heeft eigen rendement (cash 0–3%, obligaties 3–4%, aandelen 5–7% reëel,
vastgoed 0–2% reëel, BV variabel), eigen belastingbehandeling, eigen liquiditeit, eigen
rol in de instroom-/onttrekkingsvolgorde en eigen kosten (TER, onderhoud,
hypotheekrente). Aggregeren met één `r` is te grof.

**Rebalancing-aannames moeten expliciet zijn** (jaarlijks naar doel / drift binnen band /
vrije drift). Zonder rebalancing drift een 60/40-portefeuille over 30 jaar naar ~85/15 —
een fundamenteel ander risicoprofiel dan ingesteld.

---

## Tabel-architectuur

Tabellen verslaan formules op auditability, mentaal model, schaalbaarheid en
transparantie. De wiskunde verdwijnt niet — elke cel ís een formule — maar de structuur
wordt zichtbaar.

| Tabel | Doel | Rijen | Kolommen (kern) |
|---|---|---|---|
| A — Master cashflow | Jaarlijkse cashflow | Per jaar | Inkomen-werk, AOW, pensioen, overig; uitgaven vast/var/woon; belasting; events-netto; cashflow-netto |
| B — Balans per asset | Hoofd-projectiebron | Per jaar | Per asset (cash, aandelen, obligaties, BV, huis, pensioenpot); schulden; netto-vermogen; **V_op**; **V_nodig**; **V_op ≥ V_nodig** |
| C — Asset-bewegingen | Audit | Per jaar × asset | Begin; rendement; instroom; uitstroom; kosten; eind |
| D — Belasting detail | Belastingboekhouding | Per jaar | Box 1-inkomen + schijven; Box 3-grondslag per categorie + regime; HRA; eigenwoningforfait; dividendbelasting; totaal |
| E — V_nodig backward | Bracketing-tegenhanger | Per leeftijd (D → nu) | Uitgaven_post; inkomen_post; r_onttrek; V_nodig(t+1); V_nodig(t) |
| F — Levensgebeurtenissen | Event-bron | Per event | Naam; type; leeftijd start/eind; bedrag; frequentie; doel-asset in/uit; inflatie-gekoppeld |
| G — Onttrekkingsbreakdown | Detail vanaf t\* | Per jaar onttrekkingsfase | Behoefte; onttrekking per assetklasse; restant onbedekt |

Het **kruispunt** is drie kolommen op tabel B (`V_op_totaal`, `V_nodig`,
`V_op ≥ V_nodig`). De eerste rij met "ja" is `t*`.

---

## Acyclische rekenvolgorde per jaar

Vaste volgorde, streng aanhouden om circulaire afhankelijkheden te vermijden:

1. Rendement op begin-assets
2. Inkomen (werk + AOW + pensioen + dividend + huur)
3. Belasting (Box 1 + Box 3 + HRA)
4. Uitgaven (vast + variabel + woonkosten)
5. Events instroom/uitstroom
6. Cashflow-allocatie naar eind-assets (volgens instroom-strategie)
7. Eindbalans → start volgend jaar

---

## Inflatie-framework

Intern **nominaal** rekenen (matcht fiscale parameters, pensioenuitkeringen en
hypotheekschuld die nominaal vastligt). In de UI standaard **reëel** tonen (koopkracht
2026) met een toggle. Eén centrale deflator/inflator — geen verspreide correcties.

**Wel inflateren:** uitgaven (CPI ~2%), salaris (looninflatie), huizenprijs (voorzichtig),
AOW (CPI-gekoppeld), aanvullend pensioen (indexatie-afhankelijk), Box 3-vrijstellingen,
erfbelastingvrijstellingen.

**Niet inflateren:** hypotheekschuld — die ligt nominaal vast en erodeert reëel. Dat is
een echt effect dat zichtbaar moet zijn.

---

## Onttrekkingsstrategieën per geval

- **SWR** — backward-iteratie direct
- **VPW** — fixed point: bisectie op het startvermogen waarbij het VPW-pad de
  doel-uitgaven dekt
- **Guardrails** — centrale baseline-SWR voor V_nodig, banden tonen als variabiliteit;
  of de conservatieve floor (80%) als veilige V_nodig
- **Bucket** — per emmer een sub-projectie, of een proxy met gewogen rendement

**Aanbeveling voor v1:** alle strategieën gaan uit van de SWR-baseline voor V_nodig.
Anders verschuift `t*` per strategie en wordt het verwarrend. De strategie is een
verfijning op het kruispunt, niet de bron ervan.

---

## Eindstrategieën als randvoorwaarde op V_nodig(D)

| Strategie | Randvoorwaarde | Gevolg |
|---|---|---|
| Opmaken op X | `V_nodig(X) = 0`, daarna geen V_nodig | FIRE komt vroeger |
| Nalaten Y op X | `V_nodig(D) = Y` | FIRE later |
| Behouden | `V_nodig(D) = huidig reëel vermogen` (of cap op 100) | — |
| Doorwerken tot pensioen | geen FIRE-zoektocht; V_nodig start bij AOW | Visualiseert overschot/tekort = pensioenopbouwer-view |

Eén engine, vier doelfuncties via één parameter.

---

## Eigen huis

Twee componenten expliciet splitsen:

- **Huis als asset** — waarde × (1 + huizenprijsindex)^t; hypotheekschuld negatief.
  ~0–2% reëel.
- **Huis als kostenpost** — hypotheekrente + aflossing + onderhoud (~1% van de waarde) +
  OZB + opstal, in de uitgaven (tabel A).

Vier scenario's voor de onttrekkingsfase, expliciet door de gebruiker gekozen:

1. **Huis houden** — woonlasten lopen door (na aflossing veel lager); huis blijft buiten
   de onttrekking. Past bij "nalaten" of "behouden".
2. **Verkopen + huren** — overwaarde springt naar liquide vermogen, huurkosten komen
   erbij (regio-default ~€1.200–€1.800/mnd). Vaak een wash of negatief op middellange
   termijn, maar geeft cashflow-flexibiliteit.
3. **Verkopen + downsizen** — overwaarde minus aanschafkosten kleinere woning komt vrij;
   lagere onderhoudskosten daarna.
4. **Opeethypotheek / verzilverlening** — als onttrekkingsbron in de strategie.

**Woonkosten zijn verplicht onderdeel van de uitgaven na pensioen** — afhankelijk van de
scenario-keuze, niet impliciet. HRA vervalt 30 jaar na de eerste hypotheek; die sprong in
de cashflow moet expliciet gemodelleerd worden.

---

## Schulden in de projectie

Een schuld heeft drie componenten:

- **Hoofdsom** — negatief vermogen, daalt door aflossing
- **Rente** — echte uitgave, verlaagt netto vermogen via cashflow
- **Aflossing** — verschuiving cash → schuld; netto vermogen onveranderd op het moment
  van aflossen

**De workaround "aflossing optellen bij de spaarquote" is FOUT** — die verdubbelt het
effect. In een schone boekhouding rolt de vrijval na aflossing automatisch uit de
cashflow naar de instroom-assets via de instroom-allocatie. HRA hoort expliciet als
negatieve belasting in de cashflow.

---

## Risico's en mitigaties

- **Performance** — jaarlijks rekenen voor de hoofdview (genoeg voor 30+ jaar),
  maandelijks alleen voor cashflow-detail van het lopende en komende jaar. Memoïseren bij
  ongewijzigde inputs.
- **Circulaire afhankelijkheden** — de vaste rekenvolgorde hierboven streng handhaven.
- **Mobiele weergave** — per tabel een samenvattingsmodus (3–4 kolommen) plus een
  detailmodus, met inklapbare groepen.

---

## Implementatie-volgorde (zoals destijds voorgesteld)

1. **Inflatie-framework vastpinnen** — eerst, anders moet alles later gepatcht
2. **V_op-engine per asset** — schone forward-sim met cashflow + balans
3. **V_nodig-engine met SWR** — backward-iteratie; eerste werkende bracketing
4. **Visualisatie twee lijnen + kruispunt** — de USP-grafiek, eerste echte validatiemoment
5. **Eindstrategieën** — parameter op V_nodig(D)
6. **Post-FIRE events** — uitbreiding op V_nodig (tabel F voedt E)
7. **Overige onttrekkingsstrategieën** — pas als de SWR-baseline solide is
8. **Glide path + rebalancing-instellingen** — verfijning

**Tweesporen-resolutie:** `/horizon` wordt een samenvattingsweergave van dezelfde
onderliggende tabellen — geen tweede berekening. Eén engine, twee weergavedichtheden.

---

## Openstaande inhoudelijke vragen (uit het origineel)

- Volstaat deze beschrijving om een projectielijn en vermogensverdeling te krijgen die
  zowel de FIRE-leeftijd (fire hunter) als het pensioengat (pensioenopbouwer) laat zien?
- Kunnen eind- en onttrekkingsstrategieën volledig in de projectie verwerkt worden?
- Wat mist er aan interventies om echt grip te krijgen?
- Wat te doen met het eigen huis als vermogen — verkopen geeft kapitaal, maar er is dan
  ook meer geld nodig om te leven. En met een nog niet afgeloste hypotheek bij de uitgaven
  na pensioen? Wonen is een noodzaak.
- Zijn alle getallen gecontroleerd en onderhevig aan inflatie?
- Wat te doen met aflossing en rentekosten in de vermogensprojectie?

## Inventarisatie-checklist

Bruikbaar bij een review van de huidige implementatie:

- [ ] Werkt de simulatie per-asset of op aggregaat?
- [ ] Is rebalancing expliciet of impliciet?
- [ ] Is V_nodig backward-berekend of een statische multiplier?
- [ ] Welke instellingen raken alleen V_op, alleen V_nodig, of beide? Klopt dat met de
      tabel hierboven?
- [ ] Is aflossing een cashflow-shift of opgeteld bij de spaarquote?
- [ ] Is HRA expliciet, inclusief de 30-jaar-vervaldatum?
- [ ] Is inflatie consistent toegepast — één framework — of verspreid?
- [ ] Wordt de regimewissel Box 3 2026 → 2028 ondersteund?
- [ ] Zijn AOW en aanvullend pensioen events of inkomensstromen?
- [ ] Is de rekenvolgorde per jaar acyclisch en vastgelegd?
- [ ] Welke van de 7 tabellen bestaan al, welke ontbreken?
- [ ] Is het eigen huis als asset én als kostenpost gemodelleerd?
- [ ] Worden eindstrategieën als randvoorwaarde of als aparte berekening verwerkt?
