from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.db import get_conn
from app.auth import current_user, require_admin, hash_password

router = APIRouter()


class ProfileUpdate(BaseModel):
    goal:               Optional[str]  = None
    intensity_mode:     Optional[str]  = None
    weekly_set_targets: Optional[dict] = None
    block_weeks:        Optional[int]  = None


class UserUpdate(BaseModel):
    name:     Optional[str] = None
    email:    Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None


@router.get("/")
def list_users(admin=Depends(require_admin)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, email, is_admin, created_at FROM users ORDER BY name"
            )
            return [dict(r) for r in cur.fetchall()]


@router.post("/", status_code=201)
def create_user(data: dict, admin=Depends(require_admin)):
    pw_hash = hash_password(data["password"])
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO users (name, email, password_hash, is_admin) "
                    "VALUES (%s, %s, %s, %s) RETURNING id",
                    (data["name"], data["email"], pw_hash, data.get("is_admin", False))
                )
                user_id = cur.fetchone()["id"]
                cur.execute("INSERT INTO profiles (user_id) VALUES (%s)", (user_id,))
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(400, "E-mailadres al in gebruik")
                raise
        conn.commit()
    return {"id": user_id}


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, admin=Depends(require_admin)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()


@router.patch("/{user_id}")
def update_user(user_id: int, data: UserUpdate, admin=Depends(require_admin)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            if data.name is not None:
                cur.execute("UPDATE users SET name=%s WHERE id=%s", (data.name, user_id))
            if data.email is not None:
                cur.execute("UPDATE users SET email=%s WHERE id=%s", (data.email, user_id))
            if data.password is not None:
                cur.execute("UPDATE users SET password_hash=%s WHERE id=%s",
                            (hash_password(data.password), user_id))
            if data.is_admin is not None:
                cur.execute("UPDATE users SET is_admin=%s WHERE id=%s", (data.is_admin, user_id))
        conn.commit()
    return {"ok": True}


@router.get("/me/profile")
def get_profile(user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM profiles WHERE user_id = %s",
                (user["user_id"],)
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Profiel niet gevonden")
    return dict(row)


@router.put("/me/profile")
def update_profile(data: ProfileUpdate, user=Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            if data.goal is not None:
                cur.execute("UPDATE profiles SET goal=%s WHERE user_id=%s",
                            (data.goal, user["user_id"]))
            if data.intensity_mode is not None:
                cur.execute("UPDATE profiles SET intensity_mode=%s WHERE user_id=%s",
                            (data.intensity_mode, user["user_id"]))
            if data.weekly_set_targets is not None:
                import json
                cur.execute("UPDATE profiles SET weekly_set_targets=%s WHERE user_id=%s",
                            (json.dumps(data.weekly_set_targets), user["user_id"]))
            if data.block_weeks is not None:
                cur.execute("UPDATE profiles SET block_weeks=%s WHERE user_id=%s",
                            (data.block_weeks, user["user_id"]))
        conn.commit()
    return {"ok": True}
