# Requirements: Onboarding Self-Healing Restore

## Samenvatting

De onboarding-flow herstelt de voortgang van een teruggekeerde gebruiker door `lastStep` uit `localStorage` te lezen en klakkeloos toe te passen. Wanneer de flow tussentijds wijzigt (stap hernoemd, verwijderd, of niet meer bij de gekozen modules passend) kan de gebruiker vast komen te zitten op een stap die niet in de actieve stap-volgorde voorkomt. De `Volgende`/`Vorige`-knoppen doen dan stilletjes niets omdat `activeStepOrder.indexOf(state.step)` gelijk is aan `-1`.

Deze feature maakt het herstel-pad **self-healing**: als de opgeslagen `lastStep` niet in de huidige `activeStepOrder` voorkomt, valt de flow terug op een geldige stap in plaats van de gebruiker te laten stranden.

## Probleem

### Incident dat dit blootlegde
Gebruiker `janpaul050486@gmail.com` (april 2026) kwam vast te zitten in de onboarding nadat de flow was aangepast terwijl hij er middenin zat. Zijn `trifinity_onboarding_draft` in `localStorage` bevatte een `lastStep` die niet meer in de huidige `Step`-union voorkwam, waardoor de navigatieknoppen niet meer reageerden. De enige uitweg was handmatig `localStorage` wissen via DevTools — onmogelijk voor een gewone eindgebruiker.

### Root cause
In `app/(onboarding)/onboarding/page.tsx`:

- **`RESTORE_STATE` reducer** (`page.tsx:198-218`) accepteert `saved.lastStep` zonder te valideren of die stap in de actieve stap-volgorde voorkomt. Er is wél een migratiemap voor hernoemingen (`persona → modules`, `extras → bezittingen`, `page.tsx:315-316`) maar die vangt alleen expliciet toegevoegde migraties op.
- **`goToNext` / `goToBack`** (`page.tsx:347-359`) berekenen `activeStepOrder.indexOf(state.step)`. Als die `-1` teruggeeft, wordt `idx + 1` en `idx - 1` respectievelijk `0` en `-2`. De `if (idx < activeStepOrder.length - 1)`-guard vuurt dan nog steeds, en zou de user naar `activeStepOrder[0]` navigeren — maar `goToBack` doet niets want `-1 > 0` is false. Resultaat: gebruiker zit vast.
- Twee bronnen van "waar was ik?" (server `profiles.completed_onboarding_steps` en client `localStorage.lastStep`) die niet tegen elkaar worden gevalideerd.

### Waarom dit vaker kan gebeuren
De onboarding-flow evolueert snel. Elke keer dat een stap wordt hernoemd, verwijderd, of afhankelijk gemaakt van een nieuwe module-keuze, is er een window waarin bestaande gebruikers met draft-state kunnen stranden.

## Acceptatiecriteria

### Gedrag bij restore
- [ ] Als `saved.lastStep` **niet** in `computeStepOrder(saved.selectedModules)` voorkomt, valt de restore terug op de eerstvolgende geldige stap ná de laatst bekende geldige positie — niet op `'identity'` of `'intro'` (behalve als laatste redmiddel).
- [ ] De fallback-strategie is: vind de dichtstbijzijnde voorloper in de union die wél in `activeStepOrder` zit; gebruik diens positie als ankerpunt en neem de volgende stap.
- [ ] Als geen enkele geldige positie kan worden afgeleid, start op `'identity'` (niet `'intro'`, omdat de user al voorbij de intro was).
- [ ] Gebruiker krijgt een discrete melding ("We hebben je herstelpunt bijgewerkt na een verbetering van de flow") — hergebruik het bestaande `restoredNotice`-patroon (`page.tsx:343`).

### Gedrag bij navigatie
- [ ] `goToNext` en `goToBack` hanteren `activeStepOrder.indexOf(state.step) === -1` expliciet: in dat geval dispatchen ze `SET_STEP` met de eerste stap uit `activeStepOrder` die ná de intro komt, in plaats van stilletjes niks te doen.
- [ ] Er wordt een `console.warn` gelogd wanneer een restore of navigatie in deze fallback-tak terechtkomt, zodat we in de monitoring kunnen zien hoe vaak dit voorkomt.

### Non-regressie
- [ ] Gebruikers met een geldige `lastStep` krijgen exact dezelfde restore-ervaring als nu.
- [ ] Bestaande migratiemap (`persona → modules`, `extras → bezittingen`) blijft werken.
- [ ] Als `onboarding_completed === true` op het profiel staat, blijft de redirect naar `/core` intact (`page.tsx:378-382`).
- [ ] localStorage-draft wordt na succesvolle save nog steeds gewist.

### Tests
- [ ] Unit test: `RESTORE_STATE` met `lastStep='budgets'` maar `selectedModules=['nieuws']` → resulteert in een geldige stap in de nieuws-only flow.
- [ ] Unit test: `RESTORE_STATE` met `lastStep='verzonnen_stap'` → resulteert in `'identity'`.
- [ ] Unit test: `goToNext` vanuit een state waar `step` niet in `activeStepOrder` zit → dispatcht naar eerste geldige stap.

## Niet in scope
- Server-side validatie van `completed_onboarding_steps` tegen de huidige flow-definitie.
- Een UI om handmatig "reset onboarding-voortgang" te doen vanuit de onboarding-pagina zelf (dat bestaat al via `/beheer/testdata`).
- Wijzigingen aan `/api/onboarding/reset` of `/api/onboarding-steps`.
- Een mechanisme om draft-state tussen devices te syncen.

## Relevante bestanden
- `app/(onboarding)/onboarding/page.tsx` — bevat `computeStepOrder` (r:59), `RESTORE_STATE` (r:198), `goToNext`/`goToBack` (r:347), `loadFromLocalStorage` (r:261)
- `components/onboarding/` — losse stap-componenten, geen wijzigingen verwacht
- `app/api/onboarding/reset/route.ts` — referentie voor wat een "clean slate" betekent

## Verwant
- Incident april 2026: `janpaul050486@gmail.com` stuck in onboarding — handmatig opgelost via SQL-reset + `localStorage.removeItem('trifinity_onboarding_draft')`.
