-- Migratie 001: favorieten + blok-roulatie
-- Idempotent — veilig herhalen op bestaande DB
-- Uitvoeren: psql -U npng -d npng -p 5437 -f migrations/001_favorites_rotation.sql

-- Favoriete oefeningen per gebruiker
CREATE TABLE IF NOT EXISTS favorites (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, exercise_id)
);

-- Bloklengte en ververs-teller aan profielen
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS block_weeks   INTEGER DEFAULT 4;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rotation_bump INTEGER DEFAULT 0;
