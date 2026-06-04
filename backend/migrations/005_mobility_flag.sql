-- Migratie 005: mobiliteits-/stretch-vlag op oefeningen
-- Idempotent — veilig herhalen op bestaande DB
-- Al handmatig uitgevoerd op productie; dit bestand zorgt dat een verse opbouw
-- dezelfde staat krijgt.
-- Uitvoeren: psql -U npng -d npng -p 5437 -f migrations/005_mobility_flag.sql

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_mobility BOOLEAN DEFAULT FALSE;

UPDATE exercises SET is_mobility = true
WHERE name_en ILIKE '%stretch%'
   OR name_en ILIKE '%mobility%'
   OR name_en ILIKE '%foam roll%'
   OR name_en ILIKE '%foam roller%'
   OR name_en ILIKE '%warmup%'
   OR name_en ILIKE '%warm-up%'
   OR name_en ILIKE '%circles%';
