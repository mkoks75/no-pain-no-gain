from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.db import get_conn
from app.auth import current_user, require_admin

router = APIRouter()


@router.get("/")
def list_exercises(
    q:        Optional[str]  = Query(None),
    location: Optional[str]  = Query(None),
    cardio:   Optional[bool] = Query(None),
    muscle:   Optional[str]  = Query(None),
    user=Depends(current_user)
):
    filters = ["TRUE"]
    params  = []

    if q:
        filters.append("(name_nl ILIKE %s OR name_en ILIKE %s)")
        params += [f"%{q}%", f"%{q}%"]
    if location == "thuis":
        filters.append("available_home = TRUE")
    elif location == "sportschool":
        filters.append("available_gym = TRUE")
    if cardio is not None:
        filters.append("is_cardio = %s")
        params.append(cardio)
    if muscle:
        filters.append("(muscles_primary @> %s::text[] OR muscles_secondary @> %s::text[])")
        params += [[muscle], [muscle]]

    where = " AND ".join(filters)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT id, name_nl, name_en, category, equipment,
                       muscles_primary, muscles_secondary,
                       image_url, available_home, available_gym, is_cardio
                FROM exercises
                WHERE {where}
                ORDER BY COALESCE(name_nl, name_en)
                LIMIT 200
            """, params)
            return [dict(r) for r in cur.fetchall()]


@router.get("/{exercise_id}")
def get_exercise(exercise_id: int, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM exercises WHERE id = %s", (exercise_id,))
            row = cur.fetchone()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(404, "Oefening niet gevonden")
    return dict(row)
