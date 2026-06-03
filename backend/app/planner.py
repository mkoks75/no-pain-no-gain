"""
Planningsmotor — genereert automatisch een weekschema op basis van:
- Gebruikersprofiel (doel, wekelijkse settargets)
- Beschikbare trainingsdagen + locaties
Gebaseerd op ACSM 2026 richtlijnen.
"""
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

# Splits per aantal trainingsdagen (cycleert als er meer dagen zijn)
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


def _get_exercises_for_muscle(cur, muscle: str, location: str, exclude_ids: set) -> list[dict]:
    names = MUSCLE_TO_WGER.get(muscle, [])
    if not names:
        return []

    exclude = list(exclude_ids) if exclude_ids else [0]

    if location == "thuis":
        # Alleen thuis-beschikbare oefeningen
        cur.execute("""
            SELECT id, name_nl, name_en
            FROM exercises
            WHERE is_cardio = FALSE
              AND available_home = TRUE
              AND id <> ALL(%s)
              AND (muscles_primary && %s::text[] OR muscles_secondary && %s::text[])
            ORDER BY random()
            LIMIT 3
        """, (exclude, names, names))
    else:
        # Sportschool: gym-only eerst (available_home=FALSE), dan de rest.
        # Sorteer zo dat thuis-onmogelijke oefeningen bovenaan komen.
        cur.execute("""
            SELECT id, name_nl, name_en
            FROM exercises
            WHERE is_cardio = FALSE
              AND available_gym = TRUE
              AND id <> ALL(%s)
              AND (muscles_primary && %s::text[] OR muscles_secondary && %s::text[])
            ORDER BY available_home ASC, random()
            LIMIT 3
        """, (exclude, names, names))

    return [dict(r) for r in cur.fetchall()]


def generate_plan(profile: dict, training_days: list[dict]) -> list[dict]:
    """
    profile: {goal, intensity_mode, weekly_set_targets}
    training_days: [{"date": date_obj, "location": "thuis"|"sportschool"}]

    Returns list of day dicts:
    [{"date": ..., "location": ..., "exercises": [{exercise_id, order_idx, ...}]}]
    """
    n = min(len(training_days), 6)
    if n == 0:
        return []

    splits       = SPLITS[n]
    params       = GOAL_PARAMS.get(profile.get("goal", "hypertrofie"), GOAL_PARAMS["hypertrofie"])
    targets      = profile.get("weekly_set_targets", {})

    # Bereken frequentie per spiergroep in de split
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

                    exs = _get_exercises_for_muscle(cur, mg, location, used_ids)[:n_ex]
                    for ex in exs:
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
