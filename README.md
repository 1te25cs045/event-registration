# Northstar College Event Registration

A simple, responsive college events website with an Express/Node.js API, a local SQLite database, student accounts, and an admin dashboard.

## Requirements

- Node.js 18 or newer

## Configure and run

1. In VS Code, open the project folder. In the integrated PowerShell terminal, install dependencies and start the application:

   ```powershell
   npm.cmd install
   npm.cmd start
   ```

2. Visit <http://localhost:3000>. On first start, the app automatically creates `event_registration.db` and its tables in the project folder. No MySQL installation or database server is needed.

For development with Node's file watcher, use `npm.cmd run dev`.

The project includes a local `.env` with session and admin settings. If setting it up on another computer, copy `.env.example` to `.env` and set a long random `SESSION_SECRET`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD`. The admin account is created on first server start if its email is not already in the database; an existing account's password is not overwritten.

## Included features

- Student signup, login, session-protected dashboard, event registration, unique registration IDs, and duplicate registration prevention.
- Admin sign-in, event create/edit/delete, dashboard counts, and registration search by student name or USN.
- Parameterized SQLite queries and bcrypt password hashes.
- Event categories: Technical, Cultural, Sports, and Workshops.

All application data is stored locally in `event_registration.db`; the app does not use mock or browser-only data.
