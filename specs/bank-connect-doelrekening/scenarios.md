# Scenariocatalogus: doelrekening kiezen bij bank-koppelen

> Status: **input voor bouw en test** — dit document beschrijft het beoogde gedrag
> van de functionaliteit uit `plan.md` (fase 0–8, nog niet gebouwd). Het raakt
> `plan.md` niet aan; waar dit document een gat of spanning blootlegt t.o.v. het
> plan, staat dat in sectie 3.
>
> Bron van het gedrag: het eigenaarsvoorstel van vandaag (7 punten) + `plan.md`
> (besluiten 1–7, vastgesteld 29 juli) + de praktijkfeiten van vandaag (145
> duplicaten, de gedeactiveerde-rekening-bug, de N-rekeningen-per-consent-vraag).
> Geverifieerd tegen de actuele code: `app/api/bank-connect/callback/route.ts`,
> `app/api/bank-connect/sync/route.ts`, `app/api/bank-connect/disconnect/route.ts`,
> `app/(app)/core/cash/connect/page.tsx`, `app/(app)/core/cash/connect/success/page.tsx`,
> `components/core/vermogen-asset-card.tsx`, `components/app/cash-overview.tsx`,
> `components/core/account-source-icon.tsx`.

## Leeswijzer & begrippen

- **Doelrekening** — de TriFinity-betaalrekening (bestaand of nieuw) die de
  gebruiker vóór de OAuth-redirect kiest om de bankkoppeling te dragen
  (`plan.md` fase 3, kolom `bank_connections.target_bank_account_id`).
- **Dedup laag 1** — de bestaande hash-dedup binnen één bron (`import_hash` =
  SHA-256 over `datum|bedrag|omschrijving`, `lib/parsers/shared.ts#computeHash`).
  Draait nu al op elke sync én elke import, ongeacht dit plan.
- **Dedup laag 2 (cross-bron)** — de nieuwe, additieve dedup uit fase 1/2 van
  `plan.md`: exacte match op datum ±1 dag + bedrag + tegenpartij-IBAN (of
  genormaliseerde naam als fallback), gescoped op `(user_id, account_id)`.
- **Consume-once** — `target_bank_account_id` wordt na gebruik op `null` gezet,
  zodat een latere herautorisatie de voorkeur niet stilzwijgend herhaalt.
- **Zacht ontkoppelen** — "Verbreken" zet alleen `bank_connection_accounts.is_active
  = false`; de rekening en haar transacties blijven bestaan (`disconnect/route.ts`).
- **Statussen van een verbinding** — `pending` / `active` / `expired` / `revoked`
  op `bank_connections.status`. Autorisatie verloopt na 90 dagen.

Elk scenario: uitgangssituatie → stappen → verwacht gedrag (Given/When/Then
waar dat de kern scherper maakt) → randgevallen → wat er misgaat als we het
niet afvangen. Geschreven in de stem van de app (je/jij) waar het scenario
gebruikersgedrag beschrijft.

**Inhoud**

- Groep A — Koppelen (eerste toestemming): SC-01 t/m SC-09
- Groep B — Levenscyclus van een bestaande koppeling: SC-10 t/m SC-15
- Groep C — Synchroniseren & data: SC-16 t/m SC-21
- Groep D — Budget & saldo: SC-22 t/m SC-24
- Groep E — Overig: SC-25, SC-26

---

## Groep A — Koppelen (eerste toestemming)

### SC-01 — Koppelen aan een bestaande rekening zonder transactiehistorie

**Uitgangssituatie.** Je hebt in TriFinity al een betaalrekening "ING Lopende
rekening" handmatig aangemaakt, zonder één transactie erop.

**Stappen.**
1. Je klikt "Bank koppelen", kiest je bank.
2. In de keuzestap (wizard-stap 2, `plan.md` fase 3) kies je expliciet "ING
   Lopende rekening" als doelrekening.
3. Je rondt de bankautorisatie af.

**Verwacht gedrag.**
- Given een lege doelrekening gekozen, When de callback verwerkt wordt, Then
  landt de koppeling op die rekening — geen tweede rekening, geen tweede
  cash-asset (acceptatiecriterium (a) uit `plan.md`, gedeeltelijk — hier zonder
  historie).
- De eerste sync haalt de volledige beschikbare historie op (`sync_cursor`
  blijft `null`, want er is niets om vanaf te hervatten — fase 7).

**Randgevallen.**
- De rekening had al een IBAN uit een eerdere (mislukte) koppelpoging — de
  bestaande `iban_hash`-fallback (stap 2 in `callback/route.ts`) claimt hem dan
  al vóórdat de expliciete keuze aan de beurt komt; het resultaat is
  hetzelfde, maar de reden waaróm verschilt (zie SC-07).

**Als we dit niet afvangen.** Dit is het eenvoudigste pad; zonder de
doelrekening-stap zou de heuristiek een gok maken op basis van IBAN/naam, met
het risico dat er alsnog een tweede rekening ontstaat wanneer de handmatige
rekening geen IBAN had.

---

### SC-02 — Koppelen aan een bestaande rekening mét CSV-historie

**Uitgangssituatie.** Precies de situatie van vandaag: een rekening met 7.975
CSV-getransporteerde transacties, waarvan een deel budget-toewijzingen met de
hand is gezet.

