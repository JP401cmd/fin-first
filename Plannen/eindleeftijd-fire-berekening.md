# Fase 2 Plan: Eindleeftijd — App-wide implementatie

## Status
Wacht op validatie via de rekenpagina (`/tools/fire-sim`). Implementeer dit plan pas nadat de
rekenpagina de math correct heeft bevestigd (verificatie Fase 1 geslaagd).

---

## Aanleiding

De rekenpagina (Fase 1) toont de jaar-voor-jaar simulatie waarmee een gebruiker
kan zien of zijn/haar FIRE-plan haalbaar is tot een gewenste eindleeftijd.
Fase 2 integreert deze logica app-wide: profiel, horizon-berekeningen, widgets en
de identiteitspagina.

---

## Scope Fase 2

### 1. Database-migratie

Voeg kolom toe aan `profiles`:

```sql
ALTER TABLE profiles
  ADD COLUMN end_age integer DEFAULT 90 CHECK (end_age BETWEEN 60 AND 120);
```

Optioneel (voor NL Box 3 keuze):
```sql
ALTER TABLE profiles
  ADD COLUMN fire_return_model text DEFAULT 'classic' CHECK (fire_return_model IN ('classic', 'nl_box3'));
```

### 2. Profielpagina (`/identity/profiel`)

Voeg toe aan de FIRE-instellingen sectie:
- **Eindleeftijd** slider (60–120, default 90)
  - Sub-label: "Op welke leeftijd mag je vermogen op nul zijn?"
- **Rendementsmodel** keuze: Klassiek 4% / NL Box 3-gecorrigeerd
- Sla op in `profiles.end_age` en `profiles.fire_return_model`

### 3. `lib/horizon-data.ts`

#### Nieuwe functie: `computeEndAgeFireTarget()`

```typescript
export interface EndAgeSimParams {
  currentAge: number
  fireAge: number
  endAge: number
  yearlyExpenses: number
  annualSavings: number
  grossReturn: number
  returnModel: 'classic' | 'nl_box3'
  inflation: number
  includeAow: boolean
  aowMonthly: number
  aowAge: number
}

export interface EndAgeSimResult {
  rows: SimRow[]
  requiredFirePortfolio: number
  projectedFirePortfolio: number
  endPortfolio: number
  success: boolean
  depletionAge: number | null
  implicitWithdrawalRate: number
  classic25xTarget: number
}

export function computeEndAgeFireTarget(
  params: EndAgeSimParams,
  currentPortfolio: number,
): EndAgeSimResult
```

De functie:
1. Simuleert jaar-voor-jaar (opbouw + afbouw + AOW-fase)
2. Berekent `requiredFirePortfolio` via binary search (portfolio dat resulteert in €0 op eindleeftijd)
3. Berekent `projectedFirePortfolio` (wat je daadwerkelijk hebt op fireAge met huidige inleg)
4. Geeft `success: true` als `projectedFirePortfolio >= requiredFirePortfolio`

#### Aanpassen: `computeFireProjection()`

Wanneer `profiles.end_age` beschikbaar is:
- Toon naast klassiek SWR-doel ook het eindleeftijd-berekende doel
- Geef `fireTarget` terug als het hogste van beide (conservatief)

### 4. Horizon-pagina (`/horizon`)

#### FIRE-kaart aanpassen

Voeg toe als tweede tab/toggle op de FIRE-kaart:
- **"Eindig"** tab: eindleeftijd-model (naast bestaande "Oneindig" / klassiek SWR-tab)
- Toont: Benodigd vermogen | Eindleeftijd | Vrijheidsjaren
- Kassabon: toont de simulatiestappen (opbouw → afbouw → AOW)

#### Jouw Pad widget

Pas de FIRE-datum berekening aan als `end_age` ingesteld is:
- Gebruik `computeEndAgeFireTarget()` i.p.v. simpele `fireTarget / SWR`
- Toon het verschil: "Eindleeftijdmodel bespaart je X jaar inleggen"

### 5. Identiteitspagina (`/identity`)

Voeg toe aan de "Vrijheidsstatus" sectie:
- **Eindleeftijdmodel indicator**: "Met eindleeftijd 90 heb je €X nodig (vs. €Y klassiek)"
- Toont de delta: hoeveel minder (of meer) je nodig hebt vs. 25× model

### 6. Dashboard widget

Klein "FIRE-modus" indicator:
- Als `end_age < 90`: "Eindig model actief — eindleeftijd {end_age}"
- Als `end_age === 90` of niet ingesteld: "Klassiek model"

---

## Berekeningsprincipe (referentie)

```
netReturn =
  'classic':  grossReturn − inflation           (reëel rendement)
  'nl_box3':  NL_SWR ≈ 2.88%                   (uit lib/horizon-data.ts)

OPBOUWFASE (currentAge → fireAge):
  portfolio += portfolio * grossReturn + annualSavings

VROEG PENSIOEN (fireAge → aowAge):
  expenses_yr = yearlyExpenses * (1 + inflation)^(age − fireAge)
  portfolio = portfolio * (1 + netReturn) − expenses_yr

AOW-FASE (aowAge → endAge):
  aow_yr = aowMonthly * 12 * (1 + inflation)^(age − aowAge)  [if includeAow]
  withdrawal = max(0, expenses_yr − aow_yr)
  portfolio = portfolio * (1 + netReturn) − withdrawal

DOEL: portfolio = 0 op eindleeftijd
```

---

## Kritieke bestanden Fase 2

| Bestand | Actie |
|---|---|
| `lib/horizon-data.ts` | Nieuwe `computeEndAgeFireTarget()` functie |
| `app/(app)/identity/profiel/page.tsx` | Eindleeftijd slider + rendementsmodel keuze |
| `app/(app)/horizon/page.tsx` | "Eindig" tab op FIRE-kaart |
| `components/app/jouw-pad-widget.tsx` | Eindleeftijd-bewust FIRE-doel |
| Database migratie | `profiles.end_age`, `profiles.fire_return_model` |

---

## Verificatie Fase 2

1. Eindleeftijd 90, FIRE 55 → zelfde resultaat als Fase 1 rekenpagina
2. Profiel opslaat end_age → horizon-pagina herberekent
3. Dashboard indicator toont correcte modus
4. `npm run build:check` slaagt
