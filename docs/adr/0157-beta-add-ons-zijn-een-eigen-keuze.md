---
id: 0157-beta-add-ons-zijn-een-eigen-keuze
title: 'In de beta zijn AI en de bankkoppeling een eigen keuze: dezelfde add-on, zelf aan te zetten'
status: aanvaard
date: 2026-09-17
elements: [t-aigateway, as-coach, t-bankconnect, sp-registreren]
---

# 0157 — Beta-add-ons zijn een eigen keuze

AI en de bankkoppeling worden straks betaalde add-ons (`lib/subscription-catalog.ts`).
Zolang TriFinity in beta is, zet de gebruiker ze **zelf** aan of uit. Het
moment waarop dat gebeurt is het moment waarop iemand de functie wil gebruiken:
een popup legt uit "straks een abonnement, nu een keuze", met een schakelaar die
uit staat. Bij AI klapt de privacyverklaring pas open als die schakelaar aan gaat.

## Context

- Alle cloud-AI stond al achter `checkTierGate('ai')` (V-002); de add-on werd
  alleen door de beheerder toegekend (15 van 29 profielen). Voor de rest van de
  testers was AI dus onbereikbaar, met een upsell naar een "Binnenkort"-sheet.
- De bankkoppeling controleerde geen add-on. De drie gebruikers met een actieve
  koppeling hebben geen `connected`.
- ADR 0155 vroeg de AI-toestemming van íédereen: als eerste onboardingstap met
  de volledige privacyverklaring, en als blokkerende overlay bij het eerste
  bezoek. De eigenaar wil die verklaring pas zien bij wie AI aanzet.

## Besluit

1. **De schakelaar schrijft de add-on zelf.** `POST /api/beta/addon` zet `ai` of
   `connected` in `profiles.active_subscriptions` (+ `commercial_tier` in sync).
   Elke bestaande gate blijft ongewijzigd de bron. Er komt geen tweede toegangsvlag.
2. **Service-role, smal begrensd.** De trigger `guard_profiles_role` weigert
   `authenticated` terecht. De route is de enige uitzondering: alleen zolang
   `BETA_SELF_SERVE_ADDONS` aan staat, alleen de eigen rij (`claims.sub`), alleen de
   twee add-ons (andere entries blijven), en met een regel in `tier_assignments_log`
   (`assigned_by` = de gebruiker zelf, `new_tier` met "(beta-keuze)").
3. **AI aan = eerst toestemming.** De route legt eerst `granted` vast
   (`recordAiConsent`, dezelfde schrijfvolgorde als `POST /api/consent/ai`). Pas
   daarna gaat de add-on aan. AI uit haalt de add-on weg en legt `withdrawn` vast.
4. **Eén body, twee hosts.** `BetaAddonChoice` bevat de beta-uitleg, de schakelaar
   (effect · waarom) en, bij AI en alleen als hij aan staat, `AiConsentFacts`. Die
   body draait in de popup `BetaAddonDialog` — geopend vanuit de gedeelde
   `AiSubscriptionUpsell` (±15 AI-ingangen), vanuit de koppelwizard en vanuit
   `/mijn/account`, waar een actieve add-on ook direct uit te zetten is.
5. **De onboarding stelt géén AI-vraag** (aanvulling 17 sep, na de eerste uitrol).
   Ze gebruikt zelf nergens AI — de pensioenstap biedt daar bewust alleen XML/JSON
   — dus de vraag vooraan ontgrendelde niets en stond vóór de naam. De stap
   `ai_keuze` is verwijderd; een opgeslagen concept dat er nog op stond heelt naar
   `naam`. Het keuzemoment van ADR 0155 is daarmee de popup bij het eerste
   AI-gebruik. De bankstap opent de Connected-popup op het moment dat iemand op
   "Koppel mijn bank" drukt, en probeert daarna direct opnieuw te koppelen.
6. **De blokkerende overlay vraagt alleen wie AI al heeft.** De (app)-layout toont
   `AiConsentInterstitial` alleen bij een `ai`-add-on zonder (actuele) keuze. De
   rest krijgt de verklaring bij het aanzetten.
