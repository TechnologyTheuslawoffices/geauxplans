# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GeauxPlans is a full-stack estate planning and business formation application with:
- **Frontend**: React 19 + TypeScript (port 3000)
- **Backend**: Node.js/Express (port 5000)
- **Database**: SQLite via sql.js

## Commands

### Backend (geauxplans-backend/)
```bash
npm run dev          # Start dev server with hot reload
npm start            # Start production server
npm run db:init      # Initialize database schema
npm run db:seed      # Seed database with sample data
```

### Frontend (geauxplans-react/)
```bash
npm start            # Start React dev server
npm run build        # Create production build
npm test             # Run tests in watch mode
```

## Architecture

### API Communication
- Frontend calls backend at `http://localhost:5000/api`
- Auth tokens stored in localStorage as `gpx_auth_token`
- All authenticated requests include `Authorization: Bearer {token}` header
- Standard response format: `{ success: boolean, data?: T, error?: string }`

### Backend Routes
| Route | Purpose |
|-------|---------|
| `/api/auth` | Register, login, logout, password reset |
| `/api/user` | Profile, addresses, subscription |
| `/api/estate-plans` | Estate plan CRUD and documents |
| `/api/orders` | Order management |
| `/api/cart` | Shopping cart operations |
| `/api/business` | LLC formation, availability checks |
| `/api/submissions` | Form submissions |
| `/api/knackly` | Document generation |

### Frontend State Management
- **AuthContext**: User authentication state, login/logout/register methods
- **CartContext**: Shopping cart state and operations
- Service layer in `src/services/` wraps all API calls with TypeScript types

### Database Access Pattern
```javascript
// sql.js compatible wrapper
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
const result = db.prepare('INSERT INTO table (col) VALUES (?)').run(value);
```

### Authentication Flow
1. User registers/logs in via `/api/auth`
2. Backend returns JWT token (7-day expiry)
3. Frontend stores token and includes in subsequent requests
4. `authenticate` middleware validates token and sets `req.user`
5. `requireAdmin` middleware checks for admin role

## Key Files

### Backend
- `src/server.js` - Express app entry point
- `src/config/database.js` - SQLite initialization and wrapper
- `src/middleware/auth.js` - JWT auth middleware (authenticate, optionalAuth, requireAdmin)
- `src/routes/*.js` - API endpoint handlers

### Frontend
- `src/App.tsx` - Routes and app structure
- `src/context/AuthContext.tsx` - Authentication state and methods
- `src/context/CartContext.tsx` - Cart state and methods
- `src/services/api.ts` - Base API utilities and token management
- `src/types/index.ts` - TypeScript interfaces

## External Integrations

- **Louisiana SOS API**: LLC name availability checks (configured via LA_SOS_* env vars)
- **Knackly**: Document generation service for estate planning documents
- **WordPress**: Legacy fallback at `geauxplans.com/wp-admin/admin-ajax.php`

## Environment Variables (Backend .env)

```
PORT=5000
JWT_SECRET=<change-in-production>
JWT_EXPIRES_IN=7d
DATABASE_PATH=./database.sqlite
FRONTEND_URL=http://localhost:3000
LA_SOS_API_URL=https://commercialapi.sos.la.gov/api/Commercial/Search
LA_SOS_TOKEN=<api-token>
```

## Code Conventions

### Backend Route Pattern
```javascript
router.post('/resource', authenticate, [validations], async (req, res) => {
  try {
    // Validate, query DB, respond
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Message' });
  }
});
```

### Frontend Service Pattern
```typescript
export async function getData(): Promise<ApiResponse<DataType>> {
  return api.get<DataType>('/endpoint');
}
```

### Component Pattern
- Use `useAuth()` and `useCart()` hooks for context access
- Handle loading/error states explicitly
- Type all props and state with TypeScript interfaces

---

## ⚠️ Document Layout Note

`extracted_wordpress/` is **reference-only** — it's a snapshot of the legacy WordPress site, kept for visual comparison. Do NOT edit, search, or use it as the source of truth for the current product. The active app lives in `geauxplans-react/` (frontend) and `geauxplans-backend/` (API).

---

## Current Production Architecture (Vercel + Supabase)

