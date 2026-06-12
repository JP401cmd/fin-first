# Herontwerp gezondheidsgetal — voorstel v2 (4 pijlers, 8 indicatoren)

> Status: **voorstel** — nog niet geïmplementeerd. Gebaseerd op marktonderzoek
> (FHN FinHealth Score, CFPB Financial Well-Being Scale, UNSGSA, Deloitte/Nibud
> "Financiële gezondheid van Nederlandse huishoudens", Nibud buffernormen),
> juni 2026. Huidige implementatie: `lib/financial-health.ts` +
> `lib/health-score-input.ts` (canoniek sinds ADR 0008).

## Waarom herontwerpen

De huidige score heeft 7 vlakke pijlers met handmatige gewichten
(eff. 23/18/14/18/9/9/9). Bevindingen uit het marktonderzoek:

1. **Geen enkel toonaangevend framework gebruikt vaste handmatige gewichten.**
   FHN middelt 8 indicatoren gelijk; CFPB gebruikt IRT en noemt a-priori-
   gewichten psychometrisch zwak; FHN 2016 stelt expliciet dat weging
   persoonsafhankelijk hoort te zijn.
2. **Diversificatie en belasting-optimalisatie zijn in géén framework een
   component** (samen toch 18% van onze score), en staan bovendien vaak op een
   neutrale dummy (tax = 50 zonder Box 3-data; diversificatie = puur het
   áántal asset-typen).
3. **Vermogens-stock telt dubbel**: schuldratio (debt/assets), FIRE-voortgang
   en diversificatie zijn alle drie vermogensmetrics (samen 45%), terwijl de
   standaarden het zwaartepunt op stuurbaar gedrag en buffers leggen.
4. **Schuldratio meet de verkeerde vraag**: debt-to-assets straft een gezonde
   starter met hypotheek; de standaarden meten draagbaarheid via
   debt-service-to-income (FHN: groen < 36%, geel 36–43%, rood > 43%).
5. **Ontbrekende indicator**: "rekeningen/vaste lasten op tijd betalen"
   (FHN #2, Deloitte-domein Uitgaven) — internationaal de sterkste
   stress-voorspeller; wij hebben de transactiedata al.
6. **Neutrale-score-lekkage**: tax zonder data = 50 en geen budgetten = 70
   trekken actief aan de totaalscore. Beter: indicator inactief + gewicht
   herverdelen (mechanisme `getRedistributedWeightForSet` bestaat al).

## Voorgestelde structuur

FHN-model: één totaalscore + vier pijler-subscores, elk met 1–3 indicatoren.
Past direct op het kassabon-patroon (pijler = kassabon-regel, indicator =
sub-regel).

| Pijler | Indicator | Gewicht | Data | Fase |
|---|---|---:|---|---|
| **Rondkomen** (35%) | Spaarquote | 20% | bestaand (`savingsRate6m`) | 1 |
| | Budgetdiscipline | 10% | bestaand (`budgetCategories`) | 1 |
| | Vaste lasten op tijd | 5% | nieuw: transactie-detectie | 2 |
| **Buffer** (20%) | Noodfonds | 20% | bestaand (`emergencyFundMonths`) | 1 |
| **Schuld** (20%) | Schuldenlast t.o.v. inkomen | 12% | nieuw: Σ `monthly_payment` ÷ netto maandinkomen (`income6m`/6) | 1 |
| | Schuldratio (debt/assets) | 8% | bestaand | 1 |
| **Vrijheid** (25%) | FIRE-voortgang | 18% | bestaand (`freedomPct`, ADR 0009) | 1 |
| | Vermogensconcentratie | 7% | nieuw: grootste asset-type als % van totaal | 1 |

Som = 100%. **Belasting-optimalisatie verdwijnt uit de score** en wordt een
"kans"-inzicht (tip in de kassabon / aandachtspunt), want het is een
efficiëntie-metric, geen gezondheidsmetric.

### Score-curves

- **Spaarquote** — behouden: 0→0, 10%→50, 20%→80, 30%+→100.
  (10% = Nibud-spaarnorm → middenscore is verdedigbaar.)
- **Budgetdiscipline** — behouden (% categorieën binnen limiet), maar
  **geen budgetten → indicator inactief** (gewicht herverdeeld binnen pijler)
  in plaats van neutraal 70.
- **Vaste lasten op tijd** (fase 2) — % maanden in afgelopen 6 mnd zonder
  storno/roodstand-signaal: 6/6 = 100, lineair omlaag, ≤3/6 = 0.
  Detectie via `bank_code`/transactiepatronen; vereist eigen ontwerprondje.
- **Noodfonds** — curve behouden (0→0, 3 mnd→60, 6 mnd→100; spoort met
  FHN-tiering en Deloitte 6-mnd-norm). Fase 2: persoonlijke drempel à la
  Nibud BufferBerekenaar (huur/koop, gezinssamenstelling, auto).
- **Schuldenlast t.o.v. inkomen** (nieuw) — piecewise op FHN-drempels:
  ≤20% → 100, 20–36% → 100→70, 36–43% → 70→40, 43–60% → 40→0, ≥60% → 0.
  Hypotheek telt mee in de servicing (geen aparte 28%-subregel in v2).
  Geen schulden = 100; schulden zonder bekend inkomen → indicator inactief.
- **Schuldratio** — curve behouden (1 − debt/assets), gewicht omlaag naar 8%:
  blijft relevant voor de FIRE-doelgroep als balans-metric.
- **FIRE-voortgang** — behouden (freedomPct, gecapt op 100).
- **Vermogensconcentratie** (vervangt diversificatie-count) —
  grootste asset-type als aandeel van totaal vermogen **exclusief eigen
  woning**: ≤40% → 100, 40–70% → lineair 100→40, ≥90% → 0.
  Eén-type-vermogen < €10k → indicator inactief (concentratie is dan geen
  zinvol signaal voor een starter).

### No-data-beleid (overal consistent)

Een indicator zonder betekenisvolle data is **inactief**: gewicht wordt
proportioneel herverdeeld binnen de pijler (en bij een lege pijler over de
overige pijlers), via het bestaande `getRedistributedWeightForSet`-mechanisme.
Geen neutrale dummies (50/70) meer. Module-gating
(`PILLAR_MODULE_REQUIREMENTS`) blijft per indicator werken.

## Compatibiliteit & migratie

- **Eén plek**: dankzij ADR 0008 raakt dit alleen `financial-health.ts` +
  `health-score-input.ts` (+ input-uitbreiding: `debtMonthlyPayments`,
  `netMonthlyIncome`, `largestAssetTypeShare`); loader en alle drie
  snapshot-routes volgen automatisch.
- **Trendlijn**: `resilience_score`-historie blijft staan; de methodewissel
  geeft een niveausprong in de trend. Voorstel: `score_version`-veld (1|2) in
  `net_worth_snapshots` meeschrijven en de sprong in de UI markeren
  ("methode aangepast").
- **ADR**: nieuw ADR 0010 "Gezondheidsgetal v2 — vier gedragspijlers"
  (vervangt de 7-vlakke-pijlers-aanpak, verwijst naar dit document).
- **Berekeningen-view**: `lib/architecture/calculations.ts` bijwerken
  (inputs/outputs/formula/constants van de health-score-motor).
- **Tests**: `lib/financial-health.test.ts` herschrijven op de nieuwe
  structuur; regressiesuite `wil-gezondheid` + `health-score-receipt.test.tsx`
  bijwerken; nieuwe unit-tests voor DSTI- en concentratie-curves.
- **UI**: kassabon-receipt (`health-score-receipt.tsx`) toont 4 pijlers met
  indicator-subregels; tips/CTA's per indicator blijven (PILLAR_ACTION-map
  uitbreiden). Belasting-tip verhuist naar aandachtspunten.

