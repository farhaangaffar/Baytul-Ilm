// Dev-only harness: emulates Vercel's /api file-based serverless routing using Express,
// so the /api handlers can be tested locally without the Vercel CLI. Not deployed.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const apiDir = path.join(__dirname, '..', 'api');

function mountRoute(expressPath, full, { catchAll } = {}) {
  const handler = require(full);
  app.all(expressPath, (req, res) => {
    // Express 5 makes req.query getter-only, so define an own property to
    // fold in the dynamic route params (mirrors how Vercel merges them in prod).
    // For optional catch-all routes, Vercel exposes the extra path segments as
    // req.query.params (an array); Express 5's *splat wildcard already gives us
    // that array directly in req.params.splat.
    const params = catchAll ? { params: req.params.splat } : req.params;
    Object.defineProperty(req, 'query', { value: { ...req.query, ...params }, configurable: true });
    handler(req, res).catch(err => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  });
  console.log(`mounted ${expressPath} -> ${path.relative(apiDir, full)}`);
}

// Two passes per directory: static/literal routes first, then dynamic [param]
// routes — mirrors Vercel's real precedence (a static file always wins over a
// dynamic segment at the same path), which plain filesystem/alphabetical
// registration order in Express would NOT reproduce on its own ([id].js sorts
// before literal siblings like add-month.js and would otherwise shadow them).
function mount(dir, routePrefix) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith('_'));
  const dynamic = entries.filter(e => {
    const base = e.name.replace(/\.js$/, '');
    return base.startsWith('[') && base.endsWith(']');
  });
  const staticEntries = entries.filter(e => !dynamic.includes(e));

  for (const entry of [...staticEntries, ...dynamic]) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      mount(full, `${routePrefix}/${entry.name}`);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    const base = entry.name.replace(/\.js$/, '');
    if (base === 'index') {
      mountRoute(routePrefix || '/', full);
    } else if (base.startsWith('[[...') && base.endsWith(']]')) {
      // Optional catch-all — matches the base path with zero segments AND any
      // number of sub-segments (req.query.params is [] or undefined for zero).
      mountRoute(routePrefix || '/', full, { catchAll: true });
      mountRoute(`${routePrefix}/*splat`, full, { catchAll: true });
    } else if (base.startsWith('[') && base.endsWith(']')) {
      mountRoute(`${routePrefix}/:${base.slice(1, -1)}`, full);
    } else {
      mountRoute(`${routePrefix}/${base}`, full);
    }
  }
}

mount(apiDir, '/api');

const port = process.env.DEV_API_PORT || 3001;
app.listen(port, () => console.log(`dev API server on http://localhost:${port}`));
