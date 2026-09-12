---
id: 0140-een-hypotheek-is-een-groep-leningdelen
title: 'Een hypotheek is een groep leningdelen, geen aparte tabel'
status: aanvaard
date: 2026-09-12
elements: [as-vermogen, as-belasting, as-planning, do-bezitting, t-supabase]
---

Een Nederlandse hypotheek bestaat vrijwel altijd uit meerdere **leningdelen**:
losse leningen onder één hypotheekschuld, elk met een eigen rente,
aflossingsvorm en rentevaste periode. We modelleren dat met een nullable
`parent_debt_id` op `public.debts` — een zelfverwijzing die bestaande rijen
groepeert. **Niet** met een aparte `debt_parts`-tabel. De hoofdrij is daarbij
zélf een leningdeel en draagt nooit het groepstotaal.

## Context

`public.debts` draagt per rij alles wat een leningdeel nodig heeft:
`current_balance`, `interest_rate`, `repayment_type`, `fixed_rate_end_date`,
`monthly_payment`, `is_tax_deductible`, `linked_asset_id`, `nhg`,
`partner_split_pct` (geverifieerd tegen `information_schema.columns`,
12-09-2026). Een gebruiker met drie leningdelen kon die dus al invoeren — als
drie ongerelateerde hypotheken. Wat ontbrak was uitsluitend de **groepering**:
het feit dat die drie rijen samen één hypotheek op één woning zijn.

Belangrijker nog: de rekenmotoren tellen vandaag al correct op over meerdere
hypotheekrijen. Geverifieerd in de code (12-09-2026):

- `lib/box1-income.ts` (regel 156-158) filtert hypotheken op
  `linked_asset_id === eigenHuis.id` en **reduceert** de geschatte jaarrente
  over alle treffers.
- `lib/housing-strategy.ts` (regel 317-338) somt `mortgageBalance` en
  `mortgageMonthlyPayment` over álle hypotheken op het eigen huis, en
  `projectMortgageDetailsAt` amortiseert **per rij** — dus met de eigen
  `repayment_type` en rente van dat deel.
- `lib/horizon-kernel/adapter/potten.ts` (regel 426-432) wijst álle
  eigen-woning-hypotheken hetzelfde gedeelde `HYPOTHEEK_SLOT` toe. De kernel
  behandelt ze dus nu al als één pot.
- `lib/debt-data.ts` (`amortizationSchedule`, `computeRenteAflossingsSplit`,
  `debtProjection`) werkt integraal per `Debt`-rij.

Er was dus geen rekenprobleem op te lossen, alleen een modelleer- en
presentatieprobleem.

## Besluit

**Eén nullable `parent_debt_id uuid` op `debts`.** Elk leningdeel blijft een
volwaardige schuld-rij; de verwijzing groepeert ze onder één hypotheek.

**Waarom geen aparte `debt_parts`-tabel.** Die zou vrijwel de hele
`debts`-kolommenset moeten dupliceren, plus de RLS-policies, de
huishouddeling (`ownership`/`household_id`), de partner-split en het
`source`-contract van de import. En ze zou elke bestaande motor dwingen twee
bronnen samen te voegen die nu één lijst zijn — precies de drift die
"consume, don't recompute" moet voorkomen. De winst (een expliciete
hypotheek-entiteit) weegt niet op tegen een tweede, half-parallelle
schuldentabel.

**De hoofdrij is zélf een leningdeel.** Hij draagt alleen zijn eigen saldo,
nooit het totaal van de groep. Dit is de harde invariant van dit model: omdat
alle vier de motoren hierboven álle mortgage-rijen optellen, zou een hoofdrij
met het groepstotaal elk bedrag dubbel tellen — stil, en in drie oppervlakken
tegelijk. Precies daarom verandert deze migratie geen enkel bestaand bedrag.

**Eigenaarschap is referentieel afgedwongen, niet beloofd.** De FK is
samengesteld: `(parent_debt_id, user_id)` verwijst naar `(id, user_id)`. De
INSERT-policy op `debts` toetst alleen `user_id` en zegt niets over de
*waarde* van `parent_debt_id`; zonder deze vorm kon een gebruiker naar de rij
van een ander wijzen. Referentiële integriteit geldt ook voor
service-role-schrijfpaden, die RLS wél passeren.

