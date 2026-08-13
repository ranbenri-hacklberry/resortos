import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://november-dressed-dressed-paying.trycloudflare.com';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testDB() {
    console.log('--- DB Connection Test ---');
    console.log('Testing URL:', SUPABASE_URL);
    
    try {
        const { data, error } = await supabase
            .from('menu_items')
            .select('name, category, price')
            .limit(10);
            
        if (error) {
            console.error('DATABASE ERROR:', error.message);
            return;
        }
        
        if (!data || data.length === 0) {
            console.log('CONNECTED but NO ITEMS FOUND in menu_items table.');
            return;
        }
        
        console.log(`SUCCESS! Found ${data.length} items:`);
        data.forEach((item, i) => {
            console.log(`${i+1}. ${item.name} (${item.category}) - ${item.price} NIS`);
        });
        
    } catch (e) {
        console.error('CRITICAL ERROR:', e.message);
    }
}

testDB();
