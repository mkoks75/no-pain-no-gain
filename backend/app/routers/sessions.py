from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.db import get_conn
from app.auth import current_user

router = APIRouter()


class SessionStart(BaseModel):
    day_plan_id: Optional[int] = None


class SessionFinish(BaseModel):
    notes: Optional[str] = None


class SetLog(BaseModel):
    exercise_id: int
    set_number:  int
    reps:        Optional[int]   = None
    weight:      Optional[float] = None
    time_sec:    Optional[int]   = None
    completed:   bool = True


@router.get("/")
def list_sessions(user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ws.id, ws.day_plan_id, ws.started_at, ws.finished_at, ws.notes,
                       dp.date, dp.location
                FROM workout_sessions ws
                LEFT JOIN day_plans dp ON dp.id = ws.day_plan_id
                WHERE ws.user_id = %s
                ORDER BY ws.started_at DESC
                LIMIT 50
            """, (user["user_id"],))
            return [dict(r) for r in cur.fetchall()]


@router.post("/", status_code=201)
def start_session(data: SessionStart, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO workout_sessions (user_id, day_plan_id) VALUES (%s, %s) RETURNING id",
                (user["user_id"], data.day_plan_id)
            )
            session_id = cur.fetchone()["id"]
        conn.commit()
    return {"id": session_id}


@router.patch("/{session_id}/finish")
def finish_session(session_id: int, data: SessionFinish, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id FROM workout_sessions WHERE id=%s",
                (session_id,)
            )
            row = cur.fetchone()
            if not row or row["user_id"] != user["user_id"]:
                raise HTTPException(403, "Geen toegang")
            cur.execute(
                "UPDATE workout_sessions SET finished_at=NOW(), notes=%s WHERE id=%s",
                (data.notes, session_id)
            )
        conn.commit()
    return {"ok": True}


@router.get("/{session_id}")
def get_session(session_id: int, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ws.*, dp.date, dp.location
                FROM workout_sessions ws
                LEFT JOIN day_plans dp ON dp.id = ws.day_plan_id
                WHERE ws.id = %s AND ws.user_id = %s
            """, (session_id, user["user_id"]))
            session = cur.fetchone()
            if not session:
                raise HTTPException(404, "Sessie niet gevonden")

            cur.execute("""
                SELECT ss.*, e.name_nl, e.name_en
                FROM session_sets ss
                JOIN exercises e ON e.id = ss.exercise_id
                WHERE ss.session_id = %s
                ORDER BY ss.exercise_id, ss.set_number
            """, (session_id,))
            sets = [dict(r) for r in cur.fetchall()]

    result = dict(session)
    result["sets"] = sets
    return result


@router.post("/{session_id}/sets", status_code=201)
def log_set(session_id: int, data: SetLog, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id FROM workout_sessions WHERE id=%s",
                (session_id,)
            )
            row = cur.fetchone()
            if not row or row["user_id"] != user["user_id"]:
                raise HTTPException(403, "Geen toegang")

            cur.execute("""
                INSERT INTO session_sets
                    (session_id, exercise_id, set_number, reps, weight, time_sec, completed)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (session_id, data.exercise_id, data.set_number,
                  data.reps, data.weight, data.time_sec, data.completed))
            set_id = cur.fetchone()["id"]
        conn.commit()
    return {"id": set_id}


@router.patch("/{session_id}/sets/{set_id}")
def update_set(session_id: int, set_id: int, data: SetLog, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id FROM workout_sessions WHERE id=%s",
                (session_id,)
            )
            row = cur.fetchone()
            if not row or row["user_id"] != user["user_id"]:
                raise HTTPException(403, "Geen toegang")
            cur.execute(
                "UPDATE session_sets SET reps=%s, weight=%s, time_sec=%s, completed=%s WHERE id=%s",
                (data.reps, data.weight, data.time_sec, data.completed, set_id)
            )
        conn.commit()
    return {"ok": True}
