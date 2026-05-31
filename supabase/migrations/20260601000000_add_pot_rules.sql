-- Add pot_rules column to profiles table
-- Pot-regels voor /toekomst Voorkeuren: onttrekkingsvolgorde (rule 3),
-- verdeling-bij-toename (rule 4) en onttrekking-bij-afname (rule 5),
-- opgeslagen op WealthGroup-granulariteit (spaargeld/beleggingen/pensioen/vastgoed/overig).
-- NOT NULL + DEFAULT reproduceert de huidige hardcoded waterfall zodat bestaande gebruikers onveranderd blijven
-- IF NOT EXISTS makes this migration idempotent
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pot_rules jsonb NOT NULL DEFAULT '{"withdrawal_order_groups":["spaargeld","beleggingen","overig","pensioen","vastgoed"],"surplus_group":"beleggingen","deficit_order_groups":["spaargeld","beleggingen","overig","pensioen","vastgoed"]}'::jsonb;

COMMENT ON COLUMN profiles.pot_rules IS 'Pot-regels voor /toekomst Voorkeuren (onttrekkingsvolgorde, verdeling-bij-toename, onttrekking-bij-afname), op WealthGroup-granulariteit. Shape: {withdrawal_order_groups: WealthGroup[], surplus_group: WealthGroup|schuld_aflossen, deficit_order_groups: WealthGroup[]}.';
