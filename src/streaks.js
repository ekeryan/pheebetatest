// src/streaks.js
import { supabase } from './supabaseClient';

// Read top N from the secure function (now returns team too)
export async function loadLeaderboard(limit = 50) {
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };
  const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: limit });
  return { data, error };
}

// Upsert streak with device + team binding
export async function upsertStreak({
  handle, currentStreak, bestStreak, rotationKey, deviceId, team
}) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const clean = String(handle || '')
    .trim().replace(/^@+/, '').replace(/\s+/g, '')
    .replace(/[^\w.-]/g, '').slice(0, 20);

  const { data, error } = await supabase.rpc('safe_upsert_streak', {
    p_handle:       clean,
    p_rotation_key: rotationKey || '',
    p_current:      Number.isFinite(currentStreak) ? currentStreak : 0,
    p_best:         Number.isFinite(bestStreak) ? bestStreak : 0,
    p_device_id:    deviceId || '',
    p_team:         team ?? null,
  });

  return { data, error };
}
