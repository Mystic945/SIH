# AgriQueue

**Smart slot booking, live token queue and procurement tracking for farmers.**

Smart India Hackathon prototype · React + Express + FastAPI + MongoDB Atlas

> Setup and demo steps live in **[INSTRUCTIONS.md](INSTRUCTIONS.md)**.
> Full endpoint reference in **[docs/API.md](docs/API.md)**.

---

## The problem

At MSP procurement centres, farmers arrive before sunrise with a loaded tractor
and wait an entire day without knowing when their turn will come. Procurement
dates and centre capacity are announced on paper notices, so wasted trips are
routine. After weighment there is no way to tell whether payment was initiated,
approved or credited.

Three gaps, concretely:

1. **No visibility of the schedule** before travelling to the centre.
2. **No position in the queue** once there — no token, no ETA, no order.
3. **No status after weighment** — payment disappears into a black box.

## What AgriQueue does

| Capability | How it works |
|---|---|
| **Farmer registration** | Phone + OTP. No email, no document upload. Only the last 4 digits of Aadhaar and bank account are ever stored. |
| **Procurement schedule** | Pick district → centre → see which dates are open, filling or full *before* travelling. |
| **Slot booking with a token** | Choose a date and time slot, get a token number instantly on screen and by SMS. |
| **Live queue tracker** | "Token #47, 12 farmers ahead, ~40 min" — updated over WebSockets the moment staff move the line. |
| **Stage pipeline** | Booked → Arrived → Quality Check → Weighment → Payment Initiated → Paid, each step timestamped and visible. |
| **Notifications** | Bilingual SMS/IVR for "your turn is near" and "payment credited", so a smartphone is not required. |
| **Grievances** | Raise a weight or payment dispute, track it against an SLA. Money-related disputes auto-escalate to 24 hours. |
| **Centre dashboard** | Today's queue, capacity, stage controls, schedule management, complaint handling. |
| **Public transparency board** | Quantity procured, amount disbursed, average turnaround and resolution rate — open to anyone. |

Everything is bilingual (English / हिन्दी), with large tap targets and
low-literacy-friendly wording, because the primary users are farmers on low-end
phones.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│  React 18 · Vite · TypeScript · Tailwind · Framer Motion   │
│  farmer portal  +  centre staff dashboard  (one SPA)       │
└───────────────┬───────────────────────────────────────────┘
                │  REST + Socket.IO, single origin
┌───────────────▼───────────────────────────────────────────┐
│  Express API  :5000        — transactional core           │
│  auth · bookings · stage updates · grievances · schedules │
│  Socket.IO rooms · SMS dispatch · background queue watcher│
└───────────────┬───────────────────────┬───────────────────┘
                │ proxies /api/v1/intel/*│
┌───────────────▼──────────┐            │
│  FastAPI  :8000          │            │
│  analytics aggregations  │            │
│  measured-ETA model      │            │
│  footfall forecasting    │            │
│  bulk notification jobs  │            │
└───────────────┬──────────┘            │
                │                       │
┌───────────────▼───────────────────────▼───────────────────┐
│              MongoDB Atlas — one shared database          │
│  centers · farmers · bookings · schedules · grievances    │
│  notifications · staffusers                               │
└───────────────────────────────────────────────────────────┘
```

### Why two backends

The split is by responsibility, not for show:

- **Express owns every write** to bookings and stages. One writer for
  transactional data means no split-brain and no distributed-transaction problem.
- **FastAPI is read-mostly.** Aggregation pipelines, the ETA model and
  forecasting are where Python earns its place. Its only writes are bulk
  notification records, tagged `dispatchedBy: "fastapi"` so the admin outbox
  shows which service sent what.
- **Express fronts FastAPI** so the browser sees one origin and one CORS policy.
  If the Python service is down, the analytics panels degrade with a clear
  message and the core booking flow keeps working.

### How the ETA is calculated

Not a hard-coded guess. The FastAPI service reads the last seven days of
`stageHistory` timestamps, computes the real median duration of each pipeline
step at that centre, sums the work still owed to every token ahead, and divides
by the number of counters the centre has actually opened today. The estimate
improves as the centre processes more tokens, and the dashboard shows the
sample count behind it.

---

## Tech stack

**Frontend** — React 18, Vite, TypeScript, Tailwind CSS, Framer Motion,
Radix primitives, Recharts, Socket.IO client. UI components are written in the
[21st.dev](https://21st.dev) idiom (aurora backgrounds, spotlight cards, number
tickers, marquees) and live in `src/components/ui/`.

**Express API** — Node.js 20+, Express 4, Mongoose 8, Socket.IO 4, JWT, Zod,
Helmet, rate limiting.

**FastAPI service** — Python 3.10+, FastAPI, Motor (async MongoDB), Pydantic v2,
Uvicorn.

**Database** — MongoDB Atlas.

---

## Quick start

```bash
cd backend/express-api && npm install && npm run seed && npm run dev
```

```bash
cd backend/fastapi-service && python -m venv .venv && .venv\Scripts\python.exe -m pip install -r requirements.txt
```

```bash
cd frontend && npm install && npm run dev
```

Then open <http://localhost:5173>. Full walkthrough, including the Atlas
connection string, is in [INSTRUCTIONS.md](INSTRUCTIONS.md).

**Demo logins** — farmer `9876543210` / OTP `123456`; admin `admin` / `admin123`.

---

## Project status

This is a working prototype, verified end to end: 58 automated checks cover
authentication, booking, the full stage pipeline, payment calculation from
verified net weight, notifications, grievances, schedule management, both
analytics services and the authorisation boundaries between farmer and staff
roles.

Known scope limits, stated honestly:

- SMS is mocked by default — messages are rendered, stored and displayed, but
  not delivered to a real handset. Swapping in Twilio is a single branch in
  `sms.service.js`.
- Token allocation uses a "find highest + 1" query rather than an atomic
  counter. Fine for a prototype; a production build needs a dedicated counters
  collection or a transaction.
- Payments are simulated end to end, including UTR generation. There is no
  banking integration.
- The IVR channel is modelled and logged but not wired to a voice provider.
