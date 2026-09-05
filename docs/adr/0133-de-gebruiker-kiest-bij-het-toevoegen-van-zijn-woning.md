---
id: 0133-de-gebruiker-kiest-bij-het-toevoegen-van-zijn-woning
title: 'De gebruiker kiest bij het toevoegen van zijn woning: verkopen of niet meetellen'
status: aanvaard
date: 2026-09-05
elements: [as-vermogen, as-planning, do-bezitting, sp-registreren]
---

# 0133 — De gebruiker kiest bij het toevoegen van zijn woning: verkopen of niet meetellen

## Context

Henk (54) voegde in de onboarding zijn woning van € 425.000 toe en zag binnen
twee minuten drie verschillende vrijheidsgetallen:

| Waar | Getal | Grondslag | Gelabeld? |
| --- | --- | --- | --- |
| Eindscherm onboarding | 1 jaar 4 maanden | liquide, excl. woning | ja |
| Rondleiding, kaart 'welkom' | 9 jaar 2 maanden | netto vermogen incl. woning | **nee** |
| Rondleiding, kaart 'bezittingen' | 14 jaar 11 maanden | **bruto** bezittingen, vóór schulden | **nee** |

Een tweede gebruiker zag vijf verschillende doelbedragen tussen € 1,10 M en
€ 1,65 M. Alleen het eindscherm zei welke grondslag het gebruikte.

Twee dingen liepen hier door elkaar. Het eerste is een **label**-probleem: de
rondleidingkaarten benoemden hun grondslag niet, en één ervan vertaalde zelfs een
brúto bedrag naar vrijheidstijd. Het tweede is een **keuze**-probleem: de app
besloot stilzwijgend wat de woning van de gebruiker betekende.

Dat tweede was al bijna goed geregeld en tegelijk volledig onzichtbaar. Het
datamodel kende `profiles.housing_strategy_config` (JSONB, sinds migratie
`20260513220522`) met vier modi — `include_full`, `exclude_from_fire`,
`downsize`, `reverse_mortgage`. De onboarding schreef voor élke nieuwe gebruiker
hard `downsize / on_depletion / market` weg, op twee plekken in
`app/api/onboarding/save-own-data/route.ts`, met een spiegel-constante
`ONBOARDING_HOUSING_MODE` in `lib/freedom-ticker.ts` die er letterlijk bij zei:
*"Gaat de onboarding de strategie ooit zélf uitvragen, dan vervangt die keuze
deze constante."*

Bestaande accounts stonden er anders voor. Van 27 profielen stonden er 20 op de
KOLOMDEFAULT `include_full` — "je huis telt voor 100% mee in je FIRE-pot" — en
vijf daarvan hadden daadwerkelijk een eigen woning. `include_full` is precies de
lezing die de kritiek opriep: je kunt je huis niet opeten zolang je erin woont.
Er is bovendien geen tijdstempel dat een bewuste `include_full` onderscheidt van
een vraag die nooit gesteld is.

De labels die de expert-modus toont ("Uitsluiten van FIRE-pot",
"Opeethypotheek") zijn geen taal voor iemand die net begint.

## Besluit

**De gebruiker kiest zelf, op het moment dat hij zijn woning toevoegt, in gewone
taal.** Twee opties, geen vier:

- **Ja — ik verkoop hem ooit.** Tot die tijd kun je er niet van leven; de
  opbrengst telt pas mee op het moment van verkoop. → `downsize` /
  `on_depletion` / marktwaarde.
- **Nee — hij telt niet mee.** Je blijft er wonen; de app rekent je vrijheid uit
  zonder je huis. → `exclude_from_fire`.

Vijf gevolgen die dit besluit dragen:

1. **Geen nieuw datamodel.** Dit is een tweewegs-front op het bestaande veld.
   Geen migratie voor het schema, geen kernelwijziging, geen nieuwe constante.
   Een aparte "telt mee"-vlag op `assets` zou geen enkel getal veranderen dat
   `housing_strategy_config` niet al stuurt; `assets.net_worth_inclusion_pct`
   (eigendomsaandeel) en `assets.sale_config` lijken op dit begrip maar zijn het
   niet, en worden bewust niet hergebruikt.

2. **Eén bron voor kopij én mapping**: `lib/housing-choice.ts`, naar het patroon
   van `lib/horizon/plan-draft.ts` (ADR 0129). De onboarding, de quick-add-wizard
   en Voorkeuren delen dezelfde woorden, zodat de gebruiker zijn eigen keuze
   later herkent. De save-route schrijft geen eigen literal meer; hij consumeert
   `housingChoiceToConfig()`.

