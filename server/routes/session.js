const { query } = require('../db');
const { ensureUsersTable, getUser } = require('../auth');

// Who is signed in (and, for a teacher, which classes they can see), plus whether
// the owner account still needs creating so the login screen can say so.
module.exports = async (req, res) => {
  await ensureUsersTable();
  const user = await getUser(req);
  const { rows } = await query(`SELECT 1 FROM users WHERE role = 'owner' LIMIT 1`);
  const setupRequired = rows.length === 0;
  if (!user) { res.status(200).json({ authenticated: false, setupRequired }); return; }
  let classNames = null;
  if (user.role === 'teacher') {
    const { rows: cls } = await query('SELECT name FROM classes WHERE teacher_id = $1 ORDER BY name', [user.teacherId]);
    classNames = cls.map(r => r.name);
  }
  res.status(200).json({ authenticated: true, setupRequired, user: { username: user.username, role: user.role, teacherId: user.teacherId, classNames } });
};
