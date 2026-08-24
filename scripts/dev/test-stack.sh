#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Lokale teststack voor Claude Code (web/cloud) sessies.
#
# Zet een volledige, wegwerp-Supabase op naast de Next-dev-server, zodat een
# sessie de app ECHT kan gebruiken (inloggen, onboarden, doorklikken) zonder
# de productie-backend te raken.
#
#   bash scripts/dev/test-stack.sh            # stack op (idempotent)
#   bash scripts/dev/test-stack.sh --dev      # idem + dev-server op :3000
#   bash scripts/dev/test-stack.sh --reset    # database leeg + migraties opnieuw
#   bash scripts/dev/test-stack.sh --down     # alles afbreken
#
# Achtergrond bij de keuzes staat in docs/dev/lokale-teststack.md.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

TEST_EMAIL="${TEST_EMAIL:-jochen@test.trifinity.nl}"
TEST_PASSWORD="${TEST_PASSWORD:-Test2026!}"
MIRROR="mirror.gcr.io"
DB_CONTAINER="supabase_db_fin"

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- 1. Docker ------------------------------------------------------------
# De cloud-container heeft docker geïnstalleerd maar de daemon draait niet.
ensure_docker() {
  if docker info >/dev/null 2>&1; then log "docker draait al"; return; fi
  log "dockerd starten"
  # Docker Hub weigert anonieme pulls vanaf het gedeelde proxy-IP (429) en de
  # layer-CDN's van ghcr.io/ECR zijn geblokkeerd. Google's Hub-mirror werkt wel.
  mkdir -p /etc/docker
  if ! grep -q "$MIRROR" /etc/docker/daemon.json 2>/dev/null; then
    printf '{ "registry-mirrors": ["https://%s"] }\n' "$MIRROR" > /etc/docker/daemon.json
    log "registry-mirror ingesteld op $MIRROR"
  fi
  nohup dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || die "dockerd komt niet op — zie /tmp/dockerd.log"
}

# --- 2. Images ------------------------------------------------------------
# `supabase start` pullt van ghcr.io; die layers zijn hier geblokkeerd. We halen
# dezelfde images van Docker Hub via de mirror en hertaggen ze naar de namen die
# de CLI verwacht, zodat de CLI ze lokaal vindt en niets hoeft te downloaden.
ensure_images() {
  log "images klaarzetten (via $MIRROR)"
  local wanted extra
  wanted="$(supabase services 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s).services.forEach(x=>x.local&&console.log(x.name+":"+x.local))}catch(e){}})')"
  # Kong, vector en de mailcatcher staan niet in `supabase services`.
  extra=$'supabase/kong:2.8.1\nsupabase/vector:0.53.0-alpine\naxllent/mailpit:v1.30.2'

  printf '%s\n%s\n' "$wanted" "$extra" | grep -v '^$' | while read -r ref; do
    local target="ghcr.io/${ref}"
    if docker image inspect "$target" >/dev/null 2>&1; then continue; fi
    log "  ophalen: $ref"
    if docker pull "${MIRROR}/${ref}" >/dev/null 2>&1; then
      docker tag "${MIRROR}/${ref}" "$target"
    elif docker pull "${MIRROR}/library/${ref##*/}" >/dev/null 2>&1; then
      docker tag "${MIRROR}/library/${ref##*/}" "$target"
    else
      warn "  kon $ref niet ophalen — supabase start kan hierop stuklopen"
    fi
  done
}

# --- 3. Supabase ----------------------------------------------------------
# LET OP: migraties worden hier bewust NIET door de CLI toegepast. De set is niet
# in bestandsnaamvolgorde toepasbaar (zie apply_migrations + de docs), dus we
# starten met migraties uit en doen ze daarna zelf in een werkende volgorde.
# De config.toml wordt alleen tijdens het starten aangepast en direct hersteld,
# zodat er nooit een lokale workaround in git belandt.
start_supabase() {
  if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    log "supabase draait al"; return
  fi
  log "supabase starten"
  cp supabase/config.toml /tmp/config.toml.bak
  # Twee runtime-patches, allebei alleen tijdens het starten:
  #  - db.migrations uit (zie apply_migrations hieronder)
  #  - edge_runtime uit: die container start niet in deze sandbox
  #    ("runc create failed: error setting rlimit type 7") en blokkeert dan de
  #    hele start. Het project gebruikt geen edge functions.
  node -e '
    const fs=require("fs");const p="supabase/config.toml";let t=fs.readFileSync(p,"utf8");
    t=t.replace(/(\[db\.migrations\][\s\S]*?)\nenabled = true/,"$1\nenabled = false");
    t=t.replace(/(\[edge_runtime\][\s\S]*?)\nenabled = true/,"$1\nenabled = false");
    fs.writeFileSync(p,t);'
  set +e
  supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
  local rc=$?
  set -e
  cp /tmp/config.toml.bak supabase/config.toml
  [ $rc -eq 0 ] || die "supabase start faalde (exit $rc)"
}

