import os
import uuid
from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from app.db import get_conn
from app.auth import current_user, require_admin

router = APIRouter()

UPLOAD_DIR = "/app/uploads/exercises"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB


class ExercisePatch(BaseModel):
    name_nl:            Optional[str]  = None
    custom_description: Optional[str]  = None
    hidden:             Optional[bool] = None


@router.get("/")
def list_exercises(
    q:        Optional[str]  = Query(None),
    location: Optional[str]  = Query(None),
    cardio:   Optional[bool] = Query(None),
    muscle:   Optional[str]  = Query(None),
    user=Depends(current_user)
):
    filters = ["hidden = FALSE"]
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
                       COALESCE(custom_image_url, image_url) AS image_url,
                       custom_description, hidden,
                       available_home, available_gym, is_cardio
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
            cur.execute("""
                SELECT *, COALESCE(custom_image_url, image_url) AS image_url
                FROM exercises WHERE id = %s
            """, (exercise_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Oefening niet gevonden")
    return dict(row)


@router.patch("/{exercise_id}")
def patch_exercise(exercise_id: int, data: ExercisePatch, admin=Depends(require_admin)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            if data.name_nl is not None:
                cur.execute("UPDATE exercises SET name_nl=%s WHERE id=%s",
                            (data.name_nl, exercise_id))
            if data.custom_description is not None:
                cur.execute("UPDATE exercises SET custom_description=%s WHERE id=%s",
                            (data.custom_description, exercise_id))
            if data.hidden is not None:
                cur.execute("UPDATE exercises SET hidden=%s WHERE id=%s",
                            (data.hidden, exercise_id))
        conn.commit()
    return {"ok": True}


@router.post("/{exercise_id}/image")
def upload_exercise_image(
    exercise_id: int,
    file: UploadFile = File(...),
    admin=Depends(require_admin),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Alleen JPEG, PNG, WebP of GIF toegestaan")
    contents = file.file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, "Afbeelding is groter dan 5 MB")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{exercise_id}_{uuid.uuid4().hex[:8]}.{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(contents)

    url = f"/uploads/exercises/{filename}"
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE exercises SET custom_image_url=%s WHERE id=%s",
                        (url, exercise_id))
        conn.commit()

    return {"url": url}
