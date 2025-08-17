// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const url =
  process.env.REACT_APP_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URI;
const anon = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = url && anon ? createClient(url, anon) : null;

// Optional: expose in dev so you can test in the console
if (process.env.NODE_ENV === 'development' && supabase) {
  // @ts-ignore
  window.supabase = supabase;
}
