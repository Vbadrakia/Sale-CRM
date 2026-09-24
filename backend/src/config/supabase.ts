import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let supabaseClient: SupabaseClient | null = null;
let supabaseAdminClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    if (!env.supabase.url || !env.supabase.anonKey) {
      throw new Error('[supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
    }
    supabaseClient = createClient(env.supabase.url, env.supabase.anonKey, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseAdminClient) {
    const key = env.supabase.serviceRoleKey;
    if (!env.supabase.url || !key) {
      throw new Error('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables for admin client.');
    }
    supabaseAdminClient = createClient(env.supabase.url, key, {
      auth: { persistSession: false },
    });
  }
  return supabaseAdminClient;
}
