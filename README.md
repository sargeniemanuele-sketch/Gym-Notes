# Gym Notes

App PWA per gestire schede palestra con timer, storico e progressi.

## Struttura

```
Gym Notes/
  frontend/   # React + Vite PWA
  backend/    # Node.js + Express + MongoDB Atlas
```

## Frontend

```bash
cd frontend
npm install
npm run dev      # dev server su http://localhost:5173
npm run build    # build produzione
```

Deploy: Vercel (configurato con `frontend/vercel.json`)

## Backend

```bash
cd backend
npm install
cp .env.example .env   # compila con le tue credenziali
npm run dev            # dev server su http://localhost:4000
npm start              # produzione
```

### Variabili d'ambiente backend

| Variabile        | Descrizione                          |
|------------------|--------------------------------------|
| `PORT`           | Porta HTTP (default 4000)            |
| `MONGODB_URI`    | Connection string MongoDB Atlas      |
| `JWT_SECRET`     | Segreto per firmare i JWT            |
| `JWT_EXPIRES_IN` | Scadenza token (default `7d`)        |
| `ALLOWED_ORIGINS`| Origini CORS separate da virgola     |

### Endpoint

| Metodo | Path               | Auth | Descrizione              |
|--------|--------------------|------|--------------------------|
| GET    | `/api/health`      | No   | Status servizio + DB     |
| POST   | `/api/auth/register` | No | Registrazione            |
| POST   | `/api/auth/login`  | No   | Login                    |
| GET    | `/api/auth/me`     | Si   | Utente corrente          |
| GET    | `/api/sync/data`   | Si   | Scarica dati gym         |
| PUT    | `/api/sync/data`   | Si   | Salva dati gym           |

> Il PDF rimane esclusivamente nel browser (IndexedDB). Il backend non riceve né salva PDF.