# --- 4. Migraties ---------------------------------------------------------
# Meerdere passes: een migratie die faalt omdat zijn afhankelijkheid nog niet
# bestaat, wordt later opnieuw geprobeerd. Dat maakt de stack ongevoelig voor
# verkeerd gedateerde bestandsnamen (zoals 20260213122235_add_category_corrections,
# die vóór 20260215000000_create_base_tables sorteert maar er wél van afhangt).
apply_migrations() {
  log "migraties toepassen"
  docker exec -i "$DB_CONTAINER" psql -qtA -U postgres -d postgres \
    -c 'create schema if not exists supabase_migrations;
        create table if not exists supabase_migrations.schema_migrations (version text primary key, name text);' >/dev/null

  local pending=() applied=0 pass=1
  for f in supabase/migrations/*.sql; do pending+=("$f"); done

  while [ ${#pending[@]} -gt 0 ] && [ $pass -le 5 ]; do
    local failed=() progress=0
    for f in "${pending[@]}"; do
      local base version
      base="$(basename "$f")"; version="${base%%_*}"
      if [ -n "$(docker exec -i "$DB_CONTAINER" psql -qtA -U postgres -d postgres \
           -c "select 1 from supabase_migrations.schema_migrations where version='$version'" 2>/dev/null)" ]; then
        continue
      fi
      if docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres < "$f" >/dev/null 2>&1; then
        docker exec -i "$DB_CONTAINER" psql -qtA -U postgres -d postgres \
          -c "insert into supabase_migrations.schema_migrations(version,name) values('$version','$base') on conflict do nothing" >/dev/null
        applied=$((applied+1)); progress=1
      else
        failed+=("$f")
      fi
    done
    [ $progress -eq 0 ] && break
    pending=("${failed[@]}"); pass=$((pass+1))
  done

  log "  $applied migraties toegepast in $pass passes"
  if [ ${#pending[@]} -gt 0 ]; then
    warn "  ${#pending[@]} migraties niet toepasbaar:"
    for f in "${pending[@]}"; do warn "    - $(basename "$f")"; done
    warn "  (de app kan hierdoor deels stuk zijn — niet negeren)"
  fi
}

# --- 4b. Objecten die alleen op productie bestaan --------------------------
# Een aantal objecten wordt door GEEN enkele migratie in deze repo aangemaakt;
# ze bestaan alleen op de remote database. Zonder deze patch is de app op een
# verse database onbruikbaar. Elk item hieronder is een geconstateerd gemis,
# geen voorkeur — laat ze staan tot de migraties zelfvoorzienend zijn.
#
#  * tabelrechten voor anon/authenticated/service_role — zonder deze geeft élke
#    query "permission denied for table ..." en rendert elke pagina leeg.
#  * profiles.commercial_tier / active_subscriptions — migratie 20260720081332
#    installeert een guard-trigger die new.commercial_tier leest bij iedere
#    insert/update. Ontbreekt de kolom, dan faalt élke profielwijziging met
#    'record "new" has no field "commercial_tier"' → onboarding kan niet
#    opslaan en de gebruiker blijft eeuwig in /onboarding hangen.
#  * assets.has_woonbalans_tracking — gebruikt door migratie 20260802190000
#    en door de persona-seed, maar nergens aangemaakt.
patch_remote_only() {
  log "objecten aanvullen die geen migratie aanmaakt"
  docker exec -i "$DB_CONTAINER" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null <<'SQL'
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

alter table public.profiles add column if not exists commercial_tier text not null default 'gratis';
alter table public.profiles add column if not exists active_subscriptions text[] not null default '{}';

alter table public.assets add column if not exists has_woonbalans_tracking  boolean not null default false;
alter table public.assets add column if not exists has_rental_tracking      boolean not null default false;
alter table public.assets add column if not exists monthly_maintenance_cost numeric;
alter table public.assets add column if not exists vva_fee                  numeric;
alter table public.assets add column if not exists vacancy_log              jsonb not null default '[]'::jsonb;

-- app/api/snapshots/auto doet upsert(..., onConflict: 'user_id,snapshot_date')
-- op net_worth_snapshots, maar geen migratie maakt daar een unieke constraint
-- voor — 20260504000001 legt alleen een gewone index. Zonder deze index geeft
-- de route 500 "no unique or exclusion constraint matching the ON CONFLICT
-- specification". Of productie hem out-of-band heeft, valt uit de repo niet af
-- te leiden; zie de documentatie.
delete from public.net_worth_snapshots a
 using public.net_worth_snapshots b
 where a.id > b.id and a.user_id = b.user_id and a.snapshot_date = b.snapshot_date;
create unique index if not exists net_worth_snapshots_user_date_key
  on public.net_worth_snapshots (user_id, snapshot_date);

-- Kolommen die hierboven zijn toegevoegd vallen buiten de eerdere grant-ronde.
grant all on all tables in schema public to anon, authenticated, service_role;
notify pgrst, 'reload schema';
SQL
}

# --- 5. Env ---------------------------------------------------------------
write_env() {
  log ".env.local schrijven"
  local api anon service
  api="$(supabase status -o env 2>/dev/null | grep '^API_URL=' | cut -d= -f2- | tr -d '"')"
  anon="$(supabase status -o env 2>/dev/null | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')"
  service="$(supabase status -o env 2>/dev/null | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')"
  [ -n "$api" ] || die "kon supabase status niet lezen"
  cat > .env.local <<ENV
# Gegenereerd door scripts/dev/test-stack.sh — LOKALE WEGWERPSTACK.
# Niet committen (.env* staat in .gitignore) en nooit naar productie wijzen.
NEXT_PUBLIC_SUPABASE_URL=$api
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon
SUPABASE_SERVICE_ROLE_KEY=$service
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENCRYPTION_KEY_V1=1111111111111111111111111111111111111111111111111111111111111111
IBAN_INDEX_KEY_V1=2222222222222222222222222222222222222222222222222222222222222222
IP_HASH_SALT=3333333333333333333333333333333333333333333333333333333333333333
CRON_SECRET=lokale-teststack
ENV
}

# --- 6. Testgebruiker -----------------------------------------------------
ensure_test_user() {
  log "testgebruiker $TEST_EMAIL"
  local api service
  api="$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)"
  service="$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)"
  # De besloten-testfase-hook (ADR 0047) weigert onbekende adressen.
  docker exec -i "$DB_CONTAINER" psql -qtA -U postgres -d postgres -c \
    "insert into public.signup_email_allowlist(email_normalized,label)
     values('$TEST_EMAIL','Teststack') on conflict do nothing" >/dev/null 2>&1 || true
  curl -sS --noproxy '*' -X POST "$api/auth/v1/admin/users" \
    -H "apikey: $service" -H "Authorization: Bearer $service" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"email_confirm\":true}" \
    | grep -q '"id"' && log "  aangemaakt" || log "  bestond al"
}

case "${1:-}" in
  --down)
    ensure_docker; supabase stop --no-backup 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    log "stack afgebroken"; exit 0 ;;
  --reset)
    ensure_docker
    docker exec -i "$DB_CONTAINER" psql -qtA -U postgres -d postgres \
      -c 'drop schema if exists public cascade; create schema public;
          truncate supabase_migrations.schema_migrations;' >/dev/null
    apply_migrations; patch_remote_only; ensure_test_user
    log "database gereset"; exit 0 ;;
esac

ensure_docker
ensure_images
start_supabase
apply_migrations
patch_remote_only
write_env
ensure_test_user

if [ "${1:-}" = "--dev" ]; then
  pkill -f "next dev" 2>/dev/null || true
  log "dev-server starten op :3000"
  nohup npm run dev >/tmp/next-dev.log 2>&1 &
  for _ in $(seq 1 60); do
    curl -sf --noproxy '*' -o /dev/null http://localhost:3000/login && break; sleep 1
  done
fi

cat <<INFO

  Teststack staat klaar.

    App          http://localhost:3000
    Supabase API $(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
    Database     docker exec -it $DB_CONTAINER psql -U postgres

    Inloggen als $TEST_EMAIL / $TEST_PASSWORD  (leeg account, start bij onboarding)

  Afbreken met: bash scripts/dev/test-stack.sh --down
INFO