**`ON DELETE SET NULL (parent_debt_id)`.** Een hoofdrij verwijderen laat de
delen staan als zelfstandige hypotheken — de situatie van vóór dit besluit,
zichtbaar en herstelbaar. `CASCADE` is verworpen omdat het stil rijen met elk
tienduizenden euro's openstaande schuld zou vernietigen, langs RLS heen en
onomkeerbaar. `RESTRICT` is verworpen omdat het een legitieme verwijdering met
een harde DB-fout laat stranden. De kolomvorm van `SET NULL` is nodig omdat de
FK samengesteld is en `user_id` NOT NULL is.

**Maximaal één niveau diep, cyclus uitgesloten.** Zelfverwijzing via een
`CHECK`; de diepte via een `BEFORE`-trigger met twee regels (de hoofdrij van
een deel mag zelf geen deel zijn, en een rij die al delen draagt mag geen deel
worden). Samen sluiten die elke cyclus uit: een cyclus vereist een keten van
diepte ≥ 2.

**Delen dragen dezelfde woning als hun hoofdrij**, bewaakt door een
`DEFERRABLE INITIALLY DEFERRED` constraint-trigger. Het besluit "woning en NHG
horen op hypotheekniveau" is een uitspraak over *waar je het invult*, niet over
*waar het staat*: zouden delen `linked_asset_id` leeg krijgen, dan vallen ze
stil uit alle drie de eigen-woning-aggregaties hierboven en valt de renteaftrek
te laag uit. Uitgesteld tot commit, omdat de invariant wederzijds is en er
anders geen geldige volgorde bestaat om de woning van een gegroepeerde
hypotheek te wijzigen. Bewust gekozen boven een cascade-trigger die de delen
meeschrijft: `trg_stamp_household_id` leidt `household_id` af uit `auth.uid()`,
dus een verborgen schrijfactie vanuit een service-role-context zou het
huishouden van de delen kunnen wissen. Een luide weigering is hier veiliger dan
een stille correctie.

**Geen backfill.** Bestaande losse hypotheekrijen worden niet automatisch aan
elkaar geknoopt; de app stelt samenvoegen vóór en de gebruiker bevestigt.
Meting op productie (12-09-2026): een handvol actieve `mortgage`-rijen,
verdeeld over evenzoveel gebruikers, en **geen enkele gebruiker met meer dan één
hypotheekrij op dezelfde woning** (exacte aantallen bewust niet hier — publieke
repo, ADR 0111). Er is vandaag dus geen stapel om op te ruimen — de samenvoeg-suggestie
is vooruitkijkend, niet herstellend.

## Gevolgen

Wat er **niet** verandert: geen bedrag, geen motor, geen loader. Zonder
groepering rekent de app precies zoals hij nu rekent, en mét groepering ook.

Wat een latere snede nog moet doen:

1. **Renteaftrek per deel.** Eigenaarsbesluit 3 (overgangsrecht voor een
   aflossingsvrij deel van vóór 2013) vraagt geen nieuwe kolom —
   `debts.is_tax_deductible` bestaat al. Maar `lib/box1-income.ts` **selecteert
   die kolom niet eens** (regel 191 haalt alleen `linked_asset_id`,
   `current_balance`, `interest_rate` op) en telt dus de rente van een
   niet-aftrekbaar deel gewoon mee. Dat is een bestaande onnauwkeurigheid die
   met leningdelen zichtbaar wordt.
2. **UI-groepering.** Eén pil per hypotheek met het totaal, delen zichtbaar bij
   openklappen. De som over de groep is een weergave-optelling van de delen —
   nooit een veld op de hoofdrij.
3. **Samenvoeg-suggestie.** Detecteer meerdere `mortgage`-rijen op dezelfde
   woning, stel groeperen voor, laat de gebruiker bevestigen.
4. **Woning wijzigen in één transactie.** Door de deferred constraint moet een
   woning-wijziging op een gegroepeerde hypotheek via één RPC, niet als losse
   PATCH-verzoeken.
5. **Hypotheekplanner over delen.** `has_hypotheekplanner_tracking` en
   `hypotheekplanner_strategy` staan per rij; op groepsniveau moet bepaald
   worden of de strategie per deel of per hypotheek geldt.
6. **ERD-weergave.** Dit is de eerste zelfverwijzende FK in het schema; de
   ERD-renderer heeft nog nooit een edge met `from === to` getekend. De
   modellaag (`lib/architecture/db-model.ts`) verwerkt hem correct, maar de
   visuele weergave verdient een blik bij de release.
