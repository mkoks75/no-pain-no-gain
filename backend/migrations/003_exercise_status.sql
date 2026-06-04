-- Migratie 003: per-user oefening-status + eigen oefeningen
-- Idempotent — veilig herhalen op bestaande DB
-- Uitvoeren: psql -U npng -d npng -p 5437 -f migrations/003_exercise_status.sql

-- Per-gebruiker status per oefening
-- Geen rij = 'actief' (default) — alleen afwijkingen worden opgeslagen
CREATE TABLE IF NOT EXISTS exercise_status (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'actief'
                CHECK (status IN ('favoriet','actief','inactief')),
    updated_at  TIMESTAMP DEFAULT now(),
    PRIMARY KEY (user_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_status_user ON exercise_status(user_id);

-- Eigen oefeningen vlag + creator-tracking
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_custom  BOOLEAN DEFAULT FALSE;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Migreer bestaande favorieten naar exercise_status
INSERT INTO exercise_status (user_id, exercise_id, status)
SELECT user_id, exercise_id, 'favoriet' FROM favorites
ON CONFLICT DO NOTHING;

-- Noot: de favorites-tabel blijft bestaan maar wordt niet meer gebruikt door de applicatie.
-- De hidden-kolom op exercises blijft als globaal admin-filter (verbergt voor alle gebruikers);
-- per-user verbergen gaat nu via status='inactief' in exercise_status.
