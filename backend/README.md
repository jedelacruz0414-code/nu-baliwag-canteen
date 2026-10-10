# Canteen API

Node.js REST API backed by MySQL. The root `index.html` remains a browser-only demo. Use the API-connected `index_test.html` from the workspace root for database-backed login and admin data.

## Requirements

- Node.js 20 or newer
- MySQL 8.0 or newer

## Setup

1. Create a MySQL database and tables by running `schema.sql` with a MySQL client.
2. Copy `.env.example` to `.env`, then set the database connection, a random `JWT_SECRET` (at least 32 characters), and the frontend origin.
3. Install dependencies with `npm install`.
4. Create an account. For example:

   ```powershell
   npm run create-user -- admin "Canteen Admin" - admin@example.com "use-a-unique-password"
   npm run create-user -- student "Juan Dela Cruz" 2023-161302 juan@example.com "use-a-unique-password"
   ```

5. Start the API with `npm run dev` and check `http://localhost:3000/api/health`.
6. Serve `index_test.html` from `http://localhost:5500/index_test.html` (for example, with VS Code Live Server). Do not open it as a `file://` URL; the API only allows the configured `WEB_ORIGIN`.

Admin login uses the email and password of an active `admin` row in `users`; there is no default SQL password. Create one with the `create-user` command above. The demo credentials in root `index.html` are not SQL credentials.

The API exposes `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/menu`, `GET /api/tables`, student reservation and order routes, admin account/reservation/order routes, and announcement routes. Protected routes require `Authorization: Bearer <token>`.

Reservation creation and order submission use database transactions. Order totals are calculated from database prices, and stock is deducted once when an administrator marks an order completed.

## Cloudflare Worker and Hyperdrive binding

The root `worker.js` wraps the static site and exposes `GET /api/db-test` as a MySQL connectivity probe. It does not migrate or replace the Express API in `backend/src/server.js`. Build with `npm run build` and deploy with `npm run deploy`.

In the Cloudflare dashboard, add a Hyperdrive binding named `HYPERDRIVE` to the `nu-baliwag-canteen` Worker and connect it to the Aiven MySQL database. The Wrangler configuration enables `nodejs_compat`; no database credentials or Hyperdrive ID belong in this repository. After adding the binding, redeploy and request `/api/db-test` to verify the connection.