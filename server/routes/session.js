const { isAuthed } = require('../auth');

module.exports = async (req, res) => {
  res.status(200).json({ authenticated: isAuthed(req) });
};
