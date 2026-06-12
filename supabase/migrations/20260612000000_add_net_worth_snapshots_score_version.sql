-- Gezondheidsscore v2 (ADR 0010): markeer met welke score-methode een snapshot
-- is weggeschreven. Bestaande historie blijft impliciet v1 (DEFAULT 1); nieuwe
-- snapshot-writes (alle drie routes, andere change) zetten score_version = 2.
-- De methodewissel geeft een niveausprong in de trendlijn; de UI markeert die.
--
-- Append-only kolom. Geen RLS-wijziging: net_worth_snapshots heeft al own-row
-- policies (auth.uid() = user_id) plus de gedeelde-huishouden read-policy; een
-- nieuwe kolom valt automatisch onder die row-level policies.
-- Geen index: score_version wordt niet gefilterd in hot paths (snapshots worden
-- per user_id/snapshot_date gelezen, niet per versie) — een index zou alleen
-- schrijfkosten toevoegen.

alter table public.net_worth_snapshots
  add column if not exists score_version smallint not null default 1;

comment on column public.net_worth_snapshots.score_version is
  'Gezondheidsscore-methode waarmee deze snapshot is berekend. 1 = 7-pijler v1, 2 = 4-pijlergroepen v2 (zie ADR 0010).';
