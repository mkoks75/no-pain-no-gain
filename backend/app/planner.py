"""
Planningsmotor — genereert automatisch een weekschema.

Seeded random voor continuïteit binnen trainingsblokken:
- Zelfde seed (blok + rotation_bump + user) = zelfde oefeningen die week
- Nieuw blok of rotation_bump+1 → nieuwe loting
- Favorieten krijgen ~70% kans, niet-favorieten ~30% (voor variatie)
"""
import random
from datetime import date
from app.db import get_conn

# Mapping: NL spiergroep → spiernamen zoals ze ECHT in de database staan
MUSCLE_TO_WGER: dict[str, list[str]] = {
    "borst":       ["Chest"],
    "rug":         ["Lats"],
    "schouders":   ["Shoulders"],
    "biceps":      ["Biceps"],
    "triceps":     ["Triceps"],
    "quadriceps":  ["Quads"],
    "hamstrings":  ["Hamstrings"],
    "billen":      ["Glutes"],
    "kuiten":      ["Calves"],
    "core":        ["Abs"],
}

# Splits per aantal trainingsdagen
SPLITS: dict[int, list[list[str]]] = {
    1: [["borst","rug","schouders","biceps","triceps","quadriceps","hamstrings","billen","kuiten","core"]],
    2: [
        ["borst","schouders","triceps","quadriceps","kuiten"],
        ["rug","biceps","hamstrings","billen","core"],
    ],
    3: [
        ["borst","schouders","triceps"],
        ["rug","biceps"],
        ["quadriceps","hamstrings","billen","kuiten","core"],
    ],
    4: [
        ["borst","triceps"],
        ["rug","biceps"],
        ["quadriceps","hamstrings","billen"],
        ["schouders","kuiten","core"],
    ],
    5: [
        ["borst","triceps"],
        ["rug","biceps"],
        ["quadriceps","hamstrings","billen"],
        ["schouders","core"],
        ["borst","rug","kuiten"],
    ],
    6: [
        ["borst","triceps"],
        ["rug","biceps"],
        ["quadriceps","hamstrings"],
        ["schouders","core"],
        ["borst","triceps","billen"],
        ["rug","biceps","kuiten"],
    ],
}

# Sets/reps/rust per doel
GOAL_PARAMS: dict[str, dict] = {
    "kracht":      {"sets": 4, "reps": 4,  "rest": 180},
    "hypertrofie": {"sets": 4, "reps": 10, "rest": 90},
    "algemeen":    {"sets": 3, "reps": 8,  "rest": 90},
    "power":       {"sets": 5, "reps": 3,  "rest": 180},
}

# Referentiedatum voor stabiele bloknummering
BLOCK_EPOCH = date(2024, 1, 1)


def week_block_number(week_start: date, block_weeks: int) -> int:
    """Bereken het bloknummer op basis van week_start en bloklengte."""
    week_index = (week_start - BLOCK_EPOCH).days // 7
    return week_index // max(block_weeks, 1)


def _make_rng(muscle: str, block_number: int, rotation_bump: int, user_id: int) -> random.Random:
    """Maak een deterministisch seeded RNG per (spiergroep, blok, rotatie, gebruiker)."""
    seed = hash((muscle, block_number, rotation_bump, user_id)) & 0x7FFFFFFF
    return random.Random(seed)


def _get_candidates(cur, muscle: str, location: str, exclude_ids: set) -> list[dict]:
    """
    Haal ALLE passende oefeningen op (geen LIMIT, geen ORDER BY random in SQL).
    Gesorteerd op id voor determinisme; Python-zijde doet de seeded shuffle.
    """
    names   = MUSCLE_TO_WGER.get(muscle, [])
    if not names:
        return []
    exclude = list(exclude_ids) if exclude_ids else [0]

    if location == "thuis":
        cur.execute("""
            SELECT id, name_nl, name_en
            FROM exercises
            WHERE is_cardio = FALSE
              AND available_home = TRUE
              AND hidden = FALSE
              AND id <> ALL(%s)
              AND (muscles_primary && %s::text[] OR muscles_secondary && %s::text[])
            ORDER BY id
        """, (exclude, names, names))
    else:
        # Sportschool: gym-only (available_home=FALSE) eerst → benut machines
        cur.execute("""
            SELECT id, name_nl, name_en
            FROM exercises
            WHERE is_cardio = FALSE
              AND available_gym = TRUE
              AND hidden = FALSE
              AND id <> ALL(%s)
              AND (muscles_primary && %s::text[] OR muscles_secondary && %s::text[])
            ORDER BY available_home ASC, id
        """, (exclude, names, names))

    return [dict(r) for r in cur.fetchall()]


