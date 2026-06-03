"""
Voeg handmatige oefeningen toe die niet in wger staan.

Gebruik:
    cd backend
    python -m scripts.add_manual
"""
import os, sys
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import get_conn

MANUAL_EXERCISES = [
    # Cardio thuis
    {
        "name_nl": "Bokszak", "name_en": "Punching Bag",
        "category": "Cardio", "equipment": ["Punching bag"],
        "muscles_primary": [], "muscles_secondary": ["Biceps brachii", "Triceps brachii"],
        "available_home": True, "available_gym": True, "is_cardio": True,
    },
    {
        "name_nl": "Crosstrainer", "name_en": "Elliptical Trainer",
        "category": "Cardio", "equipment": ["Elliptical"],
        "muscles_primary": [], "muscles_secondary": ["Quadriceps femoris", "Gluteus maximus"],
        "available_home": True, "available_gym": True, "is_cardio": True,
    },
    # Cardio sportschool
    {
        "name_nl": "Spinning", "name_en": "Spinning / Indoor Cycling",
        "category": "Cardio", "equipment": ["Spinning bike"],
        "muscles_primary": [], "muscles_secondary": ["Quadriceps femoris", "Gluteus maximus"],
        "available_home": False, "available_gym": True, "is_cardio": True,
    },
    {
        "name_nl": "Zwemmen", "name_en": "Swimming",
        "category": "Cardio", "equipment": ["Swimming pool"],
        "muscles_primary": [], "muscles_secondary": [],
        "available_home": False, "available_gym": True, "is_cardio": True,
    },
    # Machines sportschool
    {
        "name_nl": "Legpress", "name_en": "Leg Press Machine",
        "category": "Legs", "equipment": ["Machine"],
        "muscles_primary": ["Quadriceps femoris"], "muscles_secondary": ["Gluteus maximus"],
        "available_home": False, "available_gym": True, "is_cardio": False,
    },
    {
        "name_nl": "Leg Extension", "name_en": "Leg Extension Machine",
        "category": "Legs", "equipment": ["Machine"],
        "muscles_primary": ["Quadriceps femoris"], "muscles_secondary": [],
        "available_home": False, "available_gym": True, "is_cardio": False,
    },
    {
        "name_nl": "Leg Curl Machine", "name_en": "Leg Curl Machine",
        "category": "Legs", "equipment": ["Machine"],
        "muscles_primary": ["Biceps femoris"], "muscles_secondary": [],
        "available_home": False, "available_gym": True, "is_cardio": False,
    },
    {
        "name_nl": "Kabelrij", "name_en": "Cable Row",
        "category": "Back", "equipment": ["Cable"],
        "muscles_primary": ["Latissimus dorsi"], "muscles_secondary": ["Biceps brachii"],
        "available_home": False, "available_gym": True, "is_cardio": False,
    },
    {
        "name_nl": "Lat Pulldown", "name_en": "Lat Pulldown",
        "category": "Back", "equipment": ["Cable"],
        "muscles_primary": ["Latissimus dorsi"], "muscles_secondary": ["Biceps brachii"],
        "available_home": False, "available_gym": True, "is_cardio": False,
    },
    {
        "name_nl": "Pec Deck Machine", "name_en": "Pec Deck / Chest Fly Machine",
        "category": "Chest", "equipment": ["Machine"],
        "muscles_primary": ["Pectoralis major"], "muscles_secondary": ["Anterior deltoid"],
        "available_home": False, "available_gym": True, "is_cardio": False,
    },
    {
        "name_nl": "Shoulder Press Machine", "name_en": "Shoulder Press Machine",
        "category": "Shoulders", "equipment": ["Machine"],
        "muscles_primary": ["Anterior deltoid"], "muscles_secondary": ["Triceps brachii"],
        "available_home": False, "available_gym": True, "is_cardio": False,
    },
]


def add_manual():
    print("=== Handmatige oefeningen toevoegen ===")
    with get_conn() as conn:
        with conn.cursor() as cur:
            for ex in MANUAL_EXERCISES:
                cur.execute("""
                    INSERT INTO exercises
                        (name_nl, name_en, category, equipment,
                         muscles_primary, muscles_secondary,
                         available_home, available_gym, is_cardio)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    ex["name_nl"], ex["name_en"], ex["category"], ex["equipment"],
                    ex["muscles_primary"], ex["muscles_secondary"],
                    ex["available_home"], ex["available_gym"], ex["is_cardio"],
                ))
                print(f"  + {ex['name_nl']}")
        conn.commit()
    print(f"Klaar: {len(MANUAL_EXERCISES)} oefeningen verwerkt.")


if __name__ == "__main__":
    add_manual()
