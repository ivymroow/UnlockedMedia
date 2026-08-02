const { createClient } = require('@supabase/supabase-js');
const env = require('./config/env');
const { cleanMediaItem, cleanString, cleanUsername } = require('./utils/sanitize');

const sb = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function signUp(username, password, email) {
  const safeUsername = cleanUsername(username);
  const safePassword = cleanString(password, 256);
  const userEmail = cleanString(email, 320) || `${safeUsername}@webstreaming.local`;
  if (!safeUsername) throw new Error('Username required');
  if (safePassword.length < 6) throw new Error('Password must be at least 6 characters');

  const { data, error } = await sb.auth.admin.createUser({
    email: userEmail, password: safePassword, email_confirm: true,
    user_metadata: { username: safeUsername },
  });
  if (error) throw new Error(error.message);
  await sb.auth.admin.updateUserById(data.user.id, { user_metadata: { username: safeUsername } });

  const login = await sb.auth.signInWithPassword({ email: userEmail, password: safePassword });
  if (login.error) throw new Error('Account created but login failed');

  return {
    user: { id: login.data.user.id, username: safeUsername, email: userEmail },
    token: login.data.session.access_token,
    refresh: login.data.session.refresh_token,
  };
}

async function signIn(username, password) {
  const identifier = cleanUsername(username);
  const safePassword = cleanString(password, 256);
  if (!identifier || !safePassword) throw new Error('Username and password required');

  let email = identifier.includes('@') ? identifier : `${identifier}@webstreaming.local`;
  let { data, error } = await sb.auth.signInWithPassword({ email, password: safePassword });
  if (error && !identifier.includes('@')) {
    const users = await findUserByUsername(identifier);
    if (users?.email && users.email !== email) {
      email = users.email;
      ({ data, error } = await sb.auth.signInWithPassword({ email, password: safePassword }));
    }
  }
  if (error) throw new Error(error.message);

  return {
    user: { id: data.user.id, username: data.user.user_metadata?.username || username, email: data.user.email },
    token: data.session.access_token,
    refresh: data.session.refresh_token,
  };
}

async function findUserByUsername(username) {
  let page = 1;
  const perPage = 100;
  while (page <= 10) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error('Auth error');
    const user = data?.users?.find(item => item.user_metadata?.username === username);
    if (user) return user;
    if (!data?.users?.length || data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}

async function getUserFromToken(token) {
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  return { id: user.id, username: user.user_metadata?.username || user.email, email: user.email };
}

/* Watch progress */
async function saveProgress(userId, item) {
  const { id, title, poster, type, season, episode, duration, watched, status } = cleanMediaItem(item);
  if (!id) throw new Error('Media id required');
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
  const { id, title, poster, type } = cleanMediaItem(item);
  if (!id) throw new Error('Media id required');
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
