-- Add 'vordering' (Vordering / Lening u/g) to the allowed asset_type values
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_asset_type_check;
ALTER TABLE assets ADD CONSTRAINT assets_asset_type_check
  CHECK (asset_type = ANY (ARRAY['cash','savings','investment','retirement',
    'eigen_huis','real_estate','crypto','vehicle','physical',
    'deelneming','levensverzekering','vordering','other']));
