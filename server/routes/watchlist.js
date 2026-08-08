const express = require('express');
const supabase = require('../database/supabase');
const { requireUserMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.use(requireUserMiddleware);

router.post('/add', asyncHandler(async (req, res) => {
  await supabase.addToWatchlist(req.user.id, req.body, req._supabaseToken);
  res.json({ ok: true });
}));

router.post('/remove', asyncHandler(async (req, res) => {
  await supabase.removeFromWatchlist(req.user.id, req.body.id, req._supabaseToken);
  res.json({ ok: true });
}));

router.get('/list', asyncHandler(async (req, res) => {
  res.json(await supabase.getWatchlist(req.user.id, req._supabaseToken));
}));

router.get('/check', asyncHandler(async (req, res) => {
  res.json({ inList: await supabase.isInWatchlist(req.user.id, req.query.id, req._supabaseToken) });
}));

module.exports = router;
