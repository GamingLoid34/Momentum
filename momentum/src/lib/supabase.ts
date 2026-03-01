import { SupabaseClient, createClient } from "@supabase/supabase-js";

type SupabaseServices = {
  client: SupabaseClient | null;
  missingConfig: string[];
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const missingConfig = [
  !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
  !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
].filter((entry): entry is string => entry !== null);

let cachedClient: SupabaseClient | null = null;

export const isSupabaseConfigured = missingConfig.length === 0;

export function getSupabaseServices(): SupabaseServices {
  if (!isSupabaseConfigured) {
    return {
      client: null,
      missingConfig,
    };
  }

  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return {
    client: cachedClient,
    missingConfig: [],
  };
}
