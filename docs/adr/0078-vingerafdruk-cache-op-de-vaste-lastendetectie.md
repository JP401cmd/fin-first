---
id: 0078-vingerafdruk-cache-op-de-vaste-lastendetectie
title: 'De vaste-lastendetectie draait alleen opnieuw als haar invoer veranderd is — een vingerafdruk beslist dat, geen klok'
status: aanvaard
date: 2026-08-04
elements: [as-budget, fn-budgetteren]
---

# 0078 — Vingerafdruk-cache op de vaste-lastendetectie

`loadVasteLastenSummary` haalt per request het volledige 12-maands
transactievenster op en laat daar een regex-zware detectie overheen lopen, op
minstens vier oppervlakken. De uitkomst verandert tussen twee requests bijna
nooit. Er komt daarom een procescache voor die uitkomst, waarvan de geldigheid
niet aan een klok hangt maar aan een **vingerafdruk van het invoermateriaal**:
verandert er niets aan de transacties in het venster of aan de bevestigde vaste
lasten, dan blijft zowel de download als de detectie staan.

## Context

De loader doet twee dure dingen:

1. **De ophaal.** Alle transactierijen van twaalf maanden, acht kolommen breed,
   in meerdere pagina's — PostgREST kapt elk antwoord af op `max_rows`, dus dat
   zijn meerdere seriële roundtrips met een JSON-payload in de megabytes. T3.2
   maakte die pagina's goedkoper (keyset in plaats van OFFSET), maar de download
   zélf bleef staan.
2. **De detectie.** `detectRecurringTransactions` groepeert op genormaliseerde
   tegenpartij en draait daarna per groep tientallen categorisatie-regexes —
   tientallen tot honderden milliseconden synchrone server-CPU.

Dat gebeurt op de cashflow-hub, de vaste-lastenpagina, de statusroute en binnen
`loadDashboardData`. React `cache()` dedupt dat binnen één request, maar
overleeft geen request-grens: elk volgend bezoek betaalt opnieuw.

## Besluit

**Een procescache op de `VasteLastenSummary`, gesleuteld op de gebruiker, geldig
zolang een vingerafdruk van het invoermateriaal gelijk blijft**
(`lib/vaste-lasten-cache.ts`). Vóór het dure pad draait één goedkope ronde —
alles parallel, dus één latency — die de vingerafdruk meet. Gelijk aan de
opgeslagen vingerafdruk? Dan komt de vorige samenvatting terug en blijven de
ophaal én de detectie staan.

De vorm is gespiegeld op `lib/cashflow-status-cache.ts` en
`lib/page-status/status-cache.ts`; bewust geen derde variant. Het verschil met
die twee: daar is de TTL het mechanisme, hier is het het vangnet.

### Waarom deze cache mag en die op `/api/cashflow/settings` niet

Eerder in ditzelfde traject is een cache **verwijderd** (T2.2-review, commit
`316586b9`). Dat mag later niet gelezen worden als "caches horen hier niet". Het
verschil is de klasse van de gecachete waarde:

| | verwijderde cache | deze cache |
|---|---|---|
| wat er in zat | instellingsvelden die de gebruiker zelf invult | een afgeleide detectie-uitkomst over transactiehistorie |
| faalmodus | gebruiker slaat op en leest zijn eigen invoer van vóór de bewerking terug | een gemiddelde over ≥3 voorvallen schuift een venster later mee |

De meetlat is dus: **staat de cache vóór een invoerveld dat de gebruiker
terugleest?** Zo ja, weg ermee. Zo nee, dan is begrensde staleness een keuze.

Precies daarom draagt de vingerafdruk hieronder óók de *inhoud* van de
bevestigde `recurring_transactions`: díe velden (naam, bedrag, frequentie, de
'excluded'-markering) vult de gebruiker wél zelf in, en die moeten meteen
doorwerken.

### Samenstelling van de vingerafdruk, en waarom

| onderdeel | vangt |
|---|---|
| ondergrens van het venster | de maandwissel die het venster laat opschuiven |
| `count(*)` op transacties in het venster | rijen erbij of eraf, inclusief een import |
| `max(date)` | een verse of teruggedateerde boeking aan de rand |
| `max(created_at)` | een import die per saldo evenveel rijen oplevert |
| `max(updated_at)` | een **bewerkte** bestaande rij — best-effort, zie hieronder |
| de actieve `recurring_transactions`, op **inhoud** | elke bewerking aan een bevestigde vaste last |

Twee keuzes verdienen toelichting.

**De recurring-tak is een inhoudsdigest, geen telling.** Een `count(*)` op
actieve regels — de eerste opzet — ziet niet dat iemand een vaste last hernoemt,
het bedrag aanpast of op `excluded` zet: het aantal actieve rijen blijft
gelijk, terwijl het totaal op de pagina hoort te veranderen. Dat is exact de
faalmodus waarom de settings-cache eruit moest. De rijen komen uit dezelfde
query die het miss-pad tóch al nodig heeft en die tabel is klein en begrensd,
dus de digest kost geen extra roundtrip. De rijen worden vóór het hashen op `id`
gesorteerd: PostgREST geeft zonder `order` geen volgordegarantie, en een
vingerafdruk die op rijvolgorde reageert zou willekeurig missen.

