# Gym Notes

App PWA per gestire schede palestra con timer, storico, progressi e PDF salvati nel cloud.

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
| `R2_ENDPOINT`    | Endpoint Cloudflare R2/S3 compatibile |
| `R2_ACCESS_KEY_ID` | Access key per R2/S3               |
| `R2_SECRET_ACCESS_KEY` | Secret key per R2/S3          |
| `R2_BUCKET`      | Bucket dove salvare i PDF delle schede |

### Endpoint

| Metodo | Path               | Auth | Descrizione              |
|--------|--------------------|------|--------------------------|
| GET    | `/api/health`      | No   | Status servizio + DB     |
| POST   | `/api/auth/register` | No | Registrazione            |
| POST   | `/api/auth/login`  | No   | Login                    |
| GET    | `/api/auth/me`     | Si   | Utente corrente          |
| GET    | `/api/sync/data`   | Si   | Scarica dati gym         |
| PUT    | `/api/sync/data`   | Si   | Salva dati gym           |
| POST   | `/api/pdf/plans/:planId` | Si | Carica PDF scheda nel cloud |
| GET    | `/api/pdf/plans/:planId` | Si | Apre/scarica PDF scheda dal cloud |
| DELETE | `/api/pdf/plans/:planId` | Si | Rimuove PDF scheda dal cloud |

Il cloud è la fonte unica di verità per schede, allenamenti, esercizi, storico sessioni, sessione attiva e PDF. Il browser conserva in `localStorage` solo il token di autenticazione; i PDF vengono caricati su R2/S3 e letti dal backend quando servono.
