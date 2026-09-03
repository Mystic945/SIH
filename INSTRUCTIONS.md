# AgriQueue — Setup & Demo Instructions

Smart procurement slot booking, live token queue and payment tracking for farmers.
Built for Smart India Hackathon.

---

## 1. What you need installed

| Tool | Version used | Check with |
|---|---|---|
| Node.js | 20 or newer (built on 24) | `node -v` |
| npm | 10 or newer | `npm -v` |
| Python | 3.10 or newer (built on 3.12) | `python --version` |
| MongoDB Atlas | free M0 cluster | — |

---

## 2. Get a MongoDB Atlas connection string

1. Go to <https://cloud.mongodb.com> and create a free **M0** cluster.
2. **Database Access** → *Add New Database User* → note the username and password.
3. **Network Access** → *Add IP Address* → choose **Allow access from anywhere**
   (`0.0.0.0/0`). This step is the most common reason the backend cannot connect.
4. **Clusters → Connect → Drivers** → copy the connection string. It looks like:

   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

5. Insert the database name `agriqueue` before the `?`:

   ```
   mongodb+srv://myuser:mypass@cluster0.xxxxx.mongodb.net/agriqueue?retryWrites=true&w=majority
   ```

> If your password contains `@ : / ?` or `#`, URL-encode it (`@` → `%40`).

---

## 3. Configure the two backends

`.env` files already exist and currently point at a local MongoDB so the project
runs out of the box. Replace the `MONGO_URI` line in **both** files with your
Atlas string — the two services must share the same database.

**`backend/express-api/.env`**

```env
MONGO_URI=mongodb+srv://myuser:mypass@cluster0.xxxxx.mongodb.net/agriqueue?retryWrites=true&w=majority
```

**`backend/fastapi-service/.env`**

```env
MONGO_URI=mongodb+srv://myuser:mypass@cluster0.xxxxx.mongodb.net/agriqueue?retryWrites=true&w=majority
```

Leave everything else as-is for the demo. Before deploying anywhere public,
change `JWT_SECRET` and `INTERNAL_API_KEY` to long random strings.

---

## 4. Install dependencies

Run each block once, from the project root.

**Express API**

```bash
cd backend/express-api && npm install
```

**FastAPI service** (a virtual environment keeps it isolated)

```bash
cd backend/fastapi-service && python -m venv .venv && .venv\Scripts\python.exe -m pip install -r requirements.txt
```

On macOS/Linux use `.venv/bin/python` instead of `.venv\Scripts\python.exe`.

**Frontend**

```bash
cd frontend && npm install
```

---

## 5. Load the demo data

This wipes the AgriQueue collections and creates 6 procurement centres, 540
farmers, staff accounts, 21 days of schedules, ~1,700 bookings spread across
past/today/upcoming, and sample grievances.

```bash
cd backend/express-api && npm run seed
```

> Stop the Express server before seeding. If it is running, its background queue
> watcher writes to the same collections while the seed clears them, which can
> make the seed fail.

---

## 6. Run all three services

Open **three terminals**.

**Terminal 1 — Express API (port 5000)**

```bash
cd backend/express-api && npm run dev
```

**Terminal 2 — FastAPI service (port 8000)**