def _select_with_fave_bias(
    all_exs: list[dict],
    favorite_ids: set[int],
    n_ex: int,
    rng: random.Random,
) -> list[dict]:
    """
    Kies n_ex oefeningen met seeded bias (~70% kans op favoriet).
    Dezelfde rng-seed → zelfde uitkomst binnen een blok.
    """
    faves     = [e for e in all_exs if e["id"] in favorite_ids]
    non_faves = [e for e in all_exs if e["id"] not in favorite_ids]

    rng.shuffle(faves)
    rng.shuffle(non_faves)

    selected: list[dict] = []
    for _ in range(n_ex):
        if not faves and not non_faves:
            break
        use_fave = (rng.random() < 0.70 and bool(faves)) or not non_faves
        if use_fave:
            selected.append(faves.pop(0))
        else:
            selected.append(non_faves.pop(0))

    return selected


def generate_plan(
    profile:       dict,
    training_days: list[dict],
    favorite_ids:  set[int]  | None = None,
    block_number:  int              = 0,
    rotation_bump: int              = 0,
    user_id:       int              = 0,
) -> list[dict]:
    """
    Genereer een weekplan.

    profile:       {goal, intensity_mode, weekly_set_targets, block_weeks}
    training_days: [{"date": date_obj, "location": "thuis"|"sportschool"}]
    favorite_ids:  set van exercise IDs die de gebruiker favoriet heeft
    block_number:  deterministisch bloknummer (berekend uit week_start + block_weeks)
    rotation_bump: handmatige ververs-teller (uit profiles.rotation_bump)
    user_id:       voor seed-diversiteit tussen gebruikers

    Returns: [{"date": ..., "location": ..., "exercises": [...]}]
    """
    n = min(len(training_days), 6)
    if n == 0:
        return []

    if favorite_ids is None:
        favorite_ids = set()

    splits  = SPLITS[n]
    params  = GOAL_PARAMS.get(profile.get("goal", "hypertrofie"), GOAL_PARAMS["hypertrofie"])
    targets = profile.get("weekly_set_targets", {})

    # Frequentie per spiergroep in deze split
    frequencies: dict[str, int] = {}
    for split in splits:
        for mg in split:
            frequencies[mg] = frequencies.get(mg, 0) + 1

    result: list[dict] = []

    with get_conn() as conn:
        with conn.cursor() as cur:
            for i, day in enumerate(training_days):
                split_idx     = i % len(splits)
                muscle_groups = splits[split_idx]
                location      = day["location"]
                exercises_out = []
                order         = 0
                used_ids      = set()  # voorkomt duplicaten per dag

                for mg in muscle_groups:
                    weekly_sets = targets.get(mg, 10)
                    freq        = frequencies.get(mg, 1)
                    sets_today  = max(2, round(weekly_sets / freq))
                    n_ex        = max(1, min(2, round(sets_today / params["sets"])))

                    rng      = _make_rng(mg, block_number, rotation_bump, user_id)
                    all_exs  = _get_candidates(cur, mg, location, used_ids)
                    selected = _select_with_fave_bias(all_exs, favorite_ids, n_ex, rng)

                    for ex in selected:
                        used_ids.add(ex["id"])
                        exercises_out.append({
                            "exercise_id":     ex["id"],
                            "order_idx":       order,
                            "block_type":      "strength",
                            "target_sets":     params["sets"],
                            "target_reps":     params["reps"],
                            "target_weight":   None,
                            "target_time_sec": None,
                            "rest_sec":        params["rest"],
                        })
                        order += 1

                result.append({
                    "date":      day["date"],
                    "location":  location,
                    "exercises": exercises_out,
                })

    return result
