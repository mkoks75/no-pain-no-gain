"""
Synchroniseer oefeningen vanuit de publieke wger API naar de lokale database.

Gebruik:
    cd backend
    python -m scripts.sync_wger

Haal op: naam (NL + EN), categorie, equipment, spiergroepen, afbeelding.
"""
import os, sys, time
import httpx
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import get_conn

BASE_URL = "https://wger.de/api/v2"

# Equipment IDs die thuis beschikbaar zijn
HOME_EQUIPMENT_IDS = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11}
# 1=Barbell, 2=SZ-Bar, 3=Dumbbell, 4=Gym mat, 5=Swiss Ball,
# 6=Pull-up bar, 7=none (bodyweight exercise), 8=Bench,
# 9=Incline bench, 10=Kettlebell, 11=Resistance band
# Alle wger-equipment is thuis bruikbaar; gym-only oefeningen
# (machines, kabels) worden via add_manual.py toegevoegd.

NL_LANG_ID = 9   # Nederlands in wger
EN_LANG_ID = 2   # Engels


def fetch_all(endpoint: str, params: dict = None) -> list:
    """Pagineer door alle resultaten van een wger endpoint."""
    url    = f"{BASE_URL}/{endpoint}/?format=json&limit=100"
    if params:
        url += "&" + "&".join(f"{k}={v}" for k, v in params.items())
    items  = []
    client = httpx.Client(timeout=30, headers={"User-Agent": "no-pain-no-gain/1.0"})
    while url:
        print(f"  Ophalen: {url}")
        resp = client.get(url)
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("results", []))
        url = data.get("next")
        time.sleep(0.3)  # Wees beleefd naar de API
    client.close()
    return items


def sync():
    print("=== wger sync gestart ===")

    print("Oefeningen ophalen...")
    exercises = fetch_all("exerciseinfo")
    print(f"  {len(exercises)} oefeningen opgehaald.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            inserted = updated = skipped = 0

            for ex in exercises:
                # --- Namen ---
                name_en = name_nl = None
                for t in ex.get("translations", []):
                    _lang = t.get("language"); lang_id = _lang.get("id") if isinstance(_lang, dict) else _lang
                    name    = t.get("name", "").strip()
                    if not name:
                        continue
                    if lang_id == EN_LANG_ID:
                        name_en = name
                    elif lang_id == NL_LANG_ID:
                        name_nl = name

                if not name_en:
                    skipped += 1
                    continue

                # --- Categorie ---
                category = ex.get("category", {}).get("name") if ex.get("category") else None

                # --- Equipment ---
                equipment_ids   = [e["id"] for e in ex.get("equipment", [])]
                equipment_names = [e["name"] for e in ex.get("equipment", [])]

                # --- Spiergroepen ---
                muscles_primary   = [m["name_en"] for m in ex.get("muscles", [])]
                muscles_secondary = [m["name_en"] for m in ex.get("muscles_secondary", [])]

                # --- Locatie beschikbaarheid ---
                if not equipment_ids:
                    # Bodyweight — overal
                    available_home = True
                    available_gym  = True
                elif all(eid in HOME_EQUIPMENT_IDS for eid in equipment_ids):
                    available_home = True
                    available_gym  = True
                else:
                    available_home = False
                    available_gym  = True

                # --- Cardio check ---
                is_cardio = category and "cardio" in category.lower()

                # --- Afbeelding ---
                image_url = None
                for img in ex.get("images", []):
                    if img.get("is_main"):
                        image_url = img.get("image")
                        break
                if not image_url and ex.get("images"):
                    image_url = ex["images"][0].get("image")

                # --- Omschrijving (EN) ---
                description = None
                for t in ex.get("translations", []):
                    _lang = t.get("language"); lang_id = _lang.get("id") if isinstance(_lang, dict) else _lang
                    if lang_id == EN_LANG_ID and t.get("description"):
                        description = t["description"][:2000]
                        break

                # --- Upsert ---
                cur.execute("""
                    INSERT INTO exercises
                        (wger_id, name_nl, name_en, category, equipment,
                         muscles_primary, muscles_secondary, image_url, description,
                         available_home, available_gym, is_cardio)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (wger_id) DO UPDATE SET
                        name_nl           = EXCLUDED.name_nl,
                        name_en           = EXCLUDED.name_en,
                        category          = EXCLUDED.category,
                        equipment         = EXCLUDED.equipment,
                        muscles_primary   = EXCLUDED.muscles_primary,
                        muscles_secondary = EXCLUDED.muscles_secondary,
                        image_url         = EXCLUDED.image_url,
                        description       = EXCLUDED.description,
                        available_home    = EXCLUDED.available_home,
                        available_gym     = EXCLUDED.available_gym,
                        is_cardio         = EXCLUDED.is_cardio
                """, (
                    ex["id"], name_nl, name_en, category,
                    equipment_names, muscles_primary, muscles_secondary,
                    image_url, description,
                    available_home, available_gym, is_cardio
                ))
                inserted += 1

        conn.commit()

    print(f"Klaar: {inserted} ingevoerd/bijgewerkt, {skipped} overgeslagen (geen EN-naam).")
    print("=== wger sync voltooid ===")


if __name__ == "__main__":
    sync()
