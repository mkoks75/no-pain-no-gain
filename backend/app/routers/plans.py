import json
from datetime import date, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.db import get_conn
from app.auth import current_user
from app.planner import generate_plan

router = APIRouter()


class DayIn(BaseModel):
    date:     date
    location: str  # thuis | sportschool


class GenerateIn(BaseModel):
    week_start: date
    days:       list[DayIn]


class PlanExerciseUpdate(BaseModel):
    target_sets:     Optional[int]   = None
    target_reps:     Optional[int]   = None
    target_weight:   Optional[float] = None
    target_time_sec: Optional[int]   = None
    rest_sec:        Optional[int]   = None
    order_idx:       Optional[int]   = None


class AddExerciseIn(BaseModel):
    exercise_id:     int
    block_type:      str   = "strength"
    target_sets:     Optional[int]   = None
    target_reps:     Optional[int]   = None
    target_weight:   Optional[float] = None
    target_time_sec: Optional[int]   = None
    rest_sec:        int   = 90


@router.get("/week")
def get_week_plan(week_start: date, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM week_plans WHERE user_id=%s AND week_start=%s",
                (user["user_id"], week_start)
            )
            plan = cur.fetchone()
            if not plan:
                return None

            cur.execute(
                "SELECT * FROM day_plans WHERE week_plan_id=%s ORDER BY date",
                (plan["id"],)
            )
            days = [dict(d) for d in cur.fetchall()]

            for day in days:
                cur.execute("""
                    SELECT pe.*, e.name_nl, e.name_en, e.category,
                           e.muscles_primary, e.is_cardio
                    FROM plan_exercises pe
                    JOIN exercises e ON e.id = pe.exercise_id
                    WHERE pe.day_plan_id = %s
                    ORDER BY pe.order_idx
                """, (day["id"],))
                day["exercises"] = [dict(r) for r in cur.fetchall()]

    result = dict(plan)
    result["days"] = days
    return result


@router.post("/generate", status_code=201)
def generate_week_plan(data: GenerateIn, user=Depends(current_user)):
    """Genereer automatisch een weekplan. Verwijdert bestaand concept als dat bestaat."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Haal profiel op
            cur.execute(
                "SELECT goal, intensity_mode, weekly_set_targets FROM profiles WHERE user_id=%s",
                (user["user_id"],)
            )
            profile_row = cur.fetchone()
            if not profile_row:
                raise HTTPException(400, "Geen profiel gevonden — registreer eerst een profiel")
            profile = dict(profile_row)

            # Maak of update weekplan
            cur.execute("""
                INSERT INTO week_plans (user_id, week_start, status)
                VALUES (%s, %s, 'draft')
                ON CONFLICT (user_id, week_start)
                DO UPDATE SET status='draft'
                RETURNING id
            """, (user["user_id"], data.week_start))
            week_plan_id = cur.fetchone()["id"]

            # Verwijder bestaande dag- en oefeningplannen
            cur.execute(
                "DELETE FROM day_plans WHERE week_plan_id=%s",
                (week_plan_id,)
            )

        conn.commit()

    # Roep planningsmotor aan (buiten transactie voor performance)
    training_days = [{"date": d.date, "location": d.location} for d in data.days]
    day_results   = generate_plan(profile, training_days)

    # Sla gegenereerde plannen op
    with get_conn() as conn:
        with conn.cursor() as cur:
            for day_data in day_results:
                cur.execute(
                    "INSERT INTO day_plans (week_plan_id, date, location) VALUES (%s, %s, %s) RETURNING id",
                    (week_plan_id, day_data["date"], day_data["location"])
                )
                day_plan_id = cur.fetchone()["id"]

                for ex in day_data["exercises"]:
                    cur.execute("""
                        INSERT INTO plan_exercises
                            (day_plan_id, exercise_id, order_idx, block_type,
                             target_sets, target_reps, target_weight, target_time_sec, rest_sec)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        day_plan_id, ex["exercise_id"], ex["order_idx"], ex["block_type"],
                        ex["target_sets"], ex["target_reps"], ex["target_weight"],
                        ex["target_time_sec"], ex["rest_sec"]
                    ))
        conn.commit()

    return {"week_plan_id": week_plan_id, "days_generated": len(day_results)}


@router.get("/day/{day_plan_id}")
def get_day_plan(day_plan_id: int, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT dp.*, wp.user_id
                FROM day_plans dp
                JOIN week_plans wp ON wp.id = dp.week_plan_id
                WHERE dp.id = %s
            """, (day_plan_id,))
            day = cur.fetchone()
            if not day or day["user_id"] != user["user_id"]:
                raise HTTPException(404, "Dagplan niet gevonden")

            cur.execute("""
                SELECT pe.*, e.name_nl, e.name_en, e.category,
                       e.muscles_primary, e.muscles_secondary,
                       e.image_url, e.is_cardio, e.equipment
                FROM plan_exercises pe
                JOIN exercises e ON e.id = pe.exercise_id
                WHERE pe.day_plan_id = %s
                ORDER BY pe.order_idx
            """, (day_plan_id,))
            exercises = [dict(r) for r in cur.fetchall()]

    result = dict(day)
    result.pop("user_id", None)
    result["exercises"] = exercises
    return result


@router.patch("/exercise/{plan_ex_id}")
def update_plan_exercise(plan_ex_id: int, data: PlanExerciseUpdate, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Controleer eigenaarschap
            cur.execute("""
                SELECT wp.user_id FROM plan_exercises pe
                JOIN day_plans dp ON dp.id = pe.day_plan_id
                JOIN week_plans wp ON wp.id = dp.week_plan_id
                WHERE pe.id = %s
            """, (plan_ex_id,))
            row = cur.fetchone()
            if not row or row["user_id"] != user["user_id"]:
                raise HTTPException(403, "Geen toegang")

            fields = {k: v for k, v in data.dict().items() if v is not None}
            for field, val in fields.items():
                cur.execute(f"UPDATE plan_exercises SET {field}=%s WHERE id=%s", (val, plan_ex_id))
        conn.commit()
    return {"ok": True}


@router.delete("/exercise/{plan_ex_id}", status_code=204)
def delete_plan_exercise(plan_ex_id: int, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT wp.user_id FROM plan_exercises pe
                JOIN day_plans dp ON dp.id = pe.day_plan_id
                JOIN week_plans wp ON wp.id = dp.week_plan_id
                WHERE pe.id = %s
            """, (plan_ex_id,))
            row = cur.fetchone()
            if not row or row["user_id"] != user["user_id"]:
                raise HTTPException(403, "Geen toegang")
            cur.execute("DELETE FROM plan_exercises WHERE id=%s", (plan_ex_id,))
        conn.commit()


@router.post("/day/{day_plan_id}/exercises", status_code=201)
def add_exercise_to_day(day_plan_id: int, data: AddExerciseIn, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT wp.user_id FROM day_plans dp
                JOIN week_plans wp ON wp.id = dp.week_plan_id
                WHERE dp.id = %s
            """, (day_plan_id,))
            row = cur.fetchone()
            if not row or row["user_id"] != user["user_id"]:
                raise HTTPException(403, "Geen toegang")

            cur.execute(
                "SELECT COALESCE(MAX(order_idx),0)+1 AS next_idx FROM plan_exercises WHERE day_plan_id=%s",
                (day_plan_id,)
            )
            next_idx = cur.fetchone()["next_idx"]

            cur.execute("""
                INSERT INTO plan_exercises
                    (day_plan_id, exercise_id, order_idx, block_type,
                     target_sets, target_reps, target_weight, target_time_sec, rest_sec)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                day_plan_id, data.exercise_id, next_idx, data.block_type,
                data.target_sets, data.target_reps, data.target_weight,
                data.target_time_sec, data.rest_sec
            ))
            new_id = cur.fetchone()["id"]
        conn.commit()
    return {"id": new_id}
