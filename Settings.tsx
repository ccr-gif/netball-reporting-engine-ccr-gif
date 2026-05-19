// src/lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sdinonrgvzjpdxbesnmr.supabase.co';
const supabaseAnonKey = 'sb_publishable_lpOugSg18TZ8L5wWXwTZjQ_XGl3FlHU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,              // ⭐ persist session!
    autoRefreshToken: true,
    persistSession: true,               // ⭐ critical for offline!
    detectSessionInUrl: false,
  },
});