const express = require('express');
const supabase = require('../database/supabase');
const { requireUser } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.post('/signup', asyncHandler(async (req, res) => {
  const result = await supabase.signUp(req.body.username, req.body.password, req.body.email);
  res.json({ ok: true, user: result.user, token: result.token, refresh: result.refresh });
}));

router.post('/signin', asyncHandler(async (req, res) => {
  const result = await supabase.signIn(req.body.username, req.body.password);
  res.json({ ok: true, user: result.user, token: result.token, refresh: result.refresh });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  if (!req.body.refresh) return res.status(400).json({ error: 'Refresh token required' });
  const result = await supabase.refreshSession(req.body.refresh);
  res.json({ ok: true, token: result.token, refresh: result.refresh });
}));

router.get('/user', requireUser, (req, res) => {
  res.json(req.user);
});

module.exports = router;
