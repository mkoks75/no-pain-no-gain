from fastapi import APIRouter, Depends
from app.db import get_conn
from app.auth import current_user

router = APIRouter()


@router.get("/")
def list_favorites(user=Depends(current_user)):
    """Geeft alle exercise_ids terug die de gebruiker als favoriet heeft."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT exercise_id FROM favorites WHERE user_id=%s ORDER BY created_at",
                (user["user_id"],)
            )
            return [r["exercise_id"] for r in cur.fetchall()]


@router.post("/{exercise_id}", status_code=201)
def add_favorite(exercise_id: int, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO favorites (user_id, exercise_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (user["user_id"], exercise_id)
            )
        conn.commit()
    return {"ok": True}


@router.delete("/{exercise_id}", status_code=204)
def remove_favorite(exercise_id: int, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM favorites WHERE user_id=%s AND exercise_id=%s",
                (user["user_id"], exercise_id)
            )
        conn.commit()
