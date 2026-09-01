---
id: 0125-een-doel-koppelt-meervoudig-en-syncbaar
title: 'Een doel koppelt meervoudig en netto, en syncbaar-zijn is opt-in per doel'
status: aanvaard
date: 2026-09-01
elements: [as-planning, as-vermogen, do-doel]
---

# 0125 — Een doel koppelt meervoudig en netto; auto-sync is opt-in

## Context

Handmatige doelen konden aan **precies één** bezitting **óf** één schuld hangen
(`goals.linked_asset_id` / `linked_debt_id`, wederzijds exclusief in de UI). Twee
gevolgen:

1. **Afbouwen was tweederangs.** Schuldkoppeling stond alleen op `debt_payoff`,
   de snelle toevoeg-sheet koppelde helemaal niets, en de preset "Schuldenvrij"
   droeg letterlijk de tekst *"de sheet koppelt (nog) geen schuld"*. Wie een doel
   op meerdere potjes tegelijk wilde — twee spaarrekeningen, of "de studieschuld
   én het doorlopend krediet weg" — kon dat niet uitdrukken.
2. **Metric-doelen waren dood zodra je ze zelf maakte.** De live-synchronisatie in
   `lib/goal-current-value.ts` gold uitsluitend voor lab-gegenereerde
   *parameter-doelen* (`metadata.bron === 'parameter'`). Een handmatig
   aangemaakt spaarquote-doel kreeg nooit een actuele waarde: de kaart bleef op
   de opgeslagen 0 staan terwijl elk ander oppervlak de echte quote toonde.

## Besluit (eigenaar-akkoord 1 sep 2026)

### 1. Koppelen loopt via een join-tabel, en mengen mag

Nieuwe tabel `goal_links(goal_id, asset_id | debt_id)` — precies één van beide
per rij (CHECK), FK's met `ON DELETE CASCADE`, own-row RLS plus het gedeelde
huishouden-leespad van het ouder-doel, en een eigenaarsguard-trigger naar het
patroon van `20260730210321_guard_bank_accounts_linked_asset_owner.sql` (een FK
alléén laat een geraden UUID van andermans bezitting toe — RLS geldt niet in de
FK-check).

**Voortgang bij meerdere koppelingen** (canoniek in `computeLinkedCurrentValue`):

| selectie | huidige waarde |
|---|---|
| alleen bezittingen | Σ waarden |
| alleen schulden | `max(0, doelbedrag − Σ restsaldi)` — het **afgeloste** bedrag |
| gemengd | Σ waarden − Σ restsaldi (**netto**, niet geclampt) |

De gemengde tak is bewust een *netto-selectie* en wordt bewust **niet** op nul
geclampt: een negatieve netto is een eerlijk beeld en een geclampte 0 zou een
verslechtering onzichtbaar maken. De keerzijde is expliciet aanvaard — de
voortgang van zo'n doel kán dalen doordat een schuld groeit, zonder dat de
gebruiker iets deed.

De legacy-kolommen blijven staan en worden gebackfilld; ze worden niet meer
geschreven en gelden nog uitsluitend als leesfallback voor rijen zonder links.
Droppen is een latere opruimmigratie.

### 2. Dezelfde formule voor prefill en runtime

`computeLinkedCurrentValue` is één geëxporteerde helper die zowel het formulier
(prefill) als de loader (runtime) consumeert. Aanleiding: het formulier vulde bij
een schuldkoppeling het **restsaldo** in terwijl de loader `doel − restsaldo`
rekende — prefill en runtime spraken elkaar tegen op dezelfde kaart.

### 3. Auto-sync is opt-in per doel, via `metadata.sync = 'auto'`

Doelen mogen op een afgeleid cijfer staan dat live uit de canonieke motor komt:
spaarquote, netto vermogen, FIRE-leeftijd, vrijheids-%, passief inkomen,
noodfonds-maanden, eindsaldo bij levensverwachting, schuldenvrij-datum en totale
belastingdruk. De marker wordt **uitsluitend server-side** gezet (de client kan
geen vrije `metadata` sturen); `metadata.bron = 'parameter'` blijft exclusief aan
`app/api/toekomst-doel/route.ts`.

**Waarom opt-in en niet in één keer omschakelen:** bestaande metric-doelen die
gebruikers zelf bijhielden zouden bij een harde omschakeling in één deploy van
waarde springen — mogelijk direct "behaald" (met viering en `completed_at`) of
plots rood. De opt-in-marker raakt nul bestaande rijen en houdt de gedocumenteerde
regressie-eis in `lib/goal-current-value.ts` overeind. Het is géén tweede systeem:
beide stromen lopen door dezelfde `syncActiveGoalValues` en dezelfde canonieke
bronnen.

### 4. Elke doelbasis consumeert, niemand herrekent

Elke bron is een **lazy thunk** die pas draait bij een actief doel van dat type
(zelfde patroon als de bestaande FIRE-snapshot), levert `null` bij "geen
uitspraak" — waarna de opgeslagen waarde blijft staan — en haalt teller én noemer
uit dezelfde bron. Dat laatste is de les van het vrijheidsgetal-doel, waar een
canonieke teller tegen een opgeslagen noemer een vierde antwoord opleverde; de
synchronisatie is daarom alles-of-niets per doel.

De schuldenvrij-datum draagt zijn herkomst mee (`resolveDebtTermBasis`): alleen
een door de gebruiker ingevulde einddatum is een hard feit, een afgeleide termijn
is een aanname en wordt als zodanig gelabeld.

## Gevolgen

- `goal_links` is de bron voor "waar hangt dit doel aan"; oppervlakken die willen
  weten of een doel gekoppeld is (check-in, widgets) lezen die, niet de
  legacy-kolommen. De check-in slaat gekoppelde én auto-sync-doelen over — om een
  handmatige update vragen voor een live cijfer is onzin.
- De goals-route valideert voortaan met zod en schrijft PATCH op een expliciete
  veld-whitelist. Vóór dit besluit schreef PATCH élk meegestuurd body-veld door,
  inclusief `metadata`, `ownership` en `user_id`.
- `computeGoalProgress` blijft ongemoeid: dit besluit gaat over *welke huidige
  waarde* de motor invoert, niet over hoe die waarde tot een oordeel wordt.

## Alternatieven overwogen

- **`uuid[]`-kolommen of JSONB in `metadata`** in plaats van een join-tabel:
  verworpen. Geen referentiële integriteit (een verwijderde bezitting laat een
  dood id achter), de ERD-scanner leest FK's uit migraties en zou de relatie
  missen, en `metadata` heeft al een strenge, exclusieve schrijfpoort.
- **Mengen verbieden** (opbouwdoel óf afbouwdoel, nooit beide): eenvoudiger uit te
  leggen en het getal kan niet dalen door een groeiende schuld. Verworpen op
  verzoek van de eigenaar: een netto-doel over een vrije selectie is precies de
  vraag die niet uitgedrukt kon worden.