The local-dev section above (Express + SQLite + localhost) describes the **dev workflow only**. Production runs on Vercel with Supabase as the database. Both must stay in sync.

### Three-Tier Service Topology

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend: geauxplans-react                                      │
│ URL:      geauxplans.com / geauxplans-react-*.vercel.app        │
│ Account:  login-6676 (team geaux-ventures)                      │
│ Path:     C:\Users\Arman\Documents\Geauxplans\geauxplans-react │
│ Env:      REACT_APP_API_URL → geauxplans-backend-sooty.vercel… │
└──────────────────────┬──────────────────────────────────────────┘
                       │ /api/submissions, /api/auth, /api/cart
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Backend: geauxplans-backend                                     │
│ URL:      geauxplans-backend-sooty.vercel.app                   │
│ Account:  login-6676 (team geaux-ventures)                      │
│ Path:     C:\Users\Arman\Documents\Geauxplans\geauxplans-backend│
│ Storage:  Supabase (auth, form submissions, orders)             │
│ Env:      DOCTOOLS_URL → doc-tools-geaux-counsel.vercel.app    │
│           SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY              │
└──────────────────────┬──────────────────────────────────────────┘
                       │ /api/poa/generate, /api/estate/generate
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Doc-Tools: GeauxDrafterPrivate                                  │
│ URL:      doc-tools-geaux-counsel.vercel.app                    │
│ Account:  zularjob-3870 (team geaux-counsel)                    │
│ Path:     C:\Users\Arman\Documents\GeauxDrafterPrivate         │
│ Role:     Knackly schema mapping → DOCX generation → PDF        │
│ Docs:     C:\Users\Arman\Documents\GeauxDrafterPrivate\CLAUDE.md│
└─────────────────────────────────────────────────────────────────┘
```

### CRITICAL: Vercel Account per Project

| Project | Account | Team | Verify with |
|---------|---------|------|-------------|
| `geauxplans-react` | `login-6676` | `geaux-ventures` | `cd geauxplans-react && npx vercel whoami` |
| `geauxplans-backend` | `login-6676` | `geaux-ventures` | `cd geauxplans-backend && npx vercel whoami` |
| `doc-tools` (separate repo) | `zularjob-3870` | `geaux-counsel` | `cd ../GeauxDrafterPrivate && npx vercel whoami` |

**ALWAYS** run `npx vercel whoami` before `npx vercel --prod`. Wrong account = deploy goes to the wrong project.

### Production Environment Variables

**geauxplans-react (`.env.production`):**
```
REACT_APP_API_URL=https://geauxplans-backend-sooty.vercel.app/api
REACT_APP_SUPABASE_URL=<supabase-url>
REACT_APP_SUPABASE_ANON_KEY=<anon-key>
```

**geauxplans-backend (`.env`):**
```
DOCTOOLS_URL=doc-tools-geaux-counsel.vercel.app
SUPABASE_URL=<supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
JWT_SECRET=<jwt-secret>
```

### Submission → Document Generation Flow

1. User completes form in `geauxplans-react`
2. Frontend POSTs form data to backend `/api/submissions`
3. Backend stores submission in Supabase, returns submission ID
4. User clicks "Generate Documents" → backend calls `DOCTOOLS_URL/api/poa/generate` (or `/api/estate/generate`)
5. doc-tools transforms data through Knackly schema, returns DOCX/PDF buffers
6. Backend uploads to Supabase storage and returns download URLs
7. Frontend presents download links

### Vercel Logging Budget (when debugging)

Vercel truncates request output at **256 log lines**. When investigating doc-tools issues, refer to the budgeted `dlog()` helper pattern documented in `GeauxDrafterPrivate/CLAUDE.md` — do NOT add unconditional `console.log` floods to backend or doc-tools routes.

## Documentation Cross-References

- **doc-tools deep-dive**: `C:\Users\Arman\Documents\GeauxDrafterPrivate\CLAUDE.md`
- **Knackly syntax patterns**: `C:\Users\Arman\Documents\Knackly Training\CLAUDE.md`
- **Deployment accounts table**: `C:\Users\Arman\Documents\Knackly Training\DEPLOYMENT_ACCOUNTS.md`
