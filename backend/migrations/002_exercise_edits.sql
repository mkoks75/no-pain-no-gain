-- Migratie 002: bewerkbare velden + soft-delete op oefeningen
-- Idempotent — veilig herhalen op bestaande DB
-- Uitvoeren: psql -U npng -d npng -p 5437 -f migrations/002_exercise_edits.sql

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS hidden             BOOLEAN DEFAULT FALSE;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS custom_description TEXT;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS custom_image_url   TEXT;

-- Index voor snelle filtering op hidden
CREATE INDEX IF NOT EXISTS idx_exercises_hidden ON exercises(hidden);
