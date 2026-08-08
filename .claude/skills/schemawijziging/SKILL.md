---
name: schemawijziging
effort: high
description: "Pijplijn voor een MIGRATIE, RLS-POLICY of BACKFILL in TriFinity — een nieuwe tabel of kolom, een gewijzigd eigenaarschap, een datacorrectie op bestaande rijen. Gebruik deze skill zodra een wijziging supabase/migrations/ raakt. Niet voor gedrag zonder schemawijziging (extend-feature / bug-fix) en niet voor een pure herstructurering van code (refactor)."
---

# Schemawijziging-pijplijn (de data verandert)

Een migratie, RLS-policy of backfill doorvoeren **zonder stil een bedrag of een grens te veranderen**. Het risico is niet dat de migratie faalt — dat merk je meteen. Het risico is dat hij slaagt en dat een saldo, een eigenaarschap of een zichtbaarheidsgrens ongemerkt verschuift. Bij een vermogensapp is dat het duurste soort fout: hij is stil, en hij is al gerepliceerd voordat iemand het ziet.

**Eerste regel — een tabel zonder RLS is een defect, en een gedraaide migratie wordt nooit bewerkt.** Corrigeren doe je vooruit, met een nieuwe migratie.

**Tweede regel — deze pijplijn herhaalt de RLS-regels niet.** Die staan in `.claude/agents/supabase-db-specialist.md` en worden dáár bewaakt; deze skill zet die agent in. Een tweede exemplaar van een RLS-regel is een toekomstig datalek.

**Derde regel — de repo is niet de database.** `supabase/migrations/` beschrijft de bedoeling, de database is de werkelijkheid. Het hek daartegen is een wérkwijze-afspraak, geen automatische controle: elke DDL op remote krijgt in dezelfde PR een migratiebestand met matchende tijdstempel (ADR 0045, besluit 4). Niets dwingt dat af — dus verifieert de agent schemafeiten live; deze pijplijn voegt alleen het procesgevolg toe (stap 3).

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`: orchestrator-rol, voortgangsritme (nooit >5 min stilte), git-hygiëne in de gedeelde werkboom, de zelfverbeterings-slotstap — en in het bijzonder **de leak-checkregel: test altijd óók de `anon`-rol** (verwacht 0 rijen én géén fout; een fout duidt op een rolset-regressie, niet op afscherming). Die regel staat daar en wordt hier niet herschreven.

## Proces

### 1. Afbakenen — `supabase-db-specialist` (+ `architect` bij een nieuw domein)
Wat verandert er precies, en **van wie is de data**: gebruiker (`user_id`) of huishouden? Welke FK's, welke indexen, is dit een nieuw domein-object? Een nieuw structureel besluit (nieuw eigenaarschapsmodel, een service-role-pad, een bewaartermijn) krijgt een ADR in `docs/adr/` — schrijf die vóór de migratie, niet erna.

### 2. Vangnet — `tester` (vóór er één regel SQL staat)
Baseline groen: `npx tsc --noEmit` + de relevante suites. Raakt de wijziging een rekenmotor of een bedrag, dan eerst een test die de **huidige** uitkomst vastlegt — anders kun je achteraf niet bewijzen dat het getal niet verschoven is.

### 3. De migratie — `supabase-db-specialist`
De agent schrijft de migratie en bewaakt zijn eigen regels (append-only, naamgeving, RLS aan, policies per operatie, indexen, RPC-hardening, en de live-verificatie van elk geciteerd schemafeit). **Scheid DDL van backfill**: aparte migraties, zodat een mislukte datacorrectie het schema niet meesleept.

**Lineage vóór je een tijdstempel kiest.** De laatste migratie ín de repo is niet noodzakelijk de laatste die gedrááid heeft: geschreven-maar-niet-toegepaste migraties stapelen zich op (deze pijplijn schrijft ze, `release` past ze toe). Zet daarom de lijst uit de database naast die van de map en noteer welke voorgangers nog openstaan — bouw je op een kolom of policy die alleen in een ongedraaide migratie bestaat, dan is jouw migratie op productie een fout, niet een uitbreiding.

### 4. Backfill — `supabase-db-specialist`, apart, idempotent, meetbaar
Alleen als bestaande rijen mee moeten. Eisen: opnieuw draaien mag geen tweede effect hebben, en je kunt vóór en ná tellen wat er geraakt is. Een backfill die je niet kunt tellen, kun je niet verantwoorden.

### 5. Leak-check — `security-specialist`
Eigenaar-isolatie (A ziet niets van B) **en** de `anon`-rol volgens het gedeelde contract. Raakt de wijziging huishouden-deling of een service-role-pad, dan is deze stap niet optioneel.

### 6. De terugweg (vóóraf opschrijven, niet "rollback")
Migraties zijn append-only: terugdraaien bestaat niet, corrigeren vooruit wel. Leg vóór het draaien vast: welke correctiemigratie herstelt dit als het misgaat, en waaraan zie je dat het misging. **Data-vernietigende stappen** (`drop column`, `drop table`) horen in een aparte, latere migratie — pas nadat de nieuwe situatie zich bewezen heeft. Weggegooide kolommen komen niet terug.

### 7. Ontsluiting — `coder` / `security-specialist`
Wordt de nieuwe data via routes ontsloten, volg dan de bestaande conventies in `CLAUDE.md`: de error-envelope + zod (`parseBody`) op mutatieroutes, en het datapad (lezen via loader/bundel, muteren via API, client-direct alleen binnen de drie afgebakende gevallen). Ook hier: verwijzen, niet herhalen.

### 8. Platen bijwerken — `architecture-docs-keeper`
De ERD is **gescand**, niet gecureerd: `npm run arch:diagram` laat de nieuwe tabel/FK vanzelf verschijnen. Handmatig niets. Raakt de wijziging een rekenmotor of een constante, werk dan wél de curatie bij (`lib/architecture/calculations.ts`) — en verwijder een opgelost aandachtspunt.

### 9. Vrijgeven — `release`
Via de release-pijplijn; dáár wordt de migratie ook daadwerkelijk toegepast. Een migratie is per definitie een kandidaat voor extra aandacht daar.

## Verwijzing

`org_plan/20-skills.md` §schemawijziging; rollen De Bouwer en De Bewaker (`org_plan/10-rollen.md`), stromen 01, 02, 03, 05, 12. Verwant: `extend-feature`, `review-pr`, `release`, `_shared/pijplijn-conventies.md`.
