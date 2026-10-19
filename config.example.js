/* config.js holds only PUBLIC values, so it is safe to commit and host.
   Fill in your own Supabase URL and publishable key (Project Settings > API Keys).
   NEVER put a secret key (sb_secret_...), a service_role key, or a Gemini key in this file.
   The Gemini key lives only as a Supabase Edge Function secret. */
window.GH_CONFIG = {
  SUPABASE_URL: '',        // example: https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: ''    // publishable key (sb_publishable_...) or legacy anon key
};
