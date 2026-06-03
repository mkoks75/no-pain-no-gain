from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.db import get_conn
from app.auth import current_user

router = APIRouter()


@router.get("/exercise/{exercise_id}")
def exercise_progress(exercise_id: int, user=Depends(current_user)):
    """Gewicht en volume over tijd voor een specifieke oefening."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    DATE(ws.started_at) AS datum,
                    ss.set_number,
                    ss.weight,
                    ss.reps,
                    COALESCE(ss.weight, 0) * COALESCE(ss.reps, 0) AS volume
                FROM session_sets ss
                JOIN workout_sessions ws ON ws.id = ss.session_id
                WHERE ws.user_id = %s
                  AND ss.exercise_id = %s
                  AND ss.completed = TRUE
                ORDER BY ws.started_at DESC
                LIMIT 200
            """, (user["user_id"], exercise_id))
            rows = [dict(r) for r in cur.fetchall()]

    # Groepeer per datum: max gewicht + totaal volume
    by_date: dict = {}
    for row in rows:
        d = str(row["datum"])
        if d not in by_date:
            by_date[d] = {"datum": d, "max_weight": 0, "total_volume": 0, "sets": 0}
        by_date[d]["max_weight"]    = max(by_date[d]["max_weight"], float(row["weight"] or 0))
        by_date[d]["total_volume"] += float(row["volume"] or 0)
        by_date[d]["sets"]         += 1

    return sorted(by_date.values(), key=lambda x: x["datum"])


@router.get("/weekly")
def weekly_volume(week_start: Optional[date] = None, user=Depends(current_user)):
    """Gerealiseerd spiergroep-volume vs. weekdoel."""
    if not week_start:
        today      = date.today()
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Haal gelogde sets op voor deze week
            cur.execute("""
                SELECT e.muscles_primary,
                       COUNT(*) AS sets_done
                FROM session_sets ss
                JOIN workout_sessions ws ON ws.id = ss.session_id
                JOIN exercises e ON e.id = ss.exercise_id
                WHERE ws.user_id = %s
                  AND DATE(ws.started_at) BETWEEN %s AND %s
                  AND ss.completed = TRUE
                  AND e.is_cardio = FALSE
                GROUP BY e.muscles_primary
            """, (user["user_id"], week_start, week_end))
            done_rows = [dict(r) for r in cur.fetchall()]

            # Haal weekdoelen op
            cur.execute(
                "SELECT weekly_set_targets FROM profiles WHERE user_id=%s",
                (user["user_id"],)
            )
            profile = cur.fetchone()

    targets = profile["weekly_set_targets"] if profile else {}

    # Wger spieren → NL spiergroep
    WGER_TO_NL = {
        "Pectoralis major":  "borst",
        "Latissimus dorsi":  "rug",
        "Trapezius":         "rug",
        "Anterior deltoid":  "schouders",
        "Biceps brachii":    "biceps",
        "Triceps brachii":   "triceps",
        "Quadriceps femoris":"quadriceps",
        "Biceps femoris":    "hamstrings",
        "Gluteus maximus":   "billen",
        "Gastrocnemius":     "kuiten",
        "Soleus":            "kuiten",
        "Rectus abdominis":  "core",
        "Obliques":          "core",
    }

    done_by_group: dict[str, int] = {}
    for row in done_rows:
        for muscle in (row["muscles_primary"] or []):
            group = WGER_TO_NL.get(muscle)
            if group:
                done_by_group[group] = done_by_group.get(group, 0) + row["sets_done"]

    result = []
    for group, target in targets.items():
        result.append({
            "muscle_group": group,
            "target":       target,
            "done":         done_by_group.get(group, 0),
        })

    return {"week_start": str(week_start), "week_end": str(week_end), "groups": result}


@router.get("/overview")
def overview(user=Depends(current_user)):
    """Totale statistieken van de ingelogde gebruiker."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(DISTINCT ws.id)              AS total_sessions,
                    COALESCE(SUM(ss.weight * ss.reps), 0) AS total_volume_kg,
                    COUNT(ss.id)                       AS total_sets
                FROM workout_sessions ws
                LEFT JOIN session_sets ss ON ss.session_id = ws.id AND ss.completed = TRUE
                WHERE ws.user_id = %s
            """, (user["user_id"],))
            stats = dict(cur.fetchone())

            cur.execute("""
                SELECT COUNT(*) AS streak
                FROM (
                    SELECT DISTINCT DATE(started_at)
                    FROM workout_sessions
                    WHERE user_id = %s
                      AND started_at >= NOW() - INTERVAL '30 days'
                ) t
            """, (user["user_id"],))
            stats["sessions_last_30d"] = cur.fetchone()["streak"]

    return stats
