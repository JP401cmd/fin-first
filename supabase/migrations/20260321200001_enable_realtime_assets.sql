-- Enable realtime on assets table so holdings card updates instantly when has_holdings_tracking changes
ALTER PUBLICATION supabase_realtime ADD TABLE assets;