**`budgets` zit er bewust NIET in.** De aanleiding om het te overwegen is dat
budgetwijzigingen `matchedBudgetId` beïnvloeden. Dat veld haalt deze
samenvatting echter nooit: `VasteLastenItem` draagt geen budget-afgeleid veld.
Sterker nog, de `budgets`-parameter van `detectRecurringTransactions` wordt in
die functie **helemaal niet gelezen** — `matchedBudgetId` komt uit de
`budget_id`-kolom van de transacties zelf, niet uit de budgettenlijst. Een
budget toevoegen, hernoemen of verwijderen kan de uitkomst dus niet veranderen,
en een extra `count(*)` erop zou alleen kosten toevoegen en de hitrate verlagen.
**Zodra `VasteLastenSummary` wél een budget-afgeleid veld gaat dragen, moet deze
keuze opnieuw.**

### Het perspectief zit NIET in de sleutel

De sleutel is de user-id (cross-account-isolatie), plus de vingerafdruk in de
entry. Géén perspectief — anders dan bij `/api/overzicht/cashflow-status`, waar
`loadCashflowData(supabase, perspective)` de uitkomst stuurt en het perspectief
dus wél in de sleutel hoort.

`loadVasteLastenSummary` neemt geen perspectief-parameter en leest puur wat RLS
zichtbaar maakt: eigen rijen plus `ownership = 'shared'` binnen het huishouden.
Die verzameling is voor een gegeven gebruiker dezelfde, ongeacht welke weergave
er in de UI aanstaat. De uitkomst is dus perspectief-blind — hetzelfde geval als
de settings-loader, niet als de statusroute. Het perspectief toevoegen zou geen
enkel lek dichten en alleen de hitrate delen. **Krijgt deze loader ooit wel een
perspectief-parameter, dan moet die alsnog de sleutel in.**

### Eén entry per gebruiker, niet één per vingerafdruk

De vingerafdruk staat ín de entry, niet in de Map-sleutel. Andersom zou elke
import een nieuwe entry achterlaten die pas na de TTL vervalt — bij een reeks
mutaties een stapel dode samenvattingen in het geheugen. Nu overschrijft een
verse vingerafdruk de vorige.

### Bewust géén expliciete invalidatie

De Map leeft per instance. Een mutatie-getriggerde purge raakt alleen de
instance die de mutatie toevallig afhandelde en geeft dus schijnzekerheid —
dezelfde redenering als bij de statusroute. Invalidatie is impliciet: de mutatie
verandert de vingerafdruk, dus de entry mist vanzelf, op élke instance.

### Bewust géén persistentietabel

Een DB-tabel zou de cache over instances heen delen, maar kost schema,
migratie, RLS én consistentie-onderhoud voor iets wat een procescache afdekt.
**Escalatiepad:** valt de hitrate in een multi-instance-opstelling tegen (veel
instances, weinig requests per instance), dan is de volgende stap dezelfde
vingerafdruk met een persistente laag — de vingerafdruk-logica blijft dan
ongewijzigd, alleen de opslag verhuist.

## Gevolgen

- **Wat de vingerafdruk niet sluitend ziet:** een bewerking op een BESTAANDE
  transactierij die het aantal en de maxima ongemoeid laat. `max(updated_at)`
  vangt dat op voor de paden die die kolom meeschrijven (het transactieformulier,
  de categorisatie), maar er is geen trigger op `transactions.updated_at`, dus
  dat signaal is best-effort en geen garantie. Bewust aanvaard: zo'n bewerking
  verschuift een gemiddelde over minstens drie voorvallen. De TTL (30 minuten) is
  daar het vangnet voor — bewust ruimer dan de 45 s van de statuscaches, omdat de
  vingerafdruk hier het echte mechanisme is.
- **Op een misser** kost de vingerafdrukronde één extra, seriële roundtrip vóór
  de zware fetch. Geaccepteerd: die ronde is aggregaten zonder payload, de
  download erna is megabytes.
- **Faalt de vingerafdrukronde** (welke deelquery dan ook), dan wordt de cache
  volledig overgeslagen — niet gelezen én niet geschreven. Een half gevulde
  vingerafdruk zou anders stabiel genoeg kunnen lijken om een verkeerde
  samenvatting op vast te pinnen.
- `lib/vaste-lasten-cache.test.ts` legt drie lagen vast: de cache zelf (hit/miss,
  TTL, cross-account, één entry per gebruiker), de samenstelling van de
  vingerafdruk (wat hem laat kantelen en wat niet), en het loaderpad met tellers —
  bij een treffer draait de detectie aantoonbaar níet en komen er geen
  paginatie-queries bij.
- De cache is RLS-client-only, net als de loader eronder: nooit met
  `getServiceClient()` vullen. Een entry gevuld via service-role zou de
  huishouden-afbakening van de RLS-policy omzeilen en bij de volgende treffer aan
  de verkeerde gebruiker geleverd worden.
