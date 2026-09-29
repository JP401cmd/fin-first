---
id: 0189-het-beheerdashboard-ordent-op-beheervraag
title: 'Het beheerdashboard ordent op beheervraag: een ontbrekende meting is nooit gezond, en er is geen samengestelde score'
status: aanvaard
date: 2026-09-29
elements: [do-meta, t-platform, t-supabase, t-aigateway]
---

# 0189 — Het beheerdashboard ordent op beheervraag

De startpagina van beheer is een dashboard dat antwoord geeft op vijf vragen: wat
vraagt nu aandacht, hoe staat elk onderdeel ervoor, welke kant gaat het op, wat is
er veranderd, en wat kan dit dashboard niet zien. Het leidt alles af uit bestaande
bronnen en bestaande grenzen; het voert geen eigen norm in.

## Context

`/beheer` was een tegelpagina: per beheerscherm een tegel, met op enkele tegels een
teller. Wie wilde weten of er iets mis was, moest de schermen langs. De signalen
bestonden al (taakgezondheid, AI-storing, foutsoorten, webprestaties, gebruik met
k-onderdrukking, het auditlog), maar elk op zijn eigen scherm, met zijn eigen
periode en zonder onderlinge rangorde.

Vier dingen maakten een gewoon "statusbord" onbetrouwbaar:

- een bron die niet te lezen is, levert een lege set op; een teller toont dan 0 en
  dat leest als "niets aan de hand";
- één storing laat op meerdere schermen iets zien (een AI-storing geeft ook
  foutregels; een ontbrekende `CRON_SECRET` legt alle taken stil);
- een release draagt alleen een datum, geen tijdstip van uitrol;
- elke leesactie heeft een bovengrens, en een afgekapte set ziet eruit als een
  volledige.

## Besluit

1. **Indeling naar beheervraag, niet naar scherm.** Aandacht → Status per onderdeel →
   Ontwikkeling → Ingrepen → Alle beheerschermen → Verantwoording. Niet elk
   beheerscherm krijgt een plek; een scherm verschijnt alleen als het een van de
   vragen helpt beantwoorden. De volledige lijst schermen blijft onderaan staan.
2. **Eén gedeelde weergave, met een filter.** Er is één beheerrol (`superadmin`).
   Technisch en functioneel beheer is een leeswijzer, geen autorisatie. Elk signaal
   draagt zijn domein; de aandachtslijst is daarop te filteren. Het filter wordt niet
   onthouden en zegt altijd hoeveel signalen buiten beeld staan en hoeveel daarvan
   dringend: een filter dat blijft hangen, zou een kritiek signaal uit beeld houden.
3. **Zes meetstatussen, en een ontbrekende meting is nooit gezond.** `gezond`,
   `afwijkend`, `geen-gegevens`, `verouderd`, `meting-mislukt`, `nvt` (plus `laden`
   als schermtoestand). Een loader geeft `Bron<T>` terug: `ok`, `fout` of
   `niet-uitgerold`. Een dag buiten het leesvenster is `null`, geen 0. Status staat
   altijd in tekst en teken, niet alleen in kleur. De kop zegt alleen "zonder
   afwijkingen" als geen enkele regel in de statustabel afwijkt.
4. **Geen eigen alarmgrenzen.** Elke drempel komt uit de code die hem al droeg
   (`deriveJobHealth`, `deriveAiHealth`, `WEB_VITAL_THRESHOLDS`,
   `USER_REPORT_SYNC_MAX_ATTEMPTS`, de klasse-indeling van nieuwsbronnen). Waar geen
   norm bestaat (foutvolume, AI-kosten, servertijd) toont het dashboard het verloop
   zonder oordeel en noemt het dat gat in de Verantwoording.
5. **Geen samengestelde gezondheidsscore.** Een gewogen cijfer verbergt welk onderdeel
   afwijkt en vraagt om gewichten die nergens op rusten. De oordeelzin telt alleen
   wat er in de lijst staat.
6. **Eén incident, één regel.** AI-foutsoorten vallen onder de AI-storing of onder de
   noodschakelaar; taken op hetzelfde cron-pad vormen één regel; een ontbrekende
   `CRON_SECRET` neemt de stille taken op (stil = geen enkele recente uitvoering). De
   rangorde is ernst, dan gebruikersimpact, dan duur. Getelde gebruikers gaan daarbij
   vóór andere eenheden: vijftig e-mails zijn niet "meer" dan drie gebruikers.
7. **Alleen een verse meting mag iets beweren.** Een signaal dat op een oude ronde rust
   (bereikbaarheid, nieuwsbronnen) vervalt; de achterstallige taak staat dan zelf in
   de lijst. De bereikbaarheidsmeting is daarbij een meting en geen gewone taak: haar
   uitvoering eindigt op `error` zodra een dienst onbereikbaar is. Voor haar versheid
   telt daarom de laatste uitvoering, ongeacht de status. Anders zou een storing van
   meer dan een dag als "verouderde meting" tonen op het moment dat ze het meest zegt.
8. **Afgekapt is geen volledig.** Elke leesactie met een bovengrens meldt het als die
   grens is geraakt (foutenlogboek, banklogboek, AI-aanroepen, audit-trail). Aantallen
   uit een afgekapte set heten "minstens"; een totaal over een niet volledig gelezen
   periode wordt niet getoond.
9. **Impact naast techniek, met de eenheid erbij.** Betrokken gebruikers is een
   ondergrens zolang er foutregels zonder gebruiker bestaan, en staat er zo.
