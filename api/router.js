// The app's single serverless function. Every /api/<name> request is rewritten here
// (vercel.json) and handed to server/routes/<name>.js, so the whole API counts as one
// function against Vercel's per-project limit instead of one per endpoint — new
// endpoints are just new files in server/routes plus a line below.
// Requires are static (not built from the route name) so Vercel's bundler can see
// and include every handler.
const routes = {
  'academic-years': require('../server/routes/academic-years'),
  'ai-summary': require('../server/routes/ai-summary'),
  attendance: require('../server/routes/attendance'),
  classes: require('../server/routes/classes'),
  'daily-records': require('../server/routes/daily-records'),
  fees: require('../server/routes/fees'),
  login: require('../server/routes/login'),
  logout: require('../server/routes/logout'),
  session: require('../server/routes/session'),
  settings: require('../server/routes/settings'),
  students: require('../server/routes/students'),
  teachers: require('../server/routes/teachers'),
  terms: require('../server/routes/terms'),
  users: require('../server/routes/users'),
};

// The route comes from the rewrite's ?route= parameter; the original path is a
// fallback in case a request reaches this function unrewritten.
function routeName(req) {
  if (req.query && req.query.route) return String(req.query.route);
  const m = /^\/api\/([^/?]+)/.exec(req.url || '');
  return m ? m[1] : '';
}

module.exports = async (req, res) => {
  const name = routeName(req);
  const handler = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : null;
  if (!handler) { res.status(404).json({ error: 'Not found' }); return; }
  if (req.query) delete req.query.route; // handlers only see their own query parameters
  try {
    await handler(req, res);
  } catch (err) {
    console.error(`/api/${name}:`, err);
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on the server — try again.' });
  }
};

module.exports.routes = routes;
