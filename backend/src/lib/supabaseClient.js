import { createClient } from '@supabase/supabase-js';

// Temporary sanity check — remove once things are working. If this prints
// "undefined" or looks wrong, the .env file isn't being read correctly.
console.log('SUPABASE_URL loaded as:', JSON.stringify(process.env.SUPABASE_URL));
console.log(
  'SUPABASE_SERVICE_ROLE_KEY length:',
  process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.length : 'undefined'
);

// We use the SERVICE ROLE key here (not the anon key) because this runs
// only on our backend, never in a browser. It bypasses Row Level Security,
// which is fine because the frontend never talks to Supabase directly —
// it only talks to our Express API.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);