
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://deck-bar.senzey.com/supabase'; // Using the proxy or direct if possible
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient('https://tail9a5357.ts.net:4028/supabase', SUPABASE_ANON_KEY); // Try local tailscale

async function checkStatus() {
  const { data, error } = await supabase
    .from('menu_items')
    .select('name, requires_prep, grab_and_go, kds_routing_logic')
    .ilike('name', 'אספרסו%')
    .order('id', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('--- Product Status Audit ---');
  data.forEach(item => {
    console.log(`Product: ${item.name}`);
    console.log(`Requires Prep: ${item.requires_prep}`);
    console.log(`Grab & Go: ${item.grab_and_go}`);
    console.log(`KDS Logic: ${item.kds_routing_logic}`);
    console.log('---------------------------');
  });
}

checkStatus();
