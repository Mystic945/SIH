# AgriQueue API Reference

Two services share one MongoDB Atlas database.

| Service | Base URL | Role |
|---|---|---|
| Express API | `http://localhost:5000/api/v1` | Transactional core — all writes to bookings and stages |
| FastAPI | `http://localhost:8000` | Analytics, ETA modelling, forecasting, bulk notifications |

Everything under `/api/v1/intel/*` on Express is proxied to FastAPI, so the
browser only ever talks to one origin. Proxied responses are wrapped as
`{ success: true, servedBy: "fastapi", data: ... }`.

## Conventions

- **Auth**: `Authorization: Bearer <jwt>`. Roles are `FARMER`, `STAFF`, `ADMIN`.
- **Success**: `{ "success": true, "data": ..., "message"?: "..." }`
- **Failure**: `{ "success": false, "message": "...", "details"?: [{field, message}] }`
- **Dates**: `YYYY-MM-DD` strings (stored as strings to avoid timezone drift).
- **Times**: `HH:mm` 24-hour.

### Pipeline stages

`BOOKED → ARRIVED → QUALITY_CHECK → WEIGHMENT → PAYMENT_INITIATED → PAID`

plus the terminal states `CANCELLED` and `NO_SHOW`.

---

## Health

### `GET /health` (Express, unversioned)

Reports both backends and the shared database in one call.

```json
{
  "service": "agriqueue-express-api",
  "status": "ok",
  "mongo": { "state": "connected", "db": "agriqueue" },
  "fastapi": { "reachable": true, "status": "ok", "mongo": true }
}
```

---

## Meta

### `GET /meta`
Commodities with MSP rates, pipeline stages, bilingual stage labels, languages.

### `GET /grievances/meta`
Complaint categories with English and Hindi labels, statuses, SLA note.

---

## Authentication

### `POST /auth/farmer/request-otp`
```json
{ "phone": "9876543210" }
```
Returns `{ isRegistered, expiresInSeconds, devOtp }`. `devOtp` is omitted in
production. Rate limited to 20 requests per 10 minutes.

### `POST /auth/farmer/verify-otp`
```json
{ "phone": "9876543210", "otp": "123456" }
```
Returns `{ token, user }`. Responds `404` with `{ needsRegistration: true }` if
the number is not registered. In development `123456` is always accepted.

### `POST /auth/farmer/register`
```json
{
  "name": "Ramesh Patil", "phone": "9876543210", "otp": "123456",
  "village": "Rampur", "district": "Narmadapuram", "state": "Madhya Pradesh",
  "landAcres": 4.5, "aadhaarLast4": "1234", "bankLast4": "4471",
  "preferredLanguage": "hi"
}
```

### `POST /auth/staff/login`
```json
{ "username": "mhltr", "password": "admin123" }
```

### `GET /auth/me` · `PATCH /auth/me`
Current profile. The PATCH is farmer-only and accepts `name`, `village`,
`district`, `state`, `landAcres`, `preferredLanguage`, `bankLast4`,
`aadhaarLast4`.

---

## Centres and schedules (public)

### `GET /centers`
Query: `state`, `district`, `commodity`, `q`.
Each centre carries today's live load: `todayBooked`, `todayRemaining`,
`todayStatus` (`open` | `filling` | `full`).

### `GET /centers/filters`
States, districts and commodities for the dropdowns.

### `GET /centers/:id`

### `GET /centers/:id/schedule?from=&days=`
One entry per date with `isOpen`, `dailyCapacity`, `booked`, `remaining`,
`status` and any note. Dates without a stored schedule are materialised from
centre defaults (closed on Sundays).

### `GET /centers/:id/slots?date=YYYY-MM-DD`
Bookable time slots with `booked`, `remaining`, `isAvailable`, `loadPct`.

---

## Queue (public)

### `GET /queue/:centerId?date=`
Live queue snapshot: ordered `queue[]` with `position`, `ahead`, `etaMins`,
`etaAt` and `inService`, plus `nowServing` and aggregate `stats`.

Ordering rules, in priority order:
1. Priority farmers (elderly / differently-abled) first
2. Farmers physically checked in beat those who have not arrived
3. Then slot start time, then token number

---

## Bookings

### `POST /bookings` — farmer
```json
{
  "centerId": "…", "slotDate": "2026-09-05",
  "slotStart": "09:00", "slotEnd": "09:30",
  "commodity": "WHEAT", "quantityQuintals": 18.5,
  "priority": false
}
```
Allocates the next token number for that centre and date, computes the MSP
value, sends a confirmation SMS and broadcasts the new queue over Socket.IO.

Rejects with `409` when: the farmer already has a token at that centre that day
(completed ones included — this is the anti-duplication control), the date is
fully booked, or the slot is full.

### `GET /bookings/mine?status=upcoming|past|all` — farmer

### `GET /bookings/:id` — owner or staff
Returns `{ booking, position }`. This is the live-tracker payload.

### `GET /bookings/track/:tokenCode` — **public**
Powers the SMS deep link, so it works on a borrowed handset. The farmer's
identity is masked to a first name.

### `PATCH /bookings/:id/cancel` — farmer
Only allowed while the token is still `BOOKED`; releases the slot and notifies.

---

## Grievances

### `POST /grievances` — farmer
```json
{
  "centerId": "…", "bookingId": "…",
  "category": "PAYMENT_DELAY",
  "subject": "Payment not received after weighment",
  "description": "…"
}
```
Categories: `WEIGHT_DISPUTE`, `PAYMENT_DELAY`, `QUALITY_REJECTION`, `LONG_WAIT`,
`STAFF_BEHAVIOUR`, `SLOT_ISSUE`, `OTHER`.

Payment and weight disputes are auto-set to `HIGH` priority with a 24-hour SLA;
everything else gets 72 hours. A farmer may hold at most 5 open complaints.

### `GET /grievances/mine` · `GET /grievances/:id` · `POST /grievances/:id/reply`

---

## Notifications

### `GET /notifications/mine?limit=` — farmer inbox
### `GET /notifications/feed?limit=&channel=&dispatchedBy=` — staff outbox
Includes a `summary.byService` breakdown showing which messages came from
Express and which from FastAPI.

---

## Admin (STAFF / ADMIN)

Staff are scoped to their own centre; `ADMIN` may target any centre with
`?centerId=`.

### `GET /admin/dashboard?date=&centerId=`
Queue snapshot plus `openGrievances`, a 7-day `weekTrend`, and today's payment
totals.

### `GET /admin/bookings?date=&stage=&q=`

### `PATCH /admin/bookings/:id/stage`
The single control that drives every farmer's live tracker.

```json
{
  "stage": "WEIGHMENT",
  "note": "…",
  "quality":   { "moisturePct": 11.2, "grade": "A" },
  "weighment": { "grossQuintals": 20, "netQuintals": 19.4, "bags": 39 }
}
```

Omit `stage` to advance one step. Side effects:
- `netQuintals` **recomputes the payable amount** — payment always follows
  verified weight, never the declared quantity.
- `PAYMENT_INITIATED` sets payment status and generates a UTR.
- `PAID` stamps `completedAt` and closes the token.
- Sends the matching bilingual SMS and broadcasts the queue update.

### `POST /admin/bookings/:id/notify`
Manual "your turn is next" nudge with the live position and ETA.

### `PATCH /admin/bookings/:id/no-show`
Only valid for tokens that never checked in.

### `GET /admin/schedule?from=&days=` · `PUT /admin/schedule`
```json
{ "date": "2026-09-05", "isOpen": true, "dailyCapacity": 150, "note": "…" }
```
Rejects a capacity lower than the number already booked for that date.

### `PATCH /admin/center`
`dailyCapacity`, `activeCounters`, `openTime`, `closeTime`, `slotDurationMins`,
`commodities`, `contactPhone`, `inchargeName`, `isActive`.
Changing `activeCounters` immediately changes every ETA at that centre.

