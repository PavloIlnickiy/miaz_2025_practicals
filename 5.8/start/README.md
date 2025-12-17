# Operatyvnyi Dashboard (PostgreSQL -> FastAPI -> SimpleJS)

## Run (Windows, PowerShell)

1) Create venv:
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

2) Create DB:
psql -d postgres -c "CREATE DATABASE operatyvnyi_dashbord;"

3) Init schema:
.\scripts\init_db.ps1

4) Seed data:
.\scripts\seed_db.ps1

5) Run API:
uvicorn api.main:app --reload

6) Run Web:
cd web
python -m http.server 5500

Open:
http://localhost:5500/?view=analyst
