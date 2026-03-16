-- Drop gamification tables that are no longer used
-- (badges/streaks widget system was removed in features #34, #35, #36)
DROP TABLE IF EXISTS user_streaks CASCADE;
DROP TABLE IF EXISTS user_badges CASCADE;
DROP TABLE IF EXISTS badges CASCADE;
