# No Pain No Gain

Trainingsschema-app voor meerdere personen — React+Vite frontend, FastAPI backend, PostgreSQL, Docker.

**Live:** https://sporten.mountainsense.nl

## Poorten

| Service        | Poort | Omschrijving                    |
|----------------|-------|---------------------------------|
| Frontend nginx | 8200  | React SPA + proxy naar backend  |
| Backend uvicorn| 8201  | FastAPI REST API                |
| PostgreSQL     | 5437  | Eigen geïsoleerde database      |

## Lokale ontwikkeling

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # pas DATABASE_URL en SECRET_KEY aan
uvicorn app.main:app --reload --port 8201
```

### Frontend
```bash
cd frontend
npm install
npm run dev                  # start op :5173, proxyt /api → :8201
```

### Docker (alles tegelijk)
```bash
cp backend/.env.example backend/.env   # pas aan
docker compose up --build
```

## Eerste keer opzetten (VPS)

```bash
# 1. Clone repo
git clone https://github.com/mkoks75/no-pain-no-gain.git /opt/no-pain-no-gain
cd /opt/no-pain-no-gain

# 2. Maak .env aan
cp backend/.env.example backend/.env
nano backend/.env           # vul DATABASE_URL, SECRET_KEY en POSTGRES_PASSWORD in

# 3. Start containers
docker compose up --build -d

# 4. Nginx config
sudo cp nginx/sporten.mountainsense.nl.conf /etc/nginx/sites-available/sporten.mountainsense.nl
sudo ln -s /etc/nginx/sites-available/sporten.mountainsense.nl /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. SSL certificaat aanvragen
sudo certbot --nginx -d sporten.mountainsense.nl
```

## Oefeningen synchroniseren (wger)

```bash
# Vanuit de VPS, eenmalig na eerste deployment:
docker compose exec backend python -m scripts.sync_wger
docker compose exec backend python -m scripts.add_manual
```

Of lokaal:
```bash
cd backend
python -m scripts.sync_wger
python -m scripts.add_manual
```

## Admin-account aanmaken

Registreer via https://sporten.mountainsense.nl — de **eerste** gebruiker die zich
registreert wordt automatisch admin. Volgende gebruikers kun je daarna aanmaken via
het admin-paneel of de `/api/docs` Swagger UI.

Via de API:
```bash
curl -X POST https://sporten.mountainsense.nl/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Beheerder","email":"admin@example.com","password":"sterk_wachtwoord"}'
```

## CI/CD (GitHub Actions)

Bij elke push naar `main` deployt de pipeline automatisch naar de VPS.
Stel deze secrets in op GitHub → Settings → Secrets:

| Secret       | Waarde             |
|--------------|--------------------|
| VPS_HOST     | 37.27.221.241      |
| VPS_USER     | root (of eigen)    |
| VPS_KEY      | Privésleutel SSH   |
| VPS_PORT     | 22 (optioneel)     |

## API documentatie

Swagger UI beschikbaar op: https://sporten.mountainsense.nl/api/docs

## Stack

- **Frontend:** React 19 + Vite 6 + React Router + Recharts
- **Backend:** FastAPI + psycopg2 + bcrypt + JWT (python-jose)
- **Database:** PostgreSQL 16
- **Infra:** Docker Compose, Nginx, Let's Encrypt, GitHub Actions
