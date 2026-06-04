import os
import uuid
from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from app.db import get_conn
from app.auth import current_user

router = APIRouter()

UPLOAD_DIR = "/app/uploads/exercises"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB

VALID_MUSCLES = {
    "Chest", "Lats", "Shoulders", "Biceps", "Triceps",
    "Quads", "Hamstrings", "Glutes", "Calves", "Abs",
}


class ExercisePatch(BaseModel):
    name_nl:            Optional[str]       = None
    custom_description: Optional[str]       = None
    hidden:             Optional[bool]      = None
    # Extra velden voor eigen oefeningen
    name_en:            Optional[str]       = None
    category:           Optional[str]       = None
    muscles_primary:    Optional[list[str]] = None
    muscles_secondary:  Optional[list[str]] = None
    equipment:          Optional[list[str]] = None
    available_home:     Optional[bool]      = None
    available_gym:      Optional[bool]      = None
    is_cardio:          Optional[bool]      = None


class ExerciseCreate(BaseModel):
    name_nl:            str
    name_en:            Optional[str]  = None
    category:           Optional[str]  = None
    muscles_primary:    list[str]      = []
    muscles_secondary:  list[str]      = []
    equipment:          list[str]      = []
    available_home:     bool           = True
    available_gym:      bool           = True
    is_cardio:          bool           = False
    custom_description: Optional[str]  = None


class StatusIn(BaseModel):
    status: str  # 'favoriet' | 'actief' | 'inactief'


@router.get("/")
def list_exercises(
    q:               Optional[str]  = Query(None),
    location:        Optional[str]  = Query(None),
    cardio:          Optional[bool] = Query(None),
    muscle:          Optional[str]  = Query(None),
    include_inactive: bool          = Query(False),
    user=Depends(current_user)
):
    filters = ["e.hidden = FALSE"]
    params  = [user["user_id"]]

    if q:
        filters.append("(e.name_nl ILIKE %s OR e.name_en ILIKE %s)")
        params += [f"%{q}%", f"%{q}%"]
    if location == "thuis":
        filters.append("e.available_home = TRUE")
    elif location == "sportschool":
        filters.append("e.available_gym = TRUE")
    if cardio is not None:
        filters.append("e.is_cardio = %s")
        params.append(cardio)
    if muscle:
        filters.append("(e.muscles_primary @> %s::text[] OR e.muscles_secondary @> %s::text[])")
        params += [[muscle], [muscle]]
    if not include_inactive:
        filters.append("COALESCE(es.status, 'actief') <> 'inactief'")

    where = " AND ".join(filters)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT e.id, e.name_nl, e.name_en, e.category, e.equipment,
                       e.muscles_primary, e.muscles_secondary,
                       COALESCE(e.custom_image_url, e.image_url) AS image_url,
                       e.custom_description, e.hidden,
                       e.available_home, e.available_gym, e.is_cardio,
                       e.is_custom, e.created_by,
                       COALESCE(es.status, 'actief') AS status
                FROM exercises e
                LEFT JOIN exercise_status es
                       ON es.exercise_id = e.id AND es.user_id = %s
                WHERE {where}
                ORDER BY COALESCE(e.name_nl, e.name_en)
                LIMIT 200
            """, params)
            return [dict(r) for r in cur.fetchall()]


@router.post("/", status_code=201)
def create_exercise(data: ExerciseCreate, user=Depends(current_user)):
    invalid = set(data.muscles_primary + data.muscles_secondary) - VALID_MUSCLES
    if invalid:
        raise HTTPException(400, f"Ongeldige spiergroepen: {', '.join(invalid)}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO exercises
                    (name_nl, name_en, category, muscles_primary, muscles_secondary,
                     equipment, available_home, available_gym, is_cardio,
                     custom_description, is_custom, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s)
                RETURNING id
            """, (
                data.name_nl, data.name_en or None, data.category or None,
                data.muscles_primary, data.muscles_secondary,
                data.equipment, data.available_home, data.available_gym,
                data.is_cardio, data.custom_description or None,
                user["user_id"],
            ))
            new_id = cur.fetchone()["id"]
        conn.commit()
    return {"id": new_id}


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


