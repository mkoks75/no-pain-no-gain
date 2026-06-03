# No Pain No Gain

Workout tracker — React + Vite frontend, FastAPI backend, Docker.

## Ontwikkeling

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Docker
```bash
cp backend/.env.example backend/.env
docker compose up --build
```

| Service   | URL                      |
|-----------|--------------------------|
| Frontend  | http://localhost         |
| Backend   | http://localhost:8000    |
| API docs  | http://localhost:8000/docs |
