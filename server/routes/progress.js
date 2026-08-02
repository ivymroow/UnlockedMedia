const express = require('express');
const supabase = require('../database/supabase');
const { requireUser } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.use(requireUser);

router.post('/save', asyncHandler(async (req, res) => {
  await supabase.saveProgress(req.user.id, req.body);
  res.json({ ok: true });
}));

router.get('/list', asyncHandler(async (req, res) => {
  res.json(await supabase.listProgress(req.user.id, req.query.status));
}));

router.get('/get', asyncHandler(async (req, res) => {
  const item = await supabase.getProgress(req.user.id, req.query.id, Number(req.query.season), Number(req.query.episode));
  res.json(item || {});
}));

module.exports = router;
