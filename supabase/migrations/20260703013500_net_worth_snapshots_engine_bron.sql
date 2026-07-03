-- FASE 5, stap 2b (V15) — trendannotatie: markeer per dag-snapshot met welke
-- rekenmotor de FIRE-velden (fire_age / fire_portfolio_required) zijn geschreven.
--
-- Additief en inert: NULL = historisch / v2 (geen marker). De /toekomst-hook
-- (use-horizon-fire-sim) schrijft de kolom ALLEEN wanneer de per-gebruiker-vlag
-- `horizon_kernel_convergentie` aan staat ('kernel', of 'v2' bij een terugval);
-- met de vlag uit blijft de update-payload byte-identiek aan vandaag. De
-- trend-weergave (horizon-trend-grid) annoteert de overgang tussen twee
-- opeenvolgende snapshots met een andere bron als "rekenwijze gewijzigd".
--
-- Geen RLS-wijziging nodig: net_worth_snapshots heeft al een own-row policy
-- ("Users can manage own snapshots", auth.uid() = user_id) die deze kolom dekt.

alter table public.net_worth_snapshots
  add column if not exists engine_bron text;

comment on column public.net_worth_snapshots.engine_bron is
  'Rekenmotor die de FIRE-velden van deze snapshot schreef (''kernel''/''v2''). NULL = historisch/vlag-uit. Voedt de "rekenwijze gewijzigd"-annotatie in de trend-weergave (FASE 5 stap 2b, V15).';
