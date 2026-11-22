// ============================================
// Configuration Supabase — FIFABOT
// ============================================

// Les variables sont chargées depuis le CDN dans le HTML
// (script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2")

const SUPABASE_URL = 'https://lcisaavjahbtptufqima.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Mu_jyQeHvVZ6vVl1D9Vh_g_wc3Bas3v';

// Création du client Supabase (variable globale via window.supabase)
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// Rendre le client accessible partout
window.supabaseClient = supabaseClient;

console.log('✅ Supabase client initialisé');
