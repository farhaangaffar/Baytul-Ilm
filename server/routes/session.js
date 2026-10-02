const { query } = require('../db');
const { ensureUsersTable, getUser, teacherClassNames } = require('../auth');

// Who is signed in (and, for a teacher or class login, which classes they can see),
// which madrasah they belong to, plus whether the first owner account still needs
// creating so the login screen can say so.
module.exports = async (req, res) => {
  await ensureUsersTable();
  const user = await getUser(req);
  const { rows } = await query(`SELECT 1 FROM users WHERE role = 'owner' LIMIT 1`);
  const setupRequired = rows.length === 0;
  if (!user) { res.status(200).json({ authenticated: false, setupRequired }); return; }
  const classNames = user.role === 'teacher' ? await teacherClassNames(user) : null;
  const { rows: [m] } = await query('SELECT code, name FROM madaaris WHERE id = $1', [user.madrasahId]);
  res.status(200).json({
    authenticated: true, setupRequired,
    user: {
      login: user.login, role: user.role, teacherId: user.teacherId, classId: user.classId, classNames,
      platformAdmin: user.platformAdmin, madrasah: { code: m.code, name: m.name },
    },
  });
};