7. **Server-check op nieuwe koppelingen.** `POST /api/bank-connect/auth-link` geeft
   403 `connected_required` zonder `connected`, vóór elke schrijfactie. Het
   herstelpad (`relink_connection_account_id`) en sync blijven vrij: een bestaande
   koppeling mag na 90 dagen niet onherstelbaar worden.

## Gevolgen

- Zodra Polar live gaat, zet `BETA_SELF_SERVE_ADDONS = false` de zelfbediening
  uit. De route geeft dan 403 `beta_closed` en de oppervlakken tonen weer de
  abonnements-upsell. **Open besluit voor dat moment:** wat er gebeurt met de
  add-ons die in de beta zelf zijn aangezet. Ze zijn terug te vinden via
  `tier_assignments_log.new_tier like '%(beta-keuze)'`.
- **Punten uit de security-review van 17 sep, dezelfde dag opgelost:**
  1. *Herstelpad.* Zonder `connected` maakt de callback niets nieuws meer aan, op
     élk pad. Hij leunt daarbij bewust niet op `link_intent`: die kolom staat onder
     een eigen-rij `FOR ALL`-policy en is door de gebruiker zelf te wijzigen (de
     release-gate vond dat). Alleen een rekening die hij via `external_account_id`
     al kent wordt hersteld; extra aangevinkte rekeningen of een andere bank worden
     overgeslagen. Prijs: geeft de bank bij de nieuwe consent een ander
     rekening-id, dan faalt het herstel voor wie geen `connected` heeft (`geen_koppeling`).
  2. *Rate-limit.* Maximaal 20 beta-wijzigingen per uur per gebruiker, geteld uit
     `tier_assignments_log` zelf (geen extra tabel). Faalt de telling, dan weigert de route.
  3. *Noodstop.* De UI leest `NEXT_PUBLIC_BETA_SELF_SERVE_ADDONS` (standaard aan).
     `app_settings.beta_addons_closed = 'true'` sluit de route direct, zonder deploy.
     Koppelwizard en onboarding vallen dan terug op een foutmelding en de gewone
     toestemmingsvraag.
  4. *AVG-export.* `/api/account/export` neemt de eigen rijen uit
     `tier_assignments_log` mee (op `target_user`). Het id van een beheerder zit er
     niet in, alleen `gekozen_door: zelf | beheer`.
  5. *Atomair.* Migratie `20260917160000_beta_set_addon_rpc.sql`: de RPC
     `beta_set_addon` (security definer, alleen `service_role`) past
     `active_subscriptions` en `commercial_tier` aan en schrijft de logregel in één
     transactie, met een rijlock. **Half opgelost:** `app/api/admin/tier-assign`
     schrijft nog lezen-aanpassen-schrijven in JS, dus een beheertoekenning kan een
     beta-keuze nog overschrijven (andersom niet meer).
- **Nog open, klein (release-gate 17 sep):**
  - De rate-limit telt eerst en schrijft daarna. Een burst parallelle verzoeken
    komt er dus iets boven. Oplossing: de telling in de RPC doen, onder de rijlock.
  - `bank_connections.status`, `link_intent` en `provider_id` zijn door de client
    te schrijven (eigen-rij `FOR ALL`, zonder `WITH CHECK`). Toegang leunt er niet
    meer op, maar een guard-trigger of kolomrechten horen er alsnog bij.
  - `tier_assignments_log.assigned_by` verwijst zonder `ON DELETE`-regel naar
    `profiles`. Een accountwis werkt nu alleen omdat de cascade-trigger op
    `target_user` toevallig eerst vuurt. `deleteAllUserData` moet die rijen
    expliciet wissen, of `assigned_by` krijgt `ON DELETE SET NULL`.
- De toestemming van ADR 0155 blijft het bewijs. Alleen het vraagmoment
  verschuift, en de bron `interstitial` dekt nu ook de popup.
- De drie bestaande koppelingen zonder `connected` blijven synchroniseren en
  herstellen. Een nieuwe koppeling vraagt de keuze.
- AI-kosten: beta-gebruikers vallen met de add-on onder het creditbudget voor
  AI-gebruikers (`lib/ai/credit-gate.ts`). Dat budget is nog steeds de rem.
- Eén migratie (de RPC hierboven). Geen wijziging aan `/privacy`, `/voorwaarden` of `/wft`.