10. **Voor en na is een waarneming.** Rond een ingreep staat de week ervoor tegenover
    de week erna. De dag zelf telt bij geen van beide mee (het tijdstip van uitrol is
    onbekend) en het aantal andere ingrepen in hetzelfde venster staat erbij. Het
    dashboard noemt nergens een oorzaak.
11. **Gebruik, geen inhoud (ADR 0146).** De loader leest metakolommen en tellingen.
    Een gebruikers-id stopt in de loader: een foutregel draagt daarna een volgnummer
    dat alleen binnen die ene lezing geldt. Het doel van een beheeractie staat er
    alleen bij als het een instelling is.
12. **Operationele impact valt buiten de k-onderdrukking.** De gebruikscijfers blijven
    onderdrukt onder k = 5 (ADR 0153). De telling "bij hoeveel gebruikers ging dit
    mis" niet: of een fout één of veertig gebruikers raakt, is precies wat de
    beheerder moet weten, en "< 5" zou die vraag onbeantwoord laten. Er gaat geen
    identiteit mee, het scherm is alleen voor de beheerrol, en `/beheer/errors` toont
    met de foutmelding en de URL al meer dan een aantal.
13. **Instellingen uit de omgeving tellen alleen op productie.** `CRON_SECRET`, de
    e-mailprovider en het meldkanaal zijn instellingen van de server waarop het
    scherm draait. Op een ontwikkel- of voorbeeldomgeving zeggen ze niets over
    productie; het scherm beoordeelt ze daar niet en zegt dat erbij.
14. **Doorklik behoudt de selectie.** Het dashboard linkt naar het bestaande scherm met
    de foutsoort, de context, de actie of de periode in de URL. Parameters worden
    tegen een vaste lijst of een strikte vorm gehouden; het dashboard zelf muteert
    niets.
15. **Bediening rekent niets uit.** Aanwijzen, vastzetten, filteren en sorteren
    gebeuren in de browser op cijfers die de server heeft geteld en opgemaakt. Een
    keuze op het scherm verandert geen getal.

## Gevolgen

- De logica die op de schermen zelf stond, is naar `lib/` verhuisd en wordt door
  scherm en dashboard gedeeld (`lib/job-health-loader.ts`,
  `lib/beheer/koppelingen-tellingen.ts`, `lib/news-bron-gezondheid.ts`,
  `lib/admin-audit-labels.ts`). Eén definitie per begrip.
- `lib/beheer/dashboard/` is puur op `loader.ts` na; regels en reeksen zijn te toetsen
  zonder database.
- De poort `lib/beheer/geen-inhoud.test.ts` scant `app/(app)/beheer/**`,
  `components/app/beheer/**` en `lib/beheer/**`, en dekt daarmee de loader, de pagina
  en de koppelingentellingen. Buiten die poort vallen de helpers die het dashboard
  aanroept maar die elders wonen (`lib/job-health-loader.ts`,
  `lib/error-groups-loader.ts`, `lib/beheer-inbox-counts.ts`,
  `lib/ai/ai-health-loader.ts`) en de dynamische tabelnaam in de
  koppelingentellingen. Voor die lezingen bewaakt
  `lib/beheer/dashboard/loader.test.ts` de lijst van tabellen. Een nieuwe tabel in
  het dashboard vraagt een bewuste toevoeging in die test.
- Een foutmelding die via `/api/log-error` binnenkomt, kan geen servercategorie meer
  claimen (`lib/observability/client-context.ts`). De AI-gezondheid en de telling van
  mislukte AI-aanroepen rusten op de context `ai:`; die was langs die route door elke
  ingelogde gebruiker te zetten.
- De leesvensters op `error_logs` en `bank_sync_log`, en de lezing van de
  AI-gezondheid, hebben een bovenkant: nu, plus een kleine marge voor klokverschil
  (`lib/observability/leesvenster.ts`). In die tabellen mag een ingelogde gebruiker
  zelf schrijven en kiest hij dan ook het tijdstip. Rijen met een datum in de toekomst
  zouden anders voor altijd bovenaan staan.
- Geen trechter: onderdrukte cohortcellen tellen niet op, dus een trechter zou
  getallen tonen die niet bestaan.
- De grafieken zijn op de server getekende blokken met een tabelweergave ernaast;
  alleen het aanwijzen draait in de browser.

## Wat open blijft

- Er is geen tijdstip van uitrol. Zolang dat ontbreekt, blijft de dag van een release
  buiten elke vergelijking.
- Veel wijzigingen in instellingen komen niet in het auditlog. Ze ontbreken dus ook
  onder Ingrepen.
- Voor foutvolume, AI-kosten en servertijd bestaat geen norm. Het dashboard kan daar
  geen afwijking melden.
- **De tabel `error_logs` staat aan de schrijfkant nog open.** De policy laat een
  ingelogde gebruiker rechtstreeks een eigen rij invoegen, buiten `/api/log-error` om,
  met een zelfgekozen context en tijdstip. De afscherming in de route en de bovenkant
  van de leesvensters beperken de schade, maar een rij met de context `ai:` en het
  tijdstip van nu telt nog steeds als mislukte AI-aanroep. Het slot hoort op de tabel:
  een policy die de servercategorieën weigert en een kolomrecht zonder `created_at`.
  Dat is een eigen schemawijziging. Hetzelfde geldt voor `bank_sync_log`, dat alleen de
  server zou moeten schrijven.
- Er is geen begrenzing per gebruiker op het aantal foutregels. Wie veel regels
  instuurt, kan echte fouten uit het leesvenster van het foutenlogboek drukken; het
  dashboard zegt dan wel dat het venster is afgekapt.
