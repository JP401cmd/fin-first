-- Add metadata JSONB column to life_events for event-type-specific details
-- (e.g. number of children, fuel type for car, AOW living situation)
ALTER TABLE life_events
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- Add a comment for documentation
COMMENT ON COLUMN life_events.metadata IS 'Event-type-specific details stored as JSON (e.g. aantalKinderen, brandstof, leefsituatie)';
