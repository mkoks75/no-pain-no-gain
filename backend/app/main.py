import os
import time
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import auth, users, exercises, plans, sessions, progress, favorites

app = FastAPI(title="No Pain No Gain API", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploads map aanmaken en als static files serveren
os.makedirs("/app/uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

app.include_router(auth.router,      prefix="/auth",      tags=["auth"])
app.include_router(users.router,     prefix="/users",     tags=["users"])
app.include_router(exercises.router, prefix="/exercises", tags=["exercises"])
app.include_router(plans.router,     prefix="/plans",     tags=["plans"])
app.include_router(sessions.router,  prefix="/sessions",  tags=["sessions"])
app.include_router(progress.router,  prefix="/progress",  tags=["progress"])
app.include_router(favorites.router, prefix="/favorites", tags=["favorites"])


@app.on_event("startup")
def wait_for_db():
    """Wacht op database bij opstart (geeft postgres tijd om te starten)."""
    from app.db import get_conn
    for attempt in range(30):
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            print("Database verbonden.")
            return
        except Exception as e:
            print(f"Wacht op database... ({attempt+1}/30): {e}")
            time.sleep(2)
    print("WAARSCHUWING: Database niet bereikbaar na 30 pogingen.")


@app.get("/")
def root():
    return {"status": "ok", "app": "no-pain-no-gain"}


@app.get("/health")
def health():
    return {"status": "healthy"}
