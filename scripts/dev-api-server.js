// Dev-only harness: serves the API locally with Express, the same way Vercel does in
// production — every /api/<name> request goes through api/router.js (see vercel.json).
// Not deployed.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const express = require('express');
const router = require('../api/router');

const app = express();
app.use(express.json({ limit: '2mb' })); // Vercel's own limit is 4.5 MB; the default 100 KB would reject logo uploads

app.all('/api/:route', (req, res) => {
  // Express 5 makes req.query getter-only, so define an own property carrying the
  // route the same way Vercel's rewrite passes it (?route=<name>).
  Object.defineProperty(req, 'query', { value: { ...req.query, route: req.params.route }, configurable: true });
  router(req, res);
});

const port = process.env.DEV_API_PORT || 3001;
app.listen(port, () => console.log(`dev API server on http://localhost:${port} (${Object.keys(router.routes).length} routes)`));