```bash
cd backend/fastapi-service && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**Terminal 3 — Frontend (port 5173)**

```bash
cd frontend && npm run dev
```

Then open <http://localhost:5173>.

### Confirm both backends are talking to each other

```bash
curl http://localhost:5000/health
```

You want `"mongo": {"state":"connected"}` and `"fastapi": {"reachable": true}`.
Interactive API docs for the Python service: <http://localhost:8000/docs>.

---

## 7. Demo logins

| Role | Credentials |
|---|---|
| Farmer | phone `9876543210`, OTP `123456` |
| District admin (all centres) | `admin` / `admin123` |
| Centre staff | `mphsg`, `pbldh`, `upbly`, `mhltr`, `rjkot`, `tskrm` — all `admin123` |

In development the real OTP is also shown on screen, so **any** seeded farmer
number works. Other seeded numbers follow the pattern `9800000000`+.

---

## 8. Suggested demo script for the judges (about 5 minutes)

Open two browser windows side by side — farmer on the left, staff on the right.
This is what makes the realtime layer obvious.

1. **Landing page** — state the problem, scroll past the live SMS ticker.
2. **Public Dashboard** (`/transparency`) — figures are computed live by the
   **FastAPI** service: quintals procured, amount disbursed, resolution rate.
   Say out loud that this endpoint is served by the Python backend.
3. **Sign in as the farmer** → *Book Slot*. Point out the **Recommended slots**
   panel — FastAPI ranks the least-congested slots to spread arrivals out.
   Complete a booking and land on the token screen.
4. **Right window: staff sign-in** (`mhltr` / `admin123`) → Centre Dashboard.
   Find the farmer's token and press **Advance Stage**.
5. **Left window updates instantly** — position, ETA and the pipeline move
   without a refresh. Repeat through Quality Check → Weighment (enter a net
   weight) → Payment Initiated → Paid.
6. **Alerts page** — every step generated a bilingual SMS. Note that the message
   language follows each farmer's profile.
7. **Complaints** — raise a payment dispute as the farmer; resolve it as staff.
   Payment and weight disputes auto-escalate to a 24-hour SLA.
8. **Reports** (`/admin/analytics`) — footfall forecast, measured stage
   durations, and a broadcast that dispatches from **FastAPI** while every other
   message came from **Express**. The outbox tags each one with its source.
9. **Toggle to हिन्दी** at any point. The whole interface, including SMS copy,
   switches language.

---

## 9. How the two backends divide the work

This is the question judges usually ask, so the split is deliberate:

```
                     ┌──────────────────────────────┐
   Browser ────────► │  Express API      :5000      │
   (one origin)      │  transactional core          │
                     │  auth · bookings · stages    │
                     │  grievances · Socket.IO      │
                     └──────┬───────────────┬───────┘
                            │               │
                  /api/v1/intel/*           │
                            │               │
                     ┌──────▼───────┐       │
                     │ FastAPI :8000│       │
                     │ analytics    │       │
                     │ ETA model    │       │
                     │ forecasting  │       │
                     │ bulk SMS     │       │
                     └──────┬───────┘       │
                            │               │
                     ┌──────▼───────────────▼───────┐
                     │      MongoDB Atlas           │
                     │   one shared database        │
                     └──────────────────────────────┘
```

- **Express owns every write** to bookings and stages, so there is exactly one
  writer for the transactional data and no split-brain risk.
- **FastAPI is read-mostly**: aggregation pipelines, the ETA model and
  forecasting, where Python is the better tool. Its only writes are bulk
  notification records.
- **Express fronts FastAPI** at `/api/v1/intel/*`, so the browser deals with one
  origin and one CORS policy. If FastAPI is down, analytics panels degrade with a
  clear message and the core booking flow keeps working — try it by stopping
  terminal 2.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `MongoDB connection failed` | IP not whitelisted in Atlas → Network Access → allow `0.0.0.0/0`. Also check the password is URL-encoded. |
| `Analytics service is offline` on the dashboard | FastAPI (terminal 2) is not running. The rest of the app still works. |
| `Cannot reach the server` in the UI | Express (terminal 1) is not running on port 5000. |
| Port 5000 already in use | Change `PORT` in `backend/express-api/.env`, and `/api` proxy target in `frontend/vite.config.ts`. |
| Seed fails partway | Stop the Express server first, then re-run `npm run seed`. |
| Empty dashboards | Run the seed step. |
| OTP not accepted | Use `123456`, or read the demo OTP shown on the sign-in card. |
| Hindi text shows as boxes | The Google Fonts Devanagari file did not load — check your internet connection. |

---

## 11. Project layout

```
SIH/
├── frontend/                     React 18 + Vite + TypeScript + Tailwind
│   └── src/
│       ├── components/ui/        Button, Card, Input, Select, Dialog, Tabs
│       │   └── motion-primitives.tsx   21st.dev-style motion components
│       ├── components/           Navbar, StagePipeline, shared layout pieces
│       ├── pages/                Farmer-facing screens
│       ├── pages/admin/          Centre staff screens
│       ├── i18n/                 English + Hindi copy deck
│       ├── context/              Auth state
│       └── lib/                  API client, Socket.IO client, helpers
│
├── backend/
│   ├── express-api/              Node.js transactional core
│   │   └── src/
│   │       ├── models/           Mongoose schemas
│   │       ├── controllers/      Route handlers
│   │       ├── routes/           API surface + FastAPI proxy
│   │       ├── services/         queue/ETA, SMS, Socket.IO, watcher
│   │       ├── middleware/       auth, validation, errors
│   │       └── seed/             Demo data generator
│   │
│   └── fastapi-service/          Python analytics + intelligence
│       └── app/
│           ├── routers/          analytics, predictions, notifications, health
│           ├── services/         aggregation, ETA model, forecasting
│           └── models/           Pydantic schemas
│
├── docs/API.md                   Full endpoint reference
├── INSTRUCTIONS.md               This file
└── README.md                     Project overview
```

---

## 12. About the frontend components

The UI components in `frontend/src/components/ui/` are written in the
**21st.dev** idiom — aurora backgrounds, spotlight cards, number tickers, shiny
text, marquees and tilt cards — built directly into the project so there is no
install-time network dependency during a demo.

To pull additional components from the registry:

```bash
npx shadcn@latest add "https://21st.dev/r/<author>/<component>"
```

They install into the same `components/ui` folder and inherit the design tokens
already defined in `src/index.css` and `tailwind.config.js`.

Motion throughout is **Framer Motion**. Every animation is wrapped by a
`prefers-reduced-motion` guard in `index.css`, so the information stays intact
for users who disable animation.

---

## 13. Sending real SMS (optional)

The SMS layer is mocked by default: messages are rendered, persisted to MongoDB
and streamed into the UI, which is what you want on stage. To send real
messages, install Twilio, set `SMS_PROVIDER=TWILIO` plus your credentials in
`backend/express-api/.env`, and uncomment the Twilio branch in
`backend/express-api/src/services/sms.service.js`. Nothing else changes — every
call site goes through the same `sendSMS()` function.

---

## 14. Production build

```bash
cd frontend && npm run build
```

Output lands in `frontend/dist/`. Set `VITE_API_URL` and `VITE_SOCKET_URL` in
`frontend/.env` to your deployed Express URL before building, since the Vite dev
proxy only exists in development.