## Empirische status (eerlijke claim)

De methode is **niet als geheel empirisch gevalideerd** — dat geldt voor géén
enkele objectieve composietscore in de markt:

- **Wel onderbouwd:** de indicator-keuze (FHN Pulse-onderzoek: betaalgedrag en
  buffer zijn de sterkste stress-voorspellers), de drempels (DTI 36/43% uit
  hypotheek-acceptatiepraktijk; 6-mnd-buffer bevestigd door FHN én
  Deloitte/Nibud; Nibud-normen uit NL-budgetonderzoek).
- **Niet onderbouwd:** de pijler-/indicatorgewichten (35/20/20/25) — een
  beredeneerde designkeuze, geen gevalideerde weging. FHN middelt daarom
  gelijk; CFPB valideert alleen subjectieve vragenlijsten (IRT);
  Deloitte/Nibud publiceert bewust tiers i.p.v. een gewogen getal.
- **Versterkingsopties:** (1) pijler-subscores prominenter tonen dan het
  totaal, (2) gelijk wegen binnen pijlers (FHN-stijl), (3) op termijn intern
  valideren: toetsen of de score bufferuitputting/budgetoverschrijding/
  roodstand in de eigen gebruikersdata voorspelt en gewichten daarop
  kalibreren.

## Fasering

- **Fase 1 (dit voorstel):** herstructurering naar 4 pijlers / 7 actieve
  indicatoren, DSTI-indicator, concentratie i.p.v. type-count, tax uit de
  score, no-data-herverdeling, score_version=2.
- **Fase 2:** vaste-lasten-betaalgedrag-indicator (transactie-detectie) en
  persoonlijke Nibud-bufferdrempel.
- **Bewust niet:** subjectieve well-being-vragen (CFPB/UNSGSA-dimensie) —
  past niet bij het objectieve, data-gedreven karakter van het getal; kan
  later als losse check-in-vraag, buiten de score.

## Bronnen

- FHN FinHealth Score-methodologie — finhealthnetwork.org/tools/financial-health-score/finhealth-score-methodology/
- FHN Toolkit 2021 (PDF) — finhealthnetwork.org/wp-content/uploads/2021/11/FinHealthScoreToolkit-2021.pdf
- FHN "Eight Ways to Measure Financial Health" (2016) — finhealthnetwork.org/research/eight-ways-to-measure-financial-health/
- CFPB Financial Well-Being Scale, technical report — sjdm.org/dmidi/files/CFPB_Financial_Well-Being_Scale_Technical_Report.pdf
- UNSGSA "Measuring Financial Health" — unsgsa.org/sites/default/files/resources-files/2021-09/Measuring-Financial-Health-note.pdf
- Deloitte/Nibud/Tilburg-Leiden — deloitte.com/nl/nl/Industries/financial-services/research/financiele-gezondheid-van-nederlandse-huishoudens.html
- Nibud buffer + BufferBerekenaar — nibud.nl/onderwerpen/sparen/een-financiele-buffer-opbouwen/ · bufferberekenaar.nibud.nl
