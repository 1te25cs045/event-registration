# Northstar College Event Registration

A simple, responsive college events website with an Express/Node.js API, student accounts, and an admin dashboard. It uses SQLite for local development and PostgreSQL for persistent Vercel deployments.

## Requirements

- Node.js 20 or newer

## Run locally

1. Copy `.env.example` to `.env` and set `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
2. Install dependencies and start the application:

   ```powershell
   npm.cmd install
   npm.cmd start
   ```

3. Visit <http://localhost:3000>. Without `DATABASE_URL`, the app creates a local `event_registration.db`. To test against PostgreSQL locally, set `DATABASE_URL` to your hosted database connection string.

If the database has no events, the app adds 10 sample upcoming campus events. Students can see remaining spots, and registrations stop when an event reaches its attendee limit. Admins can set the limit when creating or editing an event.

For development with Node's file watcher, use `npm.cmd run dev`.

## Deploy to Vercel

1. Push this project to GitHub and import the repository in Vercel.
2. In Vercel's Marketplace, provision a PostgreSQL database (for example, Neon) and connect it to the project. Make its connection string available as `DATABASE_URL`.
3. Add these environment variables in Vercel's project settings for Production (and Preview if needed):
   - `DATABASE_URL` — the hosted PostgreSQL connection string.
   - `SESSION_SECRET` — generate a unique secret with `node -p "require('crypto').randomBytes(32).toString('hex')"`.
   - `ADMIN_EMAIL` — the administrator sign-in email.
   - `ADMIN_PASSWORD` — a unique, strong administrator password.
   - `ADMIN_NAME` — optional; defaults to `College Administrator`.
4. Deploy or redeploy. On the first API request, the app creates its PostgreSQL tables, seeds sample events if needed, and creates the admin account if it does not exist. Vercel serves files in `public/`; the Express app handles the API. Sessions are stored in PostgreSQL so logins work across serverless instances.

The local SQLite database is not copied to the hosted database automatically. The deployed database starts with sample events; export/import any local student accounts, events, or registrations separately if you need to keep them.

## Included features

- Student signup, login, session-protected dashboard, event registration, unique registration IDs, and duplicate registration prevention.
- Admin sign-in, event create/edit/delete and capacity management, dashboard counts, and registration search by student name or USN.
- Parameterized database queries and bcrypt password hashes.
- Event categories: Technical, Cultural, Sports, and Workshops.

Application data is stored in the configured database; the app does not use browser-only data.