3. **De keuze is per profiel, niet per woning.** De horizon-kernel kent één
   huis-slot (`adapter/potten.ts`: de eerste actieve `eigen_huis`). Live meting
   op 5 sep 2026: nul gebruikers met meer dan één woning, nul huishoud-gedeelde
   woningen. Een keuze per woning zou een kolom én een kernelwijziging vragen
   die niemand nodig heeft.

4. **`include_full` en `reverse_mortgage` blijven bestaan als expert-modi** in
   de strategie-modal onder Voorkeuren. Ze worden een beginner alleen niet
   voorgelegd. `housingChoiceFromConfig()` leest `include_full` terug als `null`
   — "de vraag is nog niet beantwoord" — en `reverse_mortgage` als `'sell'`,
   want ook daar wordt de woning uiteindelijk verzilverd.

5. **Elk bedrag dat de woning bevat of uitsluit, benoemt dat.** Waar een
   grondslag verschilt, staat "mét je huis" of "zonder je huis" in de zin.

Voor bestaande accounts kiezen we de **backfill** (migratie
`20260905160000_backfill_woonstrategie_include_full_naar_verkopen.sql`): de vijf
huiseigenaren op `include_full` gaan naar dezelfde `downsize / on_depletion` die
nieuwe gebruikers krijgen. Dat is een gewogen keuze bóven het alternatief (een
eenmalige melding, DB-waarde ongemoeid) en is niet gratis: voor die vijf mensen
verschuiven FIRE-leeftijd, vrijheidspercentage en doelbedrag — in conservatieve
richting, maar zichtbaar. De migratie zegt dat expliciet en beschrijft de
terugweg.

Twee bijzonderheden op de rondleiding, die het label-probleem afmaken:

- **De bezittingenkaart toont geen vrijheidstijd meer.** Een bruto bedrag (vóór
  schulden) naar vrijheid vertalen is misleidend, óók mét label. Dat is precies
  hoe Henk aan 14 jaar 11 maanden kwam. Alleen het bedrag blijft.
- **De welkom-/grafiekkaart volgt de keuze.** Onder "nee" rekent hij op
  `netWorthExclHome` met "zonder je huis", consistent met wat `/toekomst` dan
  doet (ADR 0034 + ADR 0114); anders op netto vermogen met "mét je huis".

## Gevolgen

**Wat beter wordt.** De overwaarde van een huis waarin je woont wordt nooit meer
als besteedbare vrijheid geteld zonder dat je daar zelf ja tegen zei. Het open
restpunt van UR2-17 — twee doelbedragen, geen scherm dat zijn grondslag noemde —
vervalt: de app weet nu wat de gebruiker koos en kan het benoemen. En de stille
default in de save-route is een expliciete, geteste mapping geworden in plaats
van twee losse literals plus een spiegel-constante.

**Wat het kost.** Er komt een scherm bij in de onboarding, precies één keer, en
alleen voor wie een woning invoert. Twee bron-grendels moesten bewust breken:
`save-own-data/route.test.ts` asserteerde de downsize-literal letterlijk, en
`freedom-ticker.test.ts` pinde `ONBOARDING_HOUSING_MODE`. Beide zijn herschreven
naar "default bij ontbrekende keuze + mapping bij keuze" — niet omzeild.

**Wat expliciet niet verandert.** Het getal op het eindscherm van de onboarding.
`freedomTickerBasis` levert bij zowel `downsize` als `exclude_from_fire`
dezelfde grondslag `fire_pot_excl_home`; alleen `include_full` zou de teller op
netto vermogen zetten, en dat is geen keuze die de onboarding aanbiedt. De
teller blijft dus monotoon. Er verschuift ook geen enkele waarde in de gouden
matrix — dit is een keuze- en labelwijziging, geen rekenwijziging.

**Het risico dat blijft.** De keuze staat per profiel, maar de SELECT-policy op
`assets` is huishoud-gedeeld. Een oppervlak dat de housing-context afleidt zonder
eigen `.eq('user_id', …)` kan de woning van de partner meenemen. Dat is vandaag
latent (nul gedeelde woningen) en is bij `app/api/housing-strategy/route.ts` in
dezelfde ronde gerepareerd, maar het is een klasse fout die terug kan komen: RLS
scopet hier niet, het oppervlak moet het zelf doen.

**Nummering.** Deze ADR heette in de analyse 0131; dat nummer en 0132 werden
tijdens dezelfde drain-run door andere kaarten bezet. Verwijzingen naar
"ADR 0131 (woning-keuze)" in kaartteksten van 5 sep 2026 slaan op dít document.
