---
id: 0036-partner-privacy-in-db-functie
title: Partner-privacy wordt in de SECURITY DEFINER-functie zelf afgedwongen
status: aanvaard
date: 2026-07-11
elements: [as-huishouden, do-huishouden]
---

De partner-privacy-instelling `hidden` wordt afgedwongen **in de
SECURITY DEFINER-DB-functies zelf**, niet bij elke afnemer apart. Concreet:
`household_partner_totals()` gate't sinds migratie `20260711160000` de
assets/debts-totalen per categorie via `get_partner_privacy_level`
(`hidden` => 0), precies zoals `household_partner_items()` dat al deed. Een
nieuwe consument van deze RPC's kan daardoor geen partner-privé-vermogen meer
lekken, ongeacht of hij de privacy-check kent.

## Context

Een securityreview (2 jul 2026) vond dat `household_partner_totals()` de
partner-totalen *onvoorwaardelijk* teruggaf. Omdat de functie `SECURITY
DEFINER` is, omzeilt zij de RLS — dit is het enige pad waarlangs
partner-persoonlijk vermogen ongefilterd de RLS-grens passeert. De
privacy-afdwinging lag hand-gerold bij de énige consument
(`lib/dashboard-data-loader.ts`), die na de RPC zelf `partnerAssets = 0` zette
wanneer de partner `assets: 'hidden'` had. Dit is dezelfde faalklasse als het
eerder gedichte superadmin-RLS-lek (ADR 0006): elke vergeten poort bij een
toekomstige afnemer = een lek.

Het correcte, veiligere patroon stond er al naast: `household_partner_items()`
(en `household_partner_life_events()`, `household_member_profiles()`) dwingt de
privacy binnen de functie af via `auth.uid()` + `get_partner_privacy_level`.
`household_partner_totals()` was de enige achterblijver.

## Besluit

Richting 1 (afdwinging in de DB-functie) boven Richting 2 (centrale
TS-loader + lint/grep-guard tegen directe `.rpc`-calls):

- **Structureel onmogelijk te omzeilen** — ook door nieuwe TS/SQL-callers; de
  defense-in-depth die de faalklasse dicht. Een conventie-guard (Richting 2)
  kan verlopen; een DB-gate niet.
- **Minimaal** — één `CREATE OR REPLACE`-migratie (identieke returnsignatuur,
  behoudt de grants uit `20260611130000`) + verwijderde dode zeroing in de
  loader. Geen consument-type wijzigt.
- **Consistent** — spiegelt het reeds bewezen `household_partner_items`-patroon
  → één afdwing-conventie i.p.v. twee.

Semantiek (geverifieerd tegen `household_partner_items`): per categorie
onafhankelijk. `hidden` => categorie volledig 0; `full`/`totals` zijn
equivalent voor een scalar-totalen-functie (geen itemisatie). `net_worth =
gated_assets − gated_debts`.

`box2`/`box3`-routes lekken niet en blijven ongemoeid: zij draaien op de
RLS-client (`createClient()`, geen service-role) en de RLS op `assets`/`debts`
stelt geen partner-persoonlijke rijen bloot. Hun `partnerHidesVermogen`-gate
draait per definitie op een lege set. (De separate correctheids-gap — box2/box3
*onder*-rapporteren partner-vermogen omdat ze het nooit tonen — is géén lek en
staat op een aparte kaart, buiten deze scope.)

ADR 0006 (beheer via service-client) blijft ongemoeid: dit pad draait op de
anon/authed RLS-client, niet service-role.

## Gevolgen

- `lib/dashboard-data-loader.ts` hertoepassen geen `hidden`-check meer; de
  `partnerHiddenCategories`-labeling (voor de widget-renderer) blijft.
- De invariant is geborgd met regressietests in
  `lib/regression-tests/suites/identiteit-household.ts`
  (`household-partner-totals-privacy-in-db`,
  `household-partner-privacy-single-enforcement-doc`).
- Drift-noot: `household_partner_items()` bestaat alléén remote (nooit in een
  repo-migratie ge-`CREATE`'t, enkel grants). `household_partner_totals()` stond
  nog met de oude, ongegate definitie in `20260218000001` en
  `scripts/apply-household-migration.mjs`; migratie `20260711160000` wint op
  volgorde.
- Optionele vervolgstap (buiten scope): `household_partner_totals` volledig
  uitfaseren t.g.v. `household_partner_items('assets'/'debts')`-aggregaten en de
  functie DROPpen → één partner-databron. Raakt het FIRE-summary-pad; apart
  voorstellen.
