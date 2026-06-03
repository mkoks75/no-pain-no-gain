import bcrypt
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from app.db import get_conn
from app.auth import make_token, current_user, hash_password

router = APIRouter()


class Token(BaseModel):
    access_token: str
    token_type:   str
    is_admin:     bool
    user_id:      int


class RegisterIn(BaseModel):
    name:     str
    email:    str
    password: str


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends()):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, password_hash, is_admin FROM users WHERE email = %s",
                (form.username,)
            )
            row = cur.fetchone()

    if not row or not bcrypt.checkpw(form.password.encode(), row["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Onjuiste inloggegevens")

    token = make_token({
        "sub":      str(row["id"]),
        "user_id":  row["id"],
        "is_admin": row["is_admin"],
    })
    return Token(access_token=token, token_type="bearer",
                 is_admin=row["is_admin"], user_id=row["id"])


@router.post("/register", status_code=201)
def register(data: RegisterIn):
    """Registreer een nieuwe gebruiker. De eerste gebruiker wordt automatisch admin."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as cnt FROM users")
            is_first = cur.fetchone()["cnt"] == 0
            pw_hash  = hash_password(data.password)
            try:
                cur.execute(
                    "INSERT INTO users (name, email, password_hash, is_admin) "
                    "VALUES (%s, %s, %s, %s) RETURNING id",
                    (data.name, data.email, pw_hash, is_first)
                )
                user_id = cur.fetchone()["id"]
                # Maak standaard profiel
                cur.execute(
                    "INSERT INTO profiles (user_id) VALUES (%s)",
                    (user_id,)
                )
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(400, "E-mailadres al in gebruik")
                raise
        conn.commit()
    return {"id": user_id, "is_admin": is_first}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, email, is_admin, created_at FROM users WHERE id = %s",
                (user["user_id"],)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Gebruiker niet gevonden")
            cur.execute(
                "SELECT goal, intensity_mode, weekly_set_targets FROM profiles WHERE user_id = %s",
                (user["user_id"],)
            )
            profile = cur.fetchone()
    result = dict(row)
    result["profile"] = dict(profile) if profile else None
    return result
