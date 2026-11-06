# Tswelelopele Lingua Services – website + backend
Requires Node.js 18+.
1. `npm install`
2. Copy `.env.example` to `.env`, set `ADMIN_TOKEN` (and Brevo API key and sender email so emails are sent)
3. `npm start`, then open http://localhost:3000 (admin: http://localhost:3000/admin.html)
Data is stored in `data/*.json`. Do not open index.html directly: the forms need the server.