**Stappen.**
1. Je koppelt je bank en kiest in de wizard expliciet deze rekening als
   doelrekening. De wizard toont hoeveel transacties er al staan en over welke
   periode (fase 3-eis: "toon aantal + periode zodat de gebruiker snapt wát hij
   samenvoegt").
2. Je rondt de autorisatie af; de eerste sync haalt transacties op.

**Verwacht gedrag.**
- Given een doelrekening met bestaande historie, When de sync draait, Then
  landen alleen de daadwerkelijk nieuwe transacties; overlappende boekingen
  worden door dedup laag 1 (identieke bron zou dit zijn) of, realistischer
  omdat de bron wisselt (bank i.p.v. CSV), door dedup laag 2 herkend en
  **stil overgeslagen** (geen rij, geen status).
- Given een bestaande transactie met een handmatige `budget_id`, When dezelfde
  boeking via de bank binnenkomt, Then blijft de bestaande rij ongewijzigd —
  zelfde `id`, zelfde `budget_id`, zelfde `category_source` (FR11-bewijs,
  fase 1). Dedup verhindert alléén een INSERT, nooit een update/merge/delete.
- De sync-cursor start niet vanaf nul maar vanaf de nieuwste bestaande
  transactiedatum min 3 dagen (fase 7) — dus je wacht niet op het opnieuw
  ophalen van drie jaar geschiedenis.

**Randgevallen.**
- De CSV-omschrijving en de banktekst voor dezelfde boeking verschillen zo
  sterk dat zowel IBAN als genormaliseerde naam niet matchen (bijv. de bank
  levert geen tegenpartij-IBAN én een sterk afwijkende naam) → dedup laag 2
  mist hem. Dit is expliciet **restrisico 1** uit `plan.md` §7: geen crash,
  wel een stille dubbele rij. De gesplitste tellers in `bank_sync_log`
  (`transactions_dup` vs. `transactions_dup_cross_source`) maken zichtbaar hoe
  vaak dit gebeurt, maar lossen het niet automatisch op.

**Als we dit niet afvangen.** Dit is exact het incident van vandaag: 145
duplicaten, dubbel geteld saldo, budget-toewijzingen die in de ruis
verdwijnen. Dit scenario is de reden dat het hele plan bestaat.

---

### SC-03 — Koppelen aan een nieuw aangemaakte rekening

**Uitgangssituatie.** Je hebt nog geen TriFinity-rekening voor deze bank, of
je wilt bewust niet samenvoegen met een bestaande.

**Stappen.**
1. In de keuzestap kies je expliciet "Nieuwe rekening aanmaken" — als
   gelijkwaardige optie naast de bestaande rekeningen, niet als afwezigheid
   van een keuze (owner-punt 1 + fase 3-eis).
2. Je rondt de autorisatie af.

**Verwacht gedrag.**
- Given "nieuw" expliciet gekozen, When de callback verwerkt wordt, Then
  ontstaat precies één nieuwe `bank_accounts`-rij + één `assets`-rij
  (acceptatiecriterium (b)). De nieuwe asset krijgt — zoals nu al standaard
  gebeurt in de aanmaak-tak van `callback/route.ts` — `has_budget_tracking:
  true` en `is_active: true` vanaf dag 1; er is hier dus geen "automatisch
  aanzetten"-vraagstuk, dat bestaat alléén bij hergebruik (zie SC-22).
- Dedup laag 1 draait gewoon mee op elke volgende sync (het is een
  app-brede hash-check, geen optionele stap) — zie de toelichting bij SC-04
  en de open vraag in sectie 3.

**Randgevallen.** Zie SC-19/SC-20: ook een gloednieuwe rekening kan later een
CSV-bijlading of een tweede sync krijgen die wél kan overlappen — "nieuw"
betekent hier alleen dat er bij dít moment van koppelen niets is om tegen te
dedupliceren, niet dat dedup voor deze rekening structureel uit staat.

**Als we dit niet afvangen.** Zonder expliciete "nieuw"-optie is de enige weg
naar een nieuwe rekening dat de heuristiek er zelf geen bestaande vindt — een
impliciete, niet-gekozen uitkomst die de gebruiker niet kan sturen.

---

### SC-04 — Eén consent, meerdere bankrekeningen (N-rekeningen-per-consent)

**Uitgangssituatie.** Je autoriseert bij ING; ING levert in één consent je
betaalrekening én een spaarrekening terug (TrueLayer geeft na één toestemming
alle rekeningen van de bank). De doelrekening-keuze in de wizard dekt er maar
één.

**Stappen.**
1. Je kiest in de wizard je betaalrekening als doelrekening.
2. Je autoriseert bij de bank; TrueLayer geeft 2 rekeningen terug.
3. De callback verwerkt de lus over `tlAccounts`.

**Verwacht gedrag.**
- Given N rekeningen in de consent en 1 gekozen doelrekening, When de callback
  verwerkt wordt, Then blijven **alle N gekoppeld** — de doelrekening-voorkeur
  bindt precies de eerste onbediende TrueLayer-rekening die nog niet door
  `external_account_id`/`iban_hash` is geclaimd (precedentie-stap 3 van 4 in
  fase 4); de overige rekeningen volgen de bestaande heuristiek
  (`external_account_id` → `iban_hash` → nieuw aanmaken).
  Acceptatiecriterium (c): 3 TrueLayer-rekeningen, 1 voorkeur → 3
  koppelingen, de voorkeur bindt er precies 1.
- Op de success-pagina zie je per gekoppelde rekening wélke TriFinity-rekening
  hem draagt (fase 4-uitbreiding), zodat niets stil gebeurt.

**Randgevallen.**
- Zie SC-05 (spaarrekening/creditcard in de bundel) en SC-07 (een
  niet-gekozen rekening matcht een bestaande TriFinity-rekening).
- Consume-once betekent dat de voorkeur na deze ene callback verdwijnt: een
  tweede callback (bijv. na herautorisatie) claimt niet nogmaals dezelfde
  rekening op basis van de oude voorkeur — die tweede callback valt terug op
  `external_account_id`, wat op dat moment al goed staat.

**Als we dit niet afvangen.** Een rekening die de bank teruggeeft maar die
niemand koppelt, is stil gegevensverlies dat de gebruiker niet ziet — precies
wat het eigenaarsvoorstel met "geen stille onomkeerbare koppeling" wil
voorkomen.

---

### SC-05 — Spaarrekeningen/creditcards komen ongevraagd mee in de consent

**Uitgangssituatie.** Vervolg op SC-04: de tweede rekening in de bundel is
geen betaalrekening maar een spaarrekening of creditcard — een accounttype dat
TriFinity niet als "checking" behandelt.

**Stappen.** Zelfde als SC-04, maar de niet-gekozen rekening heeft
`account_type` ≠ betaalrekening bij de bank.

**Verwacht gedrag (te bepalen — zie open vraag 3 in sectie 3).**
- De huidige aanmaak-tak in `callback/route.ts` (stap 3) zet voor élke nieuw
  aangemaakte rekening hard `subtype: 'checking'` en `account_type:
  'checking'` op zowel de asset als de `bank_accounts`-rij — ongeacht wat de
  bank als accounttype teruggeeft. Een spaarrekening die zo meekomt, krijgt
  dus ten onrechte het label "betaalrekening".
- Given een spaarrekening/creditcard in de bundel, When ze automatisch als
  nieuwe rekening wordt aangemaakt, Then zou je verwachten dat `asset_type`/
  `subtype` het echte accounttype weerspiegelen — dit is nu niet het geval.

**Randgevallen.**
- Een creditcard heeft doorgaans een negatief/afwijkend saldo-teken; als hij
  als "checking, is_liquid: true" in het netto vermogen meetelt, vertekent dat
  het cijfer.

**Als we dit niet afvangen.** Een creditcardschuld die als liquide
betaalrekening in het vermogen meetelt, is een rekenfout die zich door de hele
app voortplant (netto vermogen, spaarquote, FIRE-motor) — dit valt onder de
"consume, don't recompute"-conventie: de bron moet al kloppen, downstream kan
het niet meer herstellen.

---

### SC-06 — De gekozen doelrekening heeft al een actieve koppeling

**Uitgangssituatie.** Je "ING Lopende rekening" is al gekoppeld aan een eerdere
bankverbinding (bijv. je koppelde 'm per ongeluk twee keer, of aan twee
verschillende banken die toevallig naar dezelfde IBAN wijzen).

**Stappen.**
1. Je opent de wizard, kiest een bank, en in de keuzestap zie je "ING Lopende
   rekening" als optie — maar uitgeschakeld met de reden "al gekoppeld aan
   {bank}" (fase 5-eis: zichtbaar maar niet kiesbaar, verdwenen opties zijn
   verwarrender dan uitgelegde opties).
2. Zou je 'm via een andere weg (bijv. dubbele tabbladen) toch proberen te
   kiezen, dan wijst de server het af.

**Verwacht gedrag.**
- Given een doelrekening met een bestaande actieve koppeling, When je 'm in de
  UI probeert te kiezen, Then is de optie zichtbaar-maar-uitgeschakeld met
  reden (client) én geeft `auth-link` een `409 conflict` met een NL-melding
  terug zonder pending-rij aan te maken (server — "de UI-check is comfort,
  niet de grens"). Acceptatiecriterium (d).
- Op databaseniveau voorkomt de partiële unique index
  (`bank_connection_accounts_one_active_per_bank_account`) een tweede actieve
  koppeling sowieso (fase 5).

**Randgevallen.**
- Een **inactieve** tweede rij (zacht ontkoppeld) is wél toegestaan — dat is
  precies de reconnect-situatie (SC-12) die de callback al hergebruikt.

**Als we dit niet afvangen.** Twee actieve koppelingen op dezelfde rekening
geven twee gelijktijdige saldo-/transactiebronnen die elkaar overschrijven of
dubbel tellen — een tweede, subtielere variant van het incident van vandaag.

---

### SC-07 — Een niet-gekozen rekening uit de bundel matcht een bestaande TriFinity-rekening

**Uitgangssituatie.** Vervolg op SC-04: de bank levert 2 rekeningen. Je kiest
je betaalrekening als doelrekening. De tweede (niet-gekozen) rekening blijkt
een IBAN te hebben die al bij een bestaande, andere TriFinity-rekening hoort
(bijv. een spaarrekening die je vorig jaar handmatig met IBAN hebt aangemaakt).

**Stappen.** Zelfde als SC-04; de tweede rekening in de `tlAccounts`-lus
matcht via de bestaande `iban_hash`-fallback (precedentie-stap 2, vóór de
doelrekening-voorkeur aan de beurt komt).

**Verwacht gedrag.**
- Given een niet-gekozen rekening met een IBAN die al bestaat in TriFinity,
  When de callback 'm verwerkt, Then hergebruikt hij die bestaande rekening
  automatisch (bestaand, ongewijzigd gedrag van de precedentieketen) — je
  koos hem alleen niet expliciet, want je wist niet dat hij in de bundel zat.
- **Open vraag** (zie sectie 3, vraag 4): is stil hergebruiken hier
  acceptabel, of hoort dit ook op de success-pagina gemeld te worden zoals de
  gekozen doelrekening dat wél krijgt (fase 4)?

**Randgevallen.**
- Is die bestaande rekening zelf al ergens anders actief gekoppeld (aan een
  andere bank), dan geldt SC-06's blokkade ook hier — met als verschil dat de
  gebruiker deze botsing niet zag aankomen omdat hij de rekening niet bewust
  koos.

**Als we dit niet afvangen.** De gebruiker ziet een koppeling "verschijnen" op
een rekening waar hij niets voor deed — verwarrend, ook al is het technisch
correct (geen duplicaat).

---

### SC-08 — Dubbel afgevuurde koppeling (dubbelklik op "Verbind")

**Uitgangssituatie.** Je klikt twee keer snel op "Verbind met {bank}" (trage
verbinding, ongeduld) vóórdat de eerste `auth-link`-aanroep de pagina heeft
doorgestuurd.

**Stappen.**
1. Twee `POST /api/bank-connect/auth-link`-aanroepen vuren vlak na elkaar.
2. Beide maken een `pending` rij aan met een eigen `state`.
3. `window.location.href` wordt twee keer gezet; de browser navigeert naar de
   laatste.

**Verwacht gedrag.**
- Given twee pending-rijen voor dezelfde poging, When je de bank-autorisatie
  op de tweede afrondt, Then verwerkt de callback die ene state normaal.
- De eerste, nooit-afgeronde pending-rij blijft achter tot ze door de
  verweesde-verbindingen-opruiming (stap 6 in `callback/route.ts`) wordt
  opgeruimd bij een vólgende geslaagde callback van dezelfde gebruiker — niet
  meteen.
- Given de `handleConnect`-knop, When de eerste klik al bezig is (`connecting`
  = true), Then is de knop `disabled` (bestaande code, regel 216 van
  `connect/page.tsx`) — het dubbelklik-risico is dus al client-side beperkt,
  maar niet waterdicht bij een trage eerste respons vóór React de state heeft
  bijgewerkt.

**Randgevallen.** Kiest de gebruiker in de twee pogingen een **andere**
doelrekening (zeldzaam maar mogelijk als hij teruggaat), dan wint de state die
daadwerkelijk wordt afgerond — de andere pending-rij verdwijnt ongebruikt bij
de opruiming.

**Als we dit niet afvangen.** Zonder de bestaande disabled-state zou een
dubbelklik twee tabbladen naar de bank kunnen openen — verwarrend, maar niet
schadelijk voor de data (elke pending-rij is onafhankelijk en de opruiming
vangt het weeskind op).

---

### SC-09 — Gebruiker breekt de bankautorisatie af

**Uitgangssituatie.** Je klikt "Verbind", wordt doorgestuurd naar je bank, en
klikt daar op "Annuleren" of sluit het venster.

**Stappen.**
1. `auth-link` maakt de `pending`-rij aan en stuurt je naar de bank.
2. Je breekt af bij de bank; er komt geen `code` terug, of de bank redirect
   met een foutparameter.
3. Je landt terug op `/core/cash/connect` (rechtstreeks via de bank-redirect,
   niet via de callback-route).

**Verwacht gedrag.**
- Given een afgebroken autorisatie, When je terugkeert op de connect-pagina,
  Then blijft de `pending`-rij achter met status `pending` — geen tokens, geen
  gekoppelde rekeningen.
- Die rij is een orphan zodra jij een vólgende koppeling wél afrondt (stap 6,
  `selectOrphanConnectionIds`) — tot die tijd blijft ze onopgeruimd staan.
- De gekozen doelrekening (`target_bank_account_id` op de pending-rij) gaat
  mee verloren met de opruiming; er is geen tussentijds "voorkeur nog geldig
  voor een nieuwe poging"-hergebruik. Een nieuwe poging doorloopt de
  keuzestap opnieuw.

**Randgevallen.** Breekt de gebruiker af tijdens **onboarding** (SC-25), dan
is er geen bestaande error-parameterafhandeling voor dit specifieke pad —
`callback/route.ts` vangt dit alleen af als de callback zelf een `code`
ontving en faalde, niet als de bank helemaal niet terugkomt.

**Als we dit niet afvangen.** Verweesde `pending`-rijen stapelen zich op (het
probleem dat stap 6 in de callback nu al oplost) en de gebruiker ziet geen
duidelijke bevestiging dat er niets is gebeurd.

---

## Groep B — Levenscyclus van een bestaande koppeling

### SC-10 — Herautorisatie na 90 dagen

**Uitgangssituatie.** Je koppeling is 90+ dagen oud; de TrueLayer-autorisatie
is verlopen. Je token kan niet meer ververst worden (of de refresh faalt).

**Stappen.**
1. Bij een sync-poging refresht `sync/route.ts` het token; lukt dat niet, dan
   zet de route `bank_connections.status = 'expired'` en geeft `401 Token
   verlopen, verbind opnieuw` terug.
2. Jij herautoriseert — via het herstelpad uit SC-12.

**Verwacht gedrag.**
- Given een verlopen token, When je herautoriseert via dezelfde bank, Then
  herkent de callback de rekening via `external_account_id` (precedentie-stap
  1 — "overleeft een herautorisatie") en hergebruikt 'm zonder een nieuwe
  rekening aan te maken.
- De `target_bank_account_id`-voorkeur is door consume-once al `null` sinds de
  eerste koppeling — een herautorisatie vraagt dus **niet** opnieuw een
  doelrekening-keuze; die is bij een reconnect al bekend via
  `external_account_id`.

**Randgevallen.** Verliep de rekening tussentijds inactief geworden (SC-13),
dan hergebruikt de herautorisatie de rij wél, maar het zichtbaarheidsprobleem
van SC-13 blijft bestaan totdat dat apart wordt opgelost.

**Als we dit niet afvangen.** Zonder deze precedentie zou elke herautorisatie
een nieuwe rekening + nieuwe cash-asset aanmaken — het exacte duplicatiepad
dat de bugfix van 29 juli al dichtte, nu opnieuw open voor het
90-dagenmoment.

---

### SC-11 — Verbinding ingetrokken bij de bank (revoked)

**Uitgangssituatie.** Je trekt bij je bank zelf (niet in TriFinity) de
toestemming voor TrueLayer in, of de bank annuleert de consent.

**Stappen.**
1. De eerstvolgende sync-poging faalt met een auth-fout van TrueLayer.
2. **Vandaag bestaat er geen automatische statusovergang naar `revoked`** —
   `sync/route.ts` zet bij een refresh-fout alleen `status = 'expired'`, nooit
   `'revoked'`. Er is geen enkel codepad gevonden dat de status `revoked`
   ooit schrijft.

**Verwacht gedrag (te ontwerpen — zie open vraag 5).**
- Given een bij de bank ingetrokken consent, When TriFinity de volgende keer
  probeert te syncen, Then zou je verwachten dat dit zich onderscheidt van een
  gewone 90-dagen-expiry (bijv. andere copy: "je hebt de toestemming
  ingetrokken" vs. "je toestemming is verlopen") — maar zonder een
  `revoked`-detectiepad landt dit nu net als SC-10 op `expired`.
- Het **herstelpad** is in beide gevallen hetzelfde: opnieuw autoriseren
  vanaf de rekening (SC-12).

**Randgevallen.** Een ingetrokken consent bij de bank laat het TrueLayer-token
soms nog kortstondig geldig lijken (afhankelijk van de bank) — de eerste
faal-melding kan dus vertraagd zijn.

**Als we dit niet afvangen.** De gebruiker krijgt een generieke
"verbind-opnieuw"-melding zonder te begrijpen wérom — geen datacorruptie,
maar een onnodig verwarrend moment.

---

### SC-12 — Verbinding kwijt: herkoppelen vanuit de rekening, met indicator

**Uitgangssituatie.** Je "ING Lopende rekening" had een actieve bankkoppeling;
die is nu `expired` of `revoked` (SC-10/SC-11). Je opent de rekening op de
cashflow-pagina.

**Stappen.**
1. Je ziet op de rekening-kaart een **nieuw** icoon dat de verloren verbinding
   toont — dit bestaat vandaag nog niet: `AccountSourceIcon`
   (`components/core/account-source-icon.tsx`) kent maar twee toestanden,
   `connected` (Link2) en niet-verbonden (FileText, bedoeld voor "handmatig/
   geïmporteerd"). Een derde toestand — "was gekoppeld, nu verbroken" — bestaat
   niet.
2. Je klikt op dat icoon/de rekening en start een herkoppeling **vanuit de
   rekening zelf**, zonder opnieuw door de volledige "Bank koppelen"-wizard
   (inclusief doelrekening-keuze) te hoeven — de doelrekening is namelijk al
   bekend: déze rekening.

**Verwacht gedrag (nieuw te bouwen — zie open vraag 3).**
- Given een rekening met een verlopen/ingetrokken koppeling, When je op de
  rekening-kaart kijkt, Then zie je een visueel afwijkend icoon t.o.v. zowel
  "actief gekoppeld" als "puur handmatig".
- Given je klikt op dat icoon, When de herkoppel-actie start, Then draag je
  automatisch dezelfde rekening als doelrekening mee (geen nieuwe keuzestap
  nodig) — de bestaande precedentie (`external_account_id`) claimt 'm sowieso
  al terug, dus dit is vooral een UX-kortere weg, geen nieuwe backend-regel.

**Randgevallen.**
- Heeft de rekening ondertussen ook `is_active = false` (SC-13), dan moet de
  herkoppel-actie die tegelijk heractiveren — anders herstel je de koppeling
  op een onzichtbare rekening.

**Als we dit niet afvangen.** Zonder dit icoon en dit pad moet de gebruiker
zelf raden dat er iets mis is met een rekening die "gewoon" op de kaart blijft
staan, en de volledige wizard opnieuw doorlopen inclusief een overbodige
doelrekening-keuze.

---

### SC-13 — De gedeactiveerde-rekening-reconnect (bug van vandaag)

**Uitgangssituatie.** Je "verwijdert" een rekening in de UI. Dat is
functioneel een deactivatie: `assets.is_active = false` en
`assets.has_budget_tracking = false` op het cash-bezitting, terwijl de
onderliggende `bank_accounts`-rij blijft bestaan. Je koppelt daarna opnieuw.

**Stappen.**
1. Je herkoppelt via de wizard of via SC-12's pad; de callback herkent de
   rekening via `external_account_id` en hergebruikt 'm — koppeling en saldo
   werken.
2. Je gaat naar de cashflow-pagina om te controleren.

**Verwacht gedrag vandaag (bug).**
- Given een gedeactiveerd cash-bezitting met een actieve bankkoppeling, When
  je de cashflow-pagina opent, Then is de rekening **onzichtbaar**:
  `loadAllCashRekeningen()` in `cash-overview.tsx` filtert `cashAssets` op
  `is_active !== false` (regel 210-212) vóórdat de bank-koppelstatus wordt
  bepaald — de reconnect reactiveert het bezitting niet.
- `bank_accounts.is_active` en `bank_connection_accounts.is_active` staan
  intussen wél op `true`: saldo en (bij een sync) transacties komen wél
  binnen, maar landen op een rekening die nergens in de UI verschijnt.

**Verwacht gedrag na fix.**
- Given een reconnect op een rekening waarvan het gekoppelde cash-bezitting
  gedeactiveerd was, When de callback (of het SC-12-pad) de koppeling
  hergebruikt, Then reactiveert diezelfde stap ook `assets.is_active = true`
  (en heroverweegt `has_budget_tracking`, zie SC-22) zodat de rekening weer
  zichtbaar wordt op cashflow.

**Randgevallen.** De gebruiker "verwijderde" de rekening bewust omdat hij 'm
niet meer wilde gebruiken — een reconnect die stilzwijgend reactiveert kan dan
ongewenst zijn. Vraag naar de eigenaar: is reactiveren-bij-reconnect altijd
gewenst, of moet de UI dit expliciet bevestigen? (Geen aparte open vraag
opgenomen — dit valt samen met open vraag 3, want beide lopen via hetzelfde
herstelpad.)

**Als we dit niet afvangen.** Precies het incident van vandaag: een werkende
koppeling met kloppend saldo die de gebruiker nooit te zien krijgt — hij denkt
dat de rekening weg is, terwijl de bank 'm nog voedt.

---

### SC-14 — Een rekening later aan een andere bank koppelen

**Uitgangssituatie.** Je "ING Lopende rekening" was gekoppeld aan ING, maar je
bent overgestapt en wilt dezelfde TriFinity-rekening nu aan je nieuwe bank
koppelen (of: je koppelde per ongeluk de verkeerde bank en wilt corrigeren).

**Stappen.**
1. Je verbreekt (SC-15) of laat de oude koppeling verlopen.
2. Je start een nieuwe koppeling en kiest in de wizard dezelfde bestaande
   "ING Lopende rekening" als doelrekening, nu bij de nieuwe bank.

**Verwacht gedrag.**
- Given een doelrekening die eerder aan een andere bank hing (en nu geen
  actieve koppeling meer heeft — anders blokkeert SC-06), When je de nieuwe
  koppeling afrondt, Then hergebruikt de callback dezelfde rekening via de
  doelrekening-voorkeur (precedentie-stap 3, want `external_account_id`
  van de nieuwe bank is per definitie onbekend en `iban_hash` matcht wél op
  dezelfde IBAN als de bank die meegeeft).
- De oude, zacht ontkoppelde `bank_connection_accounts`-rij (van de vorige
  bank) blijft bestaan met `is_active = false`; er ontstaat een nieuwe,
  actieve rij voor de nieuwe bank op dezelfde `bank_account_id`.

**Randgevallen.**
- Verschilt de IBAN tussen oude en nieuwe bank niet (klant nam z'n IBAN mee
  bij overstappen, wat in NL kan) — dan matcht ook `iban_hash` en wint die
  precedentie-stap vóór de doelrekening-voorkeur, met hetzelfde resultaat.
- **Niet gedekt door `plan.md`** — dit scenario staat niet expliciet in de
  fasen; het "werkt toevallig" via de bestaande precedentieketen, maar is
  nooit als testcase benoemd. Zie sectie 3.

**Als we dit niet afvangen.** Zonder expliciete test kan een toekomstige
wijziging aan de precedentieketen dit pad breken zonder dat iemand het merkt.

---

### SC-15 — Verbinding verbreken en wat er met de data gebeurt

**Uitgangssituatie.** Je klikt "Verbreken" op een actief gekoppelde rekening.

**Stappen.** `POST /api/bank-connect/disconnect` zet
`bank_connection_accounts.is_active = false`.

**Verwacht gedrag.**
- Given een verbroken koppeling, When je daarna naar de rekening kijkt, Then
  blijven de rekening (`bank_accounts`), het cash-bezitting (`assets`) én alle
  al geïmporteerde transacties **onaangetast** — "Verbreken" is een zachte
  actie (`disconnect/route.ts` regel 25-28: "Soft disconnect: deactivate the
  connection account, keep bank_accounts and transactions").
- Het herkomst-icoon (`AccountSourceIcon`) op de kaart springt terug naar
  "handmatig" — visueel niet te onderscheiden van een rekening die nooit
  gekoppeld was, tenzij SC-12's nieuwe derde icoon-toestand er is (dan hoort
  een net-verbroken rekening daaronder, niet onder "puur handmatig").
- Het bijbehorende `bank_connections`-token blijft intact (alleen de
  account-koppeling wordt inactief, niet de hele verbinding) — bij een andere
  nog-actieve rekening op dezelfde bank blijft die verbinding dus gewoon
  bruikbaar.
- TrueLayer zelf krijgt **geen** revoke-signaal (bekend, apart vervolgpunt,
  genoemd in `callback/route.ts`-commentaar bij stap 6) — de consent bij de
  bank blijft bestaan tot ze daar vanzelf verloopt.

**Randgevallen.** Verbreek je de láátste actieve rekening van een verbinding,
dan wordt die verbinding pas bij de vólgende geslaagde callback van deze
gebruiker als verweesd herkend en op `expired` gezet (stap 6) — niet
onmiddellijk bij het verbreken zelf.

**Als we dit niet afvangen.** Niet van toepassing — dit is bestaand,
gedocumenteerd gedrag; het scenario staat hier zodat de bouwer het niet per
ongeluk "hardert" naar een destructieve verwijdering wanneer dit plan de
rondom-code aanraakt.

---

## Groep C — Synchroniseren & data

### SC-16 — Periode waarin de bank niets teruggeeft

**Uitgangssituatie.** Je klikt "Synchroniseer nu" op een rekening waar sinds
de vorige sync geen nieuwe boekingen zijn geweest.

**Verwacht gedrag.**
- Given `getAccountTransactions` levert een lege lijst, When de sync-route
  dat verwerkt, Then is `insertedCount = 0`, `duplicateCount = 0`, en
  `sync_cursor` blijft ongewijzigd (geen boeking om de datum uit te halen).
  De response `{ new: 0, duplicates: 0, ... }` moet in de UI leiden tot een
  duidelijke "niets nieuws"-melding — vandaag toont de success-pagina bij een
  sync gewoon `0 nieuw, 0 dup`, wat werkt maar kaal is.
- Het saldo wordt nog wél gesynchroniseerd (SC-24) — "niets nieuws aan
  transacties" is onafhankelijk van een saldowijziging.

**Randgevallen.** Dit telt gewoon als één van de 10 dagelijkse
sync-verzoeken, ook al levert het niets op.

**Als we dit niet afvangen.** Geen datarisico; wel een UX-risico als de
gebruiker een lege respons aanziet voor een fout.

---

### SC-17 — Sync met dagelijkse rate-limit bereikt

**Uitgangssituatie.** Je hebt vandaag al 10 keer gesynchroniseerd op deze
rekening (bijv. door herhaaldelijk klikken bij het testen van SC-02).

**Verwacht gedrag.**
- Given `dailyRequests >= 10` voor vandaag, When je nogmaals synchroniseert,
  Then krijg je `429` met `"Daglimiet bereikt (10 verzoeken per dag per
  account)"`, en wordt er een `rate_limited`-rij in `bank_sync_log` gelogd
  (bestaand gedrag, `sync/route.ts` regel 54-67).
- De teller reset bij het aanbreken van een nieuwe kalenderdag
  (`rate_limit_reset_date !== today`).

**Randgevallen.** Een automatische reconnect-sync (bijv. direct na SC-12) telt
gewoon mee in dit quotum — er is geen apart budget voor "herstel"-syncs.

**Als we dit niet afvangen.** Geen datarisico — dit is al gebouwd en getest
gedrag; opgenomen zodat de bouwer weet dat dit pad blijft werken zodra fase 3/4
extra sync-triggers toevoegen (bijv. automatisch synchroniseren na een
reconnect in SC-12).

---

### SC-18 — Token-decryptie mislukt tijdens sync (legacy-rij)

**Uitgangssituatie.** Een bankverbinding van vóór de encryptie-migratie is
nooit gebackfilld; `access_token_encrypted` ontbreekt of is niet te
ontsleutelen.

**Verwacht gedrag.**
- Given `decryptField` faalt of levert `null`, When de sync-route dat leest,
  Then krijgt de gebruiker `401 Verbinding kwijt — verbind opnieuw om weer bij
  te werken.` (`RELINK_REQUIRED_MESSAGE`) — hetzelfde bericht als een echt
  verlopen token, zodat het herstelpad (SC-12) identiek is. De copy is bewust
  neutraal over de oorzaak: "token verlopen" was jargon én benoemde een
  oorzaak die de app niet altijd kent.

**Randgevallen.** Dit pad is bewust niet onderscheidend in de foutmelding
(geen "je account is corrupt"-tekst) — de gebruiker hoeft het verschil niet te
weten, het herstelpad is toch hetzelfde.

**Als we dit niet afvangen.** Zonder deze catch zou een legacy-rij een
onafgevangen exception + 500 geven in plaats van een nette
"verbind-opnieuw"-melding.

---

### SC-19 — CSV bijladen op een gekoppelde rekening, geen overlap

**Uitgangssituatie.** Je rekening is gekoppeld aan de bank, maar de bank
levert geen historie verder terug dan 12 maanden. Je hebt oudere transacties
in een CSV van je bank staan en wilt die bijladen.

**Stappen.**
1. Je importeert de CSV via `/core/cash/import`, gekoppeld aan dezelfde
   rekening.
2. De periode van de CSV valt vóór de oudste bank-transactie — geen overlap.

**Verwacht gedrag.**
- Given geen datumoverlap tussen CSV en bestaande transacties, When je
  importeert, Then vindt dedup laag 1 en laag 2 niets, en importeren alle
  CSV-rijen als nieuw.

**Randgevallen.** Zit er tóch een dag overlap aan de randen (bank begint op
1 juni, CSV eindigt 3 juni), dan schuift dit automatisch naar SC-20.

**Als we dit niet afvangen.** Niet van toepassing — dit is het "gelukkige
pad"; opgenomen ter afbakening van SC-20.

---

### SC-20 — CSV bijladen dat overlapt met bankhistorie (cross-bron dedup, laag 2)

**Uitgangssituatie.** Zelfde als SC-19, maar de CSV-periode overlapt met al
via de bank gesynchroniseerde transacties.

**Stappen.**
1. Je importeert de CSV; de import-pagina laadt (uitgebreid, fase 2) naast
   `isDuplicate` (laag 1) ook `crossSourceDuplicate: { reason: 'iban' |
   'name' } | null` per rij.
2. Rijen die laag-2 als duplicaat herkent, komen **zichtbaar voorgedeselecteerd
   met reden** binnen — in tegenstelling tot een sync (SC-02), waar dit stil
   gebeurt, want hier is de gebruiker aanwezig.

**Verwacht gedrag.**
- Given een rij die zowel laag 1 als laag 2 raakt, When de UI 'm toont, Then
  telt hij precies één keer als duplicaat en toont de laag-1-reden (de
  striktere) — niet allebei.
- Given een cross-bron-duplicaat, When je "selecteer alles" gebruikt, Then
  blijft die rij uitgevinkt; handmatig aanvinken blijft mogelijk en leidt dan
  tot een echte insert (acceptatiecriterium (f)).
- Given een rij die door de bestaande laag-1-`contentKey`-onvolkomenheid
  (negeert `bank_seq`, zie `plan.md` fase 2 "let op") al ten onrechte als
  duplicaat gemarkeerd stond, When laag 2 evalueert, Then stapelt laag 2 daar
  niet overheen — de bekende fout blijft bestaan maar wordt niet erger.

**Randgevallen.** Zie SC-21 voor wanneer de match zelf onterecht is.

**Als we dit niet afvangen.** Zonder deze laag zou elke CSV-bijlading na een
bankkoppeling (of andersom) opnieuw het 145-duplicaten-scenario reproduceren,
nu via het import-pad in plaats van de sync.

---

### SC-21 — Cross-bron dedup faalt stil (mist een treffer, of matcht ten onrechte)

**Uitgangssituatie.** Twee varianten van hetzelfde restrisico uit `plan.md` §7.

**Variant A — gemiste match.** De bank levert geen tegenpartij-IBAN en een
tegenpartijnaam die na normalisatie sterk afwijkt van de CSV-omschrijving voor
dezelfde boeking (bijv. de bank toont een betalingsverwerker, de CSV toont de
winkelnaam).
- Given geen exacte match op IBAN of genormaliseerde naam, When de dedup
  draait, Then blijft de boeking **dubbel staan zonder signaal** — er is
  bewust geen "mogelijk duplicaat"-status (besluit 1, optie B).

**Variant B — onterechte match.** Twee pinbetalingen van hetzelfde bedrag op
dezelfde dag bij twee filialen van dezelfde winkelketen, beide zonder
tegenpartij-IBAN.
- Given `normalizeCounterparty` beide filiaalnamen naar dezelfde genormaliseerde
  string herleidt (trailing filiaalnummer wordt gestript) én bedrag+datum
  gelijk zijn, When laag 2 evalueert, Then wordt de tweede, écht-andere
  transactie ten onrechte als duplicaat gezien.
  - Bij **import** (SC-20): zichtbaar voorgedeselecteerd, de gebruiker kan het
    corrigeren door 'm alsnog aan te vinken.
  - Bij **sync** (SC-02): stil overgeslagen — dit is de **enige plek in het
    hele plan waar een echte, unieke transactie kan verdwijnen** (besluit 5,
    "de enige plek waar dit plan risico neemt").

**Als we dit niet afvangen (allebei de varianten zijn "niet afvangen"-by-design,
bewust aanvaard restrisico).** Variant A levert stille ruis; variant B kan een
legitieme uitgave laten verdwijnen bij een banksync. Beide staan met deze
consequentie expliciet in `plan.md` §7 — dit scenario herhaalt het hier zodat
de tester het als **bekend, geaccepteerd gedrag** herkent, niet als bug.

---

## Groep D — Budget & saldo

### SC-22 — Automatisch budgetteren aan bij koppelen van een rekening die dat bewust uit had staan

**Uitgangssituatie.** Je hebt "ING Spaarrekening" jaren geleden handmatig
aangemaakt met `has_budget_tracking = false` — bewust, want je wilt geen
transactiedetail op je spaarrekening in je budgetoverzicht. Je koppelt 'm nu
aan de bank.

**Verwacht gedrag — spanning met het bestaande besluit (zie open vraag 1).**
- **Eigenaarsvoorstel van vandaag (punt 2):** de doelrekening "krijgt
  automatisch budgetteren aan" — geformuleerd als iets dat gebeurt, niet als
  iets dat je bevestigt.
- **`plan.md` besluit 3 (FR9, al vastgesteld 29 juli):** geen blokkerende
  dialoog; in plaats daarvan staat in de keuzestap van de wizard (fase 3) één
  regel met een **aanvinkoptie**: "neem deze rekening mee in mijn budgetten" —
  jij beslist, het staat niet automatisch aan.
- Deze twee zijn met elkaar in spanning: "automatisch aan" (stil, gedrag
  verandert zonder handeling) vs. "een aanvinkoptie in de wizard" (zichtbaar,
  vereist een bewuste klik). Dit document lost het niet op — zie open vraag 1.

**Randgevallen.**
- Geldt dit ook voor de N-1 niet-gekozen rekeningen uit SC-04/SC-05 die
  automatisch worden aangemaakt of hergebruikt? Nieuw aangemaakte rekeningen
  krijgen vandaag al onvoorwaardelijk `has_budget_tracking: true` (bestaand
  gedrag, geen wijziging nodig). Voor hergebruikte, niet-gekozen rekeningen
  (SC-07) is er geen wizardstap om de vraag in te tonen — de vraag geldt dus
  hoe dan ook alleen voor de expliciet gekozen doelrekening.

**Als we dit niet afvangen.** Een spaarrekening die ongevraagd
transactiedetail in het budgetoverzicht krijgt, is een stille
gedragswijziging op data die de gebruiker bewust anders had ingesteld — een
kleinere, maar reële variant van "stil en onomkeerbaar".

---

### SC-23 — Budget-toewijzingen blijven staan bij hergebruik van een rekening met CSV-historie

**Uitgangssituatie.** Zie SC-02: je hebt transacties met de hand
gecategoriseerd (`budget_id` handmatig gezet, `category_source` bijv.
`'manual'`).

**Verwacht gedrag.**
- Given een bestaande transactie met een handmatige budget-toewijzing, When
  dezelfde boeking via de bank binnenkomt en dedup laag 2 'm herkent, Then
  wordt er **geen** update, merge of delete uitgevoerd op de bestaande rij —
  de nieuwe (bank-)variant wordt simpelweg niet ingevoegd. Dit is FR11 uit
  `plan.md`, met een expliciete test: "assertie op de mock: geen `.update()`/
  `.delete()` op `transactions`".

**Randgevallen.** Zou de dedup-sleutel de boeking mísen (SC-21 variant A),
dan ontstaat een tweede rij zonder `budget_id` — die telt dan apart mee in
"Ongecategoriseerd" op het cashflow-overzicht (bestaand gedrag,
`cash-overview.tsx` regel 610-616) totdat de gebruiker het handmatig opmerkt.

**Als we dit niet afvangen.** Het uitgangsprobleem van vandaag: handmatig werk
dat "in de ruis verdwijnt" zodra er een duplicaat naast komt te staan.

---

### SC-24 — Saldo-semantiek: banksaldo overschrijft een handmatig bijgehouden saldo

**Uitgangssituatie.** Je hield "ING Spaarrekening" handmatig bij met een
zelf-ingevoerd saldo (herwaardering). Je koppelt 'm nu aan de bank.

**Verwacht gedrag.**
- Given een rekening met een handmatig ingevoerd `current_value`, When de
  eerste sync het banksaldo ophaalt, Then **overschrijft** het banksaldo de
  handmatige waarde — er is bewust géén "saldo niet overschrijven"-vlag
  (besluit 3, expliciet uitgesloten).
- De wijziging is **terugleesbaar**, niet stil: elke wijziging van
  `assets.current_value` via een banksync krijgt een `valuations`-rij
  (`notes: 'bank-sync'`) plus een `balance_snapshots`-mirror — hetzelfde pad
  als een handmatige herwaardering (fase 6). Op de success-pagina zie je een
  melding "saldo overgenomen: €a → €b".
- Given het saldo ongewijzigd is (banksaldo = huidige waarde), When de sync
  draait, Then wordt er **geen** nieuwe `valuations`-rij geschreven — anders
  vervuilt elke sync de herwaarderingshistorie.

**Randgevallen.** Faalt de saldo-call zelf (TrueLayer-fout), dan blijft dat
niet-fataal: de transacties staan dan al in de database en mogen niet in een
500 verdampen (bestaand patroon, `sync/route.ts` regel 217-228).

**Als we dit niet afvangen.** Zonder de valuations-koppeling verspringt het
netto vermogen "uit het niets" zonder dat de sparkline of herwaarderingshistorie
verklaart waarom — een schending van "geen stille cijferwijziging".

---

## Groep E — Overig

### SC-25 — Bank koppelen tijdens onboarding

**Uitgangssituatie.** Je bent nieuw en koppelt je bank als onderdeel van de
onboarding-flow, vóórdat `onboarding_completed` op waar staat.

**Verwacht gedrag.**
- Given `profile.onboarding_completed === false`, When de callback slaagt,
  Then stuurt hij terug naar `/onboarding?bank_connected=1` in plaats van de
  reguliere success-pagina (bestaand gedrag, regel 384-386).
- Given tijdens onboarding is er **geen** bestaande rekening om als
  doelrekening te kiezen (je hebt nog niets aangemaakt) — de doelrekening-stap
  landt hier effectief altijd op "nieuw aanmaken", tenzij de
  onboarding-flow zelf al een standaard betaalrekening heeft aangemaakt vóór
  dit punt. **Niet geverifieerd in dit document** — de bouwer moet nagaan of
  de wizardstap uit fase 3 tijdens onboarding een zinvolle rekeningkeuze heeft
  om te tonen, of dat hij daar de "nieuw aanmaken"-optie moet vooraf-selecteren.

**Randgevallen.** Faalt de callback tijdens onboarding (SC-09-variant), dan
is er al een apart foutpad (`?bank_error=1`, regel 402-403).

**Als we dit niet afvangen.** Een doelrekening-keuzescherm met nul opties
tijdens onboarding zou een doodlopende wizardstap zijn.

---

### SC-26 — Twee synces/koppelingen tegelijk voor dezelfde doelrekening (race)

**Uitgangssituatie.** Je hebt twee tabbladen open en klikt in beide
"Synchroniseer nu" op dezelfde rekening, of je rondt in het ene tabblad een
koppeling af terwijl in het andere nog een oude sync loopt.

**Verwacht gedrag.**
- Given twee gelijktijdige sync-requests op dezelfde
  `connection_account_id`, When beide de dedup-hashes ophalen vóór de ander
  zijn inserts heeft gedaan, Then kunnen beide dezelfde nieuwe transactie als
  "niet-duplicaat" zien en **allebei** proberen te inserten — er is geen
  database-unique-constraint op `import_hash` binnen deze route die dit
  hard afvangt buiten de eerder genoemde samengestelde index
  (`transactions_import_hash_idx` op `(user_id, import_hash, coalesce(bank_seq,
  ''))`, fase 0a). Die index zou de tweede insert laten falen op een
  constraint-violation in plaats van een stille dubbele rij — **maar dat is
  alleen zo als 0a daadwerkelijk gecodificeerd is vóór dit soort races
  optreedt**, en het request-pad vangt een insert-fout hier niet expliciet af
  (`insertError` wordt alleen gelogd, niet aan de gebruiker getoond).
- Voor de koppel-race geldt SC-08 (dubbelklik) als het dichtstbijzijnde
  scenario; een race tussen twee volledig aparte browser-sessies is
  onwaarschijnlijker maar niet uitgesloten.

**Randgevallen.** De rate-limit-teller (SC-17) is niet race-safe tegen
gelijktijdige requests (read-then-write zonder lock) — twee gelijktijdige
syncs kunnen samen de 10/dag-teller met minder dan verwacht laten stijgen.

**Als we dit niet afvangen.** In het slechtste geval een dubbele transactierij
die pas via dedup laag 1/2 bij een latere sync alsnog wordt opgemerkt (maar
dan is de eerste al binnen) — een laag-frequent, moeilijk te reproduceren
randgeval. Vermeld hier zodat de tester het bewust als "bekend, lage
prioriteit" kan classificeren in plaats van het als losse bug te herontdekken.

---

## 2. Openstaande vragen voor de eigenaar

> **Alle vijf beantwoord op 29 juli 2026** — zie `plan.md` §0 (besluiten B1–B7) voor de
> vastgestelde formuleringen. Kort: vraag 1 → voorgevinkt vinkje (B2); vraag 2 →
> bevestigd, "geen extra logica" en niet "dedup uit"; vraag 3 → eigen fase mét
> reactivatie van het bezitting (B6); vraag 4 → ja, correctiemoment geldt voor élke
> gekoppelde rekening; vraag 5 → `expired` en `revoked` worden één herstelpad.
> De onderbouwing hieronder blijft staan als verantwoording.

**Vraag 1 — "Automatisch budgetteren aan" (punt 2): stil of zichtbaar-opt-in?**
Het voorstel van vandaag zegt dat de doelrekening automatisch budgetteren aan
krijgt. `plan.md` besluit 3 (al vastgesteld) zegt dat dit via een
**aanvinkoptie** in de wizard loopt — de gebruiker beslist, niets staat
stilzwijgend aan. Dat is geen taalkundig verschil maar een gedragsverschil
(SC-22).
*Aanbeveling:* houd besluit 3 aan — een vooraf-aangevinkte optie ("neem deze
rekening mee in mijn budgetten", standaard aan, uitzetbaar) verzoent beide:
het voelt als "automatisch" voor de meeste gebruikers, maar blijft zichtbaar
en omkeerbaar vóór de redirect, in plaats van een stille wijziging ná afloop
op een rekening die de gebruiker ooit bewust buiten budgettering hield.

**Vraag 2 — Betekent "nieuwe rekening = geen controle nodig" (punt 5) dat dedup laag 1 ook uitstaat?**
Standaard hash-dedup (laag 1, `import_hash`) draait vandaag al op élke sync en
élke import, ongeacht of de rekening "nieuw" is — dat is geen aparte
controle die je aan/uit zet. SC-03 en SC-19/20 laten zien dat "nieuw bij het
koppelmoment" niet betekent "nooit meer dedup nodig" (een latere CSV-bijlading
of tweede sync kan alsnog overlappen).
*Aanbeveling:* bevestig dat punt 5 betekent "geen extra logica bóven de
standaard dedup die toch al overal draait" — niet "dedup uitschakelen voor
deze rekening". Zo gelezen is er geen wijziging nodig t.o.v. `plan.md`; alleen
de formulering in het voorstel is voor een bouwer te lezen als "sla dedup
over", wat gevaarlijk zou zijn.

**Vraag 3 — Waar leeft het herkoppel-pad "vanaf de rekening" (punt 6), en reactiveert het een gedeactiveerd bezitting?**
Vandaag bestaat er geen entry point om vanaf een rekening-kaart een
herkoppeling te starten, en `AccountSourceIcon` kent geen derde
"verbinding-kwijt"-status (SC-12). Dit is dus geen bijschaving van fase 3/4
maar nieuw te bouwen UI, en het raakt meteen de bug uit SC-13 (moet
reactiveren van het cash-bezitting hierbij horen of niet?).
*Aanbeveling:* voeg dit toe als eigen fase (zie sectie 3) met twee onderdelen:
(1) een derde icoon-status op `AccountSourceIcon`/`ConnectionIndicator`
voor `expired`/`revoked`, (2) een herkoppel-actie die de doelrekening
impliciet meegeeft én het gekoppelde cash-bezitting reactiveert als dat
inactief was.

**Vraag 4 — Moet de correctiemelding op de success-pagina (fase 4, besluit 2) ook niet-gekozen rekeningen dekken?**
SC-07: een rekening die je niet bewust koos, maar die via IBAN stil aan een
bestaande TriFinity-rekening wordt gekoppeld. `plan.md` fase 4 noemt het
correctiemoment ("dit is niet de goede rekening") in de context van de
gekozen doelrekening; het is niet expliciet of dit ook geldt voor de
"bijvangst"-rekeningen uit een N-rekeningen-consent.
*Aanbeveling:* ja — toon op de success-pagina voor élke gekoppelde rekening
(niet alleen de expliciet gekozene) welke TriFinity-rekening hem draagt, met
dezelfde correctie-actie. Dat is een kleine uitbreiding op wat fase 4 al
bouwt, geen nieuwe fase.

**Vraag 5 — Bestaat de status `revoked` in de praktijk, en wie zet 'm?**
SC-11 laat zien dat er geen enkel codepad is dat `bank_connections.status`
ooit op `'revoked'` zet — alleen `'expired'` (bij een mislukte token-refresh)
komt voor. Is `revoked` een geplande, nog te bouwen detectie (bijv. via een
specifieke TrueLayer-foutcode), of een status die in de praktijk dood is en
uit de UI-copy/documentatie geschrapt kan worden?
*Aanbeveling:* als er geen concreet detectiemechanisme gepland is, behandel
`expired` en `revoked` in de UI als één herstelpad (SC-12) met neutrale copy
("verbind opnieuw") in plaats van te suggereren dat de app het onderscheid al
kent.

---

## 3. Dekking t.o.v. `plan.md` — wat een aanvulling op de bouwfasen vraagt

| Scenario | Zit dit al in `plan.md`? | Aanvulling nodig |
|---|---|---|
| SC-12 (herkoppelen vanaf de rekening + verloren-verbinding-icoon) | **Nee.** Geen enkele fase noemt een entry point op de rekening-kaart of een derde icoon-status. | **Nieuwe fase** (na fase 4, vóór fase 8): UI voor `expired`/`revoked`-indicator + herkoppel-actie vanaf `VermogenAssetCard`/cashflow. Zie open vraag 3. |
| SC-13 (gedeactiveerde-rekening-reconnect-bug) | **Nee**, en het is ook geen onderdeel van het probleem dat dit plan oplost — het is een losstaande bug in `cash-overview.tsx#loadAllCashRekeningen`. | Los oppakken via de **bug-fix-pijplijn**, of — als de eigenaar 'm liever hier meeneemt omdat SC-12 toch dezelfde code raakt — als expliciete stap in de nieuwe SC-12-fase: reactiveer `assets.is_active` bij een reconnect met inactief bezitting. |
| SC-14 (rekening later aan een andere bank koppelen) | **Impliciet gedekt** door de bestaande precedentieketen, maar **nooit als testcase benoemd**. | Voeg een test toe aan fase 4 (naast (a)–(d)): dezelfde doelrekening, twee verschillende providers na elkaar, geen dubbele rekening. Geen nieuwe code, wel nieuwe dekking. |
| SC-05 (spaarrekening/creditcard komt mee, krijgt hard `subtype: 'checking'`) | **Nee.** `plan.md` gaat uit van "de rekening" zonder accounttype-onderscheid; de code zet nu overal hard `checking`. | Vraag terug naar de eigenaar of dit scope is voor dit plan of een eigen vervolgpunt (het raakt de aanmaak-tak in fase 4, maar is een ander soort probleem — datakwaliteit, geen dedup/doelrekening). Minimaal: als **aandachtspunt** vastleggen in `lib/architecture/archimate-concerns.ts` als het niet meegebouwd wordt. |
| SC-22 (automatisch budgetteren aan — spanning met besluit 3) | **Ja, deels** — fase 3 bouwt al de aanvinkoptie (FR9/besluit 3). De **spanning met het voorstel van vandaag** (stil vs. zichtbaar) is nieuw en moet vóór de bouw van fase 3 opgelost worden. | Geen nieuwe fase — wel een expliciete bevestiging van de eigenaar vóór fase 3 start (open vraag 1), anders bouwt de coder het verkeerde gedrag. |
| SC-07 (IBAN-botsing met een niet-gekozen rekening uit de bundel) | **Deels** — de precedentieketen behandelt dit al functioneel correct (fase 4), maar de **zichtbaarheid** op de success-pagina (het correctiemoment) is niet expliciet voor dit geval genoemd. | Kleine tekst-toevoeging aan de fase 4-omschrijving van de success-pagina: dekking voor élke gekoppelde rekening, niet alleen de gekozen doelrekening (open vraag 4). |
| SC-11 (status `revoked` zonder detectiepad) | **Nee**, en dit plan introduceert het probleem ook niet — het is een bestaande leemte. | Buiten scope van dit plan houden, maar wél in de UI-copy van de nieuwe SC-12-fase rekening mee houden (neutrale "verbind opnieuw"-tekst i.p.v. status-specifieke copy die de indruk wekt dat het onderscheid bestaat). |

Alle overige scenario's (SC-01 t/m SC-04, SC-06, SC-08–SC-10, SC-15–SC-21,
SC-23–SC-26) vallen binnen wat de acht fasen van `plan.md` al beogen te bouwen
of zijn bestaand, ongewijzigd gedrag dat ter afbakening is opgenomen.