@router.put("/{exercise_id}/status")
def set_exercise_status(exercise_id: int, data: StatusIn, user=Depends(current_user)):
    if data.status not in ("favoriet", "actief", "inactief"):
        raise HTTPException(400, "Ongeldige status")
    with get_conn() as conn:
        with conn.cursor() as cur:
            if data.status == "actief":
                # Actief is de default — geen rij nodig
                cur.execute(
                    "DELETE FROM exercise_status WHERE user_id=%s AND exercise_id=%s",
                    (user["user_id"], exercise_id),
                )
            else:
                cur.execute("""
                    INSERT INTO exercise_status (user_id, exercise_id, status)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, exercise_id)
                    DO UPDATE SET status=%s, updated_at=now()
                """, (user["user_id"], exercise_id, data.status, data.status))
        conn.commit()
    return {"ok": True}


@router.patch("/{exercise_id}")
def patch_exercise(exercise_id: int, data: ExercisePatch, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT is_custom, created_by FROM exercises WHERE id=%s",
                (exercise_id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Oefening niet gevonden")

            is_admin  = bool(user.get("is_admin"))
            is_custom = bool(row["is_custom"])
            is_creator = row["created_by"] == user["user_id"]

            if not is_custom and not is_admin:
                raise HTTPException(403, "Geen beheerdersrechten")
            if is_custom and not is_admin and not is_creator:
                raise HTTPException(403, "Geen toegang tot deze oefening")

            # Bouw updates op
            updates: dict = {}
            if data.name_nl is not None:
                updates["name_nl"] = data.name_nl
            if data.custom_description is not None:
                updates["custom_description"] = data.custom_description
            if is_admin and data.hidden is not None:
                updates["hidden"] = data.hidden

            if is_custom:
                if data.name_en is not None:
                    updates["name_en"] = data.name_en
                if data.category is not None:
                    updates["category"] = data.category
                if data.muscles_primary is not None:
                    invalid = set(data.muscles_primary) - VALID_MUSCLES
                    if invalid:
                        raise HTTPException(400, f"Ongeldige spiergroepen: {', '.join(invalid)}")
                    updates["muscles_primary"] = data.muscles_primary
                if data.muscles_secondary is not None:
                    invalid = set(data.muscles_secondary) - VALID_MUSCLES
                    if invalid:
                        raise HTTPException(400, f"Ongeldige spiergroepen: {', '.join(invalid)}")
                    updates["muscles_secondary"] = data.muscles_secondary
                if data.equipment is not None:
                    updates["equipment"] = data.equipment
                if data.available_home is not None:
                    updates["available_home"] = data.available_home
                if data.available_gym is not None:
                    updates["available_gym"] = data.available_gym
                if data.is_cardio is not None:
                    updates["is_cardio"] = data.is_cardio

            for field, val in updates.items():
                cur.execute(f"UPDATE exercises SET {field}=%s WHERE id=%s", (val, exercise_id))
        conn.commit()
    return {"ok": True}


@router.post("/{exercise_id}/image")
def upload_exercise_image(
    exercise_id: int,
    file: UploadFile = File(...),
    user=Depends(current_user),
):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT is_custom, created_by FROM exercises WHERE id=%s",
                (exercise_id,)
            )
            ex = cur.fetchone()
    if not ex:
        raise HTTPException(404, "Oefening niet gevonden")

    is_admin   = bool(user.get("is_admin"))
    is_creator = bool(ex["is_custom"]) and ex["created_by"] == user["user_id"]
    if not is_admin and not is_creator:
        raise HTTPException(403, "Geen beheerdersrechten")

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
