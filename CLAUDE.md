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
