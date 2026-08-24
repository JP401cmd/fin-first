# Lokale teststack — de app écht gebruiken vanuit een cloud-sessie

Deze route bestaat zodat een Claude Code-sessie (web/cloud) de app **als gebruiker**
kan doorlopen: inloggen, onboarden, gegevens invoeren, doorklikken. Niet alleen de
codebase lezen.

```bash
bash scripts/dev/test-stack.sh --dev
```

Daarna draait de app op `http://localhost:3000` met een volledige, wegwerp-Supabase
ernaast, en log je in als **`jochen@test.trifinity.nl` / `Test2026!`** — een leeg
account dat bij de onboarding begint.

| Commando | Doet |
|---|---|
| `bash scripts/dev/test-stack.sh` | Stack op (idempotent, veilig te herhalen) |
| `bash scripts/dev/test-stack.sh --dev` | Idem + Next dev-server op `:3000` |
| `bash scripts/dev/test-stack.sh --reset` | Database leeg, migraties opnieuw, testgebruiker terug |
| `bash scripts/dev/test-stack.sh --down` | Alles afbreken |

De SessionStart-hook (`.claude/hooks/session-start.sh`) doet alleen het goedkope
voorwerk — `npm install` en de Docker-randvoorwaarden. De stack zelf start niet
vanzelf: dat kost minuten en is niet elke sessie nodig.

## Waarom dit niet vanzelf gaat

Drie dingen zitten in de weg in de cloud-omgeving. Ze staan hier omdat elke sessie
er opnieuw tegenaan loopt en de foutmeldingen niet zelfverklarend zijn.

**1. De productie-backend is onbereikbaar.** De egress-policy van de omgeving
blokkeert `*.supabase.co`, `trifinity.app` en `fin-first.vercel.app` (403 op CONNECT).
Testen tegen productie kan dus niet — en zou ook niet moeten. Vandaar een lokale
backend. Wil je dit tóch openzetten, dan is dat een netwerkpolicy-wijziging op de
omgeving, geen codewijziging; zie de docs van Claude Code on the web.

**2. De gebruikelijke image-registries zijn dicht.** `supabase start` haalt zijn
images van `ghcr.io`, maar de layer-CDN (`pkg-containers.githubusercontent.com`)
geeft 403. AWS ECR (`public.ecr.aws` → CloudFront) geeft ook 403. Docker Hub direct
geeft 429, omdat het proxy-IP gedeeld is en anonieme pulls gerantsoeneerd zijn.

Wat wél werkt is **`mirror.gcr.io`**, Google's Docker Hub-mirror. Het script zet die
als `registry-mirrors` in `/etc/docker/daemon.json`, haalt de images daar op en
**hertagt ze naar de `ghcr.io`-namen** die de CLI verwacht, zodat de CLI ze lokaal
vindt en niets meer hoeft te downloaden. De lijst met benodigde images komt uit
`supabase services` (JSON), aangevuld met Kong, Vector en de mailcatcher.

Ook `dockerd` draait niet vanzelf in de container; het script start hem.

**3. De migratieset is niet in bestandsnaamvolgorde toepasbaar.** Dit is geen
omgevingsprobleem maar een echte fout in de repo:

> `20260213122235_add_category_corrections.sql` maakt een tabel met
> `REFERENCES public.budgets`, terwijl `budgets` pas in
> `20260215000000_create_base_tables.sql` wordt aangemaakt — twee dagen later in
> de sorteervolgorde.

Supabase past migraties op bestandsnaam toe, dus een schone `supabase db reset`
klapt meteen op de eerste migratie. Productie merkt er niets van (daar zijn ze
destijds incrementeel toegepast), maar **een omgeving opnieuw opbouwen lukt niet**:
geen verse dev-database, geen CI-database, en de `herstelproef` kan niet bewijzen
dat een back-up terugkomt.

Het script omzeilt dit met **meerdere passes**: een migratie die faalt omdat zijn
afhankelijkheid nog niet bestaat, wordt in een volgende pass opnieuw geprobeerd.
Dat is ongevoelig voor élke verkeerde datering, niet alleen deze. Wat na vijf
passes niet lukt, wordt luid gemeld — nooit stil overgeslagen.

**4. Sommige objecten bestaan alleen op productie.** Dit is de ernstigste van de
vier, en ook een echte fout in de repo. Een aantal database-objecten wordt door
**geen enkele migratie** aangemaakt — ze zijn ooit rechtstreeks op de remote
database gezet. Op een verse database ontbreken ze dus, met gevolgen die niet
naar hun oorzaak wijzen:

| Ontbrekend object | Wat er kapot gaat |
|---|---|
| Tabelrechten voor `anon` / `authenticated` | Élke query geeft `permission denied for table …`; elke pagina rendert leeg alsof de gebruiker geen gegevens heeft |
| `profiles.commercial_tier`, `profiles.active_subscriptions` | Migratie `20260720081332` installeert een guard-trigger die `new.commercial_tier` leest bij **iedere** insert/update op `profiles`. Zonder de kolom faalt élke profielwijziging met `record "new" has no field "commercial_tier"` — de onboarding kan niet opslaan, `onboarding_completed` wordt nooit gezet, en de gebruiker wordt door élke route teruggestuurd naar `/onboarding` |
| `assets.has_woonbalans_tracking` | Gebruikt door migratie `20260802190000` en door de persona-seed; zonder de kolom faalt seeden halverwege |
| `profiles.role`, `is_superadmin()`, `handle_new_user()` + trigger | Blokkeerden tientallen migraties bij het opbouwen van deze stack |

`patch_remote_only()` in het script vult deze aan. Dat is nadrukkelijk een
pleister: zolang die functie nodig is, is de repo niet zelfvoorzienend en kan
niemand een omgeving opbouwen zonder een kopie van productie.

> **De pleisters blijven pleisters.** De echte oplossing is de migratie
> hernummeren, en dat is geen losse hernoeming: `schema_migrations` op productie
> kent de oude versie al, dus een nieuwe timestamp maakt er een "nog niet
> toegepaste" migratie van die opnieuw zou draaien. Dat hoort via de
> `schemawijziging`-route te lopen, met een idempotente variant of een expliciete
> correctie van de migratiegeschiedenis.

## Bewust niet in git

Het script raakt twee dingen aan die **niet** gecommit horen te worden:

- **`.env.local`** wordt gegenereerd met de lokale sleutels. Staat in `.gitignore`.
  Wijs dit bestand nooit naar productie.
- **`supabase/config.toml`** wordt tijdens het starten kortstondig aangepast
  (migraties uit) en daarna direct hersteld. Blijft die wijziging na een
  afgebroken run toch staan, draai dan `git checkout -- supabase/config.toml`.

## Wat je hierna kunt doen

De app is een gewone ingelogde sessie, dus alles kan: onboarding doorlopen,
persona's seeden via `/beheer/testdata` (het testaccount is superadmin op deze
lokale stack), schermen doorklikken met Playwright (chromium staat op
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, starten met
`--no-sandbox --disable-dev-shm-usage`), of de UAT-route uit `.claude/commands/uat.md`
draaien tegen `localhost:3000` in plaats van tegen een externe omgeving.
