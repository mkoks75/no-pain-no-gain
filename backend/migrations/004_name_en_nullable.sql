-- Eigen (zelf toegevoegde) oefeningen hebben geen wger-naam, dus name_en mag leeg zijn.
-- Idempotent: DROP NOT NULL is veilig om opnieuw te draaien (geen fout als al nullable).
ALTER TABLE exercises ALTER COLUMN name_en DROP NOT NULL;
