const { createClient } = require('@supabase/supabase-js');
const env = require('./config/env');

const sb = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function signUp(username, password, email) {
  const userEmail = email || `${username}@webstreaming.local`;
  const { data, error } = await sb.auth.admin.createUser({
    email: userEmail, password, email_confirm: true,
    user_metadata: { username },
  });
  if (error) throw new Error(error.message);
  await sb.auth.admin.updateUserById(data.user.id, { user_metadata: { username } });

  // Auto-login after signup
  const login = await sb.auth.signInWithPassword({ email: userEmail, password });
  if (login.error) throw new Error('Account created but login failed');

  return {
    user: { id: login.data.user.id, username, email: userEmail },
    token: login.data.session.access_token,
    refresh: login.data.session.refresh_token,
  };
}

async function signIn(username, password) {
  const { data: users, error: listError } = await sb.auth.admin.listUsers();
  if (listError) throw new Error('Auth error');
  const user = users?.users?.find(u => u.user_metadata?.username === username);
  if (!user) throw new Error('User not found');

  const { data, error } = await sb.auth.signInWithPassword({ email: user.email, password });
  if (error) throw new Error(error.message);

  return {
    user: { id: data.user.id, username: data.user.user_metadata?.username || username, email: data.user.email },
    token: data.session.access_token,
    refresh: data.session.refresh_token,
  };
}

async function getUserFromToken(token) {
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  return { id: user.id, username: user.user_metadata?.username || user.email, email: user.email };
}

/* Watch progress */
async function saveProgress(userId, item) {
  const { id, title, poster, type, season, episode, duration, watched, status } = item;
  const { data, error } = await sb.from('watch_progress').upsert({
    user_id: userId, item_id: id, title, poster, type,
    season: season || 0, episode: episode || 0,
    duration: duration || 0, watched: watched || 0,
    status: status || 'watching',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,item_id,season,episode', ignoreDuplicates: false }).select();
  if (error) throw new Error(error.message);
  return data;
}

async function getProgress(userId, itemId, season, episode) {
  let query = sb.from('watch_progress').select('*').eq('user_id', userId).eq('item_id', itemId);
  if (season) query = query.eq('season', season);
  if (episode) query = query.eq('episode', episode);
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data;
}

async function listProgress(userId, status, limit = 20) {
  let query = sb.from('watch_progress').select('*').eq('user_id', userId);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(limit);
  if (error) return [];
  return data;
}

/* Watchlist */
async function addToWatchlist(userId, item) {
  const { id, title, poster, type } = item;
  const { data, error } = await sb.from('watchlist').upsert({
    user_id: userId, item_id: id, title, poster, type,
  }, { onConflict: 'user_id,item_id', ignoreDuplicates: false }).select();
  if (error) throw new Error(error.message);
  return data;
}

async function removeFromWatchlist(userId, itemId) {
  const { error } = await sb.from('watchlist').delete().eq('user_id', userId).eq('item_id', itemId);
  if (error) throw new Error(error.message);
}

async function getWatchlist(userId, limit = 30) {
  const { data, error } = await sb.from('watchlist')
    .select('*').eq('user_id', userId).order('added_at', { ascending: false }).limit(limit);
  if (error) return [];
  return data;
}

async function isInWatchlist(userId, itemId) {
  const { data, error } = await sb.from('watchlist')
    .select('id').eq('user_id', userId).eq('item_id', itemId).maybeSingle();
  if (error) return false;
  return !!data;
}

async function refreshSession(refreshToken) {
  const { data, error } = await sb.auth.refreshSession({ refresh_token: refreshToken });
  if (error) throw new Error(error.message);
  return {
    token: data.session.access_token,
    refresh: data.session.refresh_token,
  };
}

module.exports = {
  signUp, signIn, getUserFromToken, refreshSession,
  saveProgress, getProgress, listProgress,
  addToWatchlist, removeFromWatchlist, getWatchlist, isInWatchlist,
  sb,
};
