# ServTrack Backend — FastAPI + Supabase

No Docker. No local PostgreSQL. Just Python + Supabase free tier.

---

## Step 1 — Create your Supabase project

1. Go to https://supabase.com and sign up (free)
2. Click **New Project**
3. Fill in:
   - **Project name**: servtrack
   - **Database password**: pick a strong one, save it somewhere
   - **Region**: pick closest to you (ap-south-1 for India)
4. Wait ~2 minutes for the project to be ready

---

## Step 2 — Run the schema in Supabase SQL Editor

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Open the file `schema.sql` from this project
4. Paste the entire contents into the editor
5. Click **Run** (or Ctrl+Enter)
6. You should see: `Schema created successfully ✓`

This creates all tables, indexes, triggers, and seeds the contractors.

---

## Step 3 — Get your Database connection string

1. In Supabase, go to **Settings** → **Database**
2. Scroll to **Connection string**
3. Select the **URI** tab
4. Select **Session mode** (port 5432) — NOT Transaction mode
5. Copy the URI. It looks like:
   ```
   postgresql://postgres.abcdefgh:YOUR_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   ```
6. Replace `[YOUR-PASSWORD]` with the database password you set in Step 1

---

## Step 4 — Set up the Python environment

Open a terminal in the `servtrack-backend` folder.

```bash
# Create virtual environment
python -m venv venv

# Activate it
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

---

## Step 5 — Configure environment variables

```bash
# Copy the template
cp .env.example .env
```

Open `.env` in any text editor and fill in:

```env
# Paste your Supabase connection URI from Step 3
DATABASE_URL=postgresql://postgres.abcdefgh:YOUR_PASSWORD@aws-0-...

# Generate a secret key by running this in your terminal:
# python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=paste_output_here

ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
APP_ENV=development
ALLOWED_ORIGINS=http://localhost:3000
```

---

## Step 6 — Seed demo data

```bash
python seed.py
```

You should see:
```
14 users inserted
6 work orders inserted
Activity logs inserted

Demo credentials:
  admin@propertyclient.in   /  Admin@1234         (Client)
  manager@alphaserv.in      /  Contractor@1234    (Contractor)
  ramesh@alphaserv.in       /  Super@1234         (Supervisor)
  suresh@alphaserv.in       /  Work@1234          (Workman)
  security@property.in      /  User@1234          (End User)
```

---

## Step 7 — Start the API server

```bash
uvicorn app.main:app --reload
```

- API running at: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

---

## Verify it works

Open http://localhost:8000/docs in your browser.

Try the login endpoint:
```
POST /api/v1/auth/login
{
  "email": "admin@propertyclient.in",
  "password": "Admin@1234"
}
```

You'll get back a JWT token. Click **Authorize** at the top of the docs page, paste it in, and all other endpoints become available.

---

## API Endpoints — Quick Reference

All endpoints start with `/api/v1`.

### Auth
```
POST   /auth/login              Get JWT token
POST   /auth/register           Create a new user
GET    /auth/me                 Current user info
```

### Work Orders
```
GET    /work-orders/            List (automatically scoped to your role)
POST   /work-orders/            Create new work order
GET    /work-orders/{id}        Full detail with activity log
PATCH  /work-orders/{id}        Update title/description/area etc.
POST   /work-orders/{id}/transition    Change status (role-guarded)
GET    /work-orders/dashboard-stats    Stats for dashboard cards
```

**Status transition rules** — only valid role/status combinations work:
```
open       → assigned       Client only
assigned   → inprogress     Contractor or Supervisor
inprogress → qc             Workman or Supervisor
qc         → pending        Supervisor
pending    → closed         Client (approve)
pending    → inprogress     Client (reject — sends back for rework)
escalated  → inprogress     Client (acknowledge)
```

### Contractors
```
GET    /contractors/            List all contractors
POST   /contractors/            Create (client only)
PATCH  /contractors/{id}        Update (client only)
GET    /contractors/{id}/contracts    Their contracts
```

### Notifications
```
GET    /notifications/          My notifications
GET    /notifications/unread-count
POST   /notifications/{id}/read
POST   /notifications/mark-all-read
```

### Users
```
GET    /users/                  List users (client or contractor)
GET    /users/{id}              Get user
PATCH  /users/{id}              Update profile
```

---

## Connecting the React Frontend

In `src/context/AppContext.jsx`, replace mock state with real API calls.

### 1. Login
```js
const res = await fetch('http://localhost:8000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const { access_token, user } = await res.json();
localStorage.setItem('token', access_token);
```

### 2. Fetch work orders
```js
const token = localStorage.getItem('token');
const res = await fetch('http://localhost:8000/api/v1/work-orders/', {
  headers: { Authorization: `Bearer ${token}` }
});
const workOrders = await res.json();
```

### 3. Transition a status
```js
await fetch(`http://localhost:8000/api/v1/work-orders/${id}/transition`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ new_status: 'assigned', note: 'AlphaServ confirmed' }),
});
```

---

## Deploying to production (free)

### Option A — Render.com (easiest, free tier)
1. Push this folder to a GitHub repo
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repo
4. Set:
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add your `.env` values as Environment Variables in the Render dashboard
6. Deploy — Render gives you a public URL like `https://servtrack-api.onrender.com`

### Option B — Railway.app
1. Install Railway CLI: `npm install -g @railway/cli`
2. `railway login`
3. `railway init` inside your backend folder
4. `railway up`
5. Add env vars in the Railway dashboard

Both are free for small projects. Your Supabase DB stays the same either way.

---

## Project Structure

```
servtrack-backend/
├── app/
│   ├── main.py                  ← FastAPI app, CORS, routers
│   ├── core/
│   │   ├── config.py            ← Loads .env settings
│   │   ├── database.py          ← SQLAlchemy engine + session
│   │   ├── security.py          ← JWT creation + bcrypt
│   │   └── dependencies.py      ← Auth + role guard for routes
│   ├── models/
│   │   ├── user.py              ← User model + 5-role enum
│   │   ├── contractor.py        ← Contractor + Contract models
│   │   └── work_order.py        ← WorkOrder + ActivityLog + Notification
│   ├── schemas/
│   │   ├── user.py              ← Pydantic request/response schemas
│   │   ├── contractor.py
│   │   └── work_order.py
│   ├── services/
│   │   └── work_order_service.py  ← All business logic (role scoping,
│   │                                 status transitions, SLA escalation)
│   └── routers/
│       ├── auth.py
│       ├── work_orders.py
│       ├── contractors.py
│       ├── users.py
│       └── notifications.py
├── schema.sql          ← Paste into Supabase SQL Editor (Step 2)
├── seed.py             ← Run after schema to load demo data (Step 6)
├── requirements.txt
└── .env.example        ← Copy to .env and fill in (Step 5)
```