### `GET /admin/grievances?status=&category=` · `PATCH /admin/grievances/:id`
```json
{ "message": "Verified with the bank.", "status": "RESOLVED" }
```
Resolving notifies the farmer by SMS.

---

## FastAPI intelligence service

Reachable directly at `:8000` (with `/docs`) or through Express at
`/api/v1/intel/*`.

### `GET /intel/analytics/overview`
Nationwide figures for the public transparency board: totals, today's numbers,
breakdowns by commodity and state, busiest centres, grievance resolution rate.

### `GET /intel/analytics/center/{center_id}?date=`
Per-centre funnel, hourly load, measured stage durations, average wait and
turnaround, throughput, capacity used, no-show rate.

### `GET /intel/analytics/trends?center_id=&days=`
Daily series of booked, served, quintals, amount and average turnaround.

### `GET /intel/analytics/report?state=&district=&date_from=&date_to=`
Centre-wise procurement report — the district-officer / RTI view.

### `GET /intel/eta/{center_id}?date=`
Live ETA per waiting token, derived from measured stage durations spread across
open counters. Returns the `model` description, the `stage_durations` it learned
from with sample counts, and a `confidence` level.

### `GET /intel/eta/booking/{booking_id}`
Single-token view for the farmer's tracker.

### `GET /intel/forecast/{center_id}?days=`
Predicted footfall with bounds, recommended counter count, and congestion risk.
Method: EWMA baseline (α = 0.4) over 28 days × weekday seasonality index, capped
at the centre's daily capacity.

### `POST /intel/recommend-slot`
```json
{ "center_id": "…", "date": "2026-09-05", "quantity_quintals": 12 }
```
Ranks bookable slots by expected wait so arrivals spread out. Returns bilingual
reasons for each suggestion.

### `POST /intel/admin/notify/broadcast` — requires staff auth via Express
```json
{
  "center_id": "…", "date": "2026-09-05", "stages": ["BOOKED"],
  "channel": "SMS", "message_en": "…", "message_hi": "…", "dry_run": false
}
```
Each farmer receives the version matching their profile language. Records are
tagged `dispatchedBy: "fastapi"`.

### `GET /intel/admin/notify/log?limit=&dispatched_by=`

---

## Socket.IO events

Connect to the Express origin.

**Client → server**

| Event | Payload | Purpose |
|---|---|---|
| `join:center` | `centerId` | Queue board for a centre |
| `leave:center` | `centerId` | |
| `join:booking` | `bookingId` | One farmer's own token screen |
| `join:admin` | — | Global control-room feed |

**Server → client**

| Event | Payload | Fired when |
|---|---|---|
| `queue:updated` | queue snapshot | Any stage change, booking, cancellation, or the 60-second watcher tick |
| `booking:updated` | booking | That specific token changes |
| `notification:new` | notification | An SMS/IVR/app alert is dispatched |
| `grievance:updated` | grievance | A complaint is raised or answered |

---

## Background jobs (Express)

A watcher runs every 60 seconds and:

1. Pushes a fresh queue snapshot to connected clients, so ETAs stay honest even
   when no staff action has occurred.
2. Sends the automatic "your turn is approaching" SMS once per token, when it
   reaches the front three positions.
3. After a centre's closing time, marks un-arrived tokens as `NO_SHOW`.

---

## Data model

| Collection | Purpose |
|---|---|
| `centers` | Procurement centres: capacity, counters, hours, commodities |
| `farmers` | Phone-verified profiles; only last-4 of Aadhaar and bank account |
| `bookings` | Tokens with full `stageHistory`, quality, weighment and payment |
| `schedules` | Per-centre per-date open/closed state, capacity and slot grid |
| `grievances` | Complaints with conversation thread and SLA tracking |
| `notifications` | Every SMS/IVR/app message, tagged with its dispatching service |
| `staffusers` | Centre operators and district admins (bcrypt) |
| `otprequests` | Short-lived OTPs with a Mongo TTL index |
