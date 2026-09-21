/**
 * scripts/upload_local_media_to_storage.mjs
 * Uploads local images from public/resorts and public/guides directly to Supabase Storage 'resorts' bucket.
 * 
 * Usage:
 * SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/upload_local_media_to_storage.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Please provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadDirectory(localDir, storagePrefix) {
  if (!fs.existsSync(localDir)) return;
  const files = fs.readdirSync(localDir);

  for (const file of files) {
    const filePath = path.join(localDir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) continue;

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(file).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const storagePath = `${storagePrefix}/${file}`;

    console.log(`Uploading ${file} -> resorts/${storagePath}...`);
    const { data, error } = await supabase.storage
      .from('resorts')
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: true
      });

    if (error) {
      console.warn(`  ✕ Failed to upload ${file}:`, error.message);
    } else {
      const { data: publicUrlData } = supabase.storage
        .from('resorts')
        .getPublicUrl(storagePath);
      console.log(`  ✓ Public URL: ${publicUrlData?.publicUrl}`);
    }
  }
}

async function main() {
  console.log('🚀 Starting local media upload to Supabase Storage (bucket: resorts)...\n');

  // 1. Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === 'resorts');
  if (!bucketExists) {
    console.log('Creating "resorts" bucket...');
    await supabase.storage.createBucket('resorts', { public: true });
  }

  // 2. Upload public/resorts
  console.log('\n📁 Uploading public/resorts...');
  await uploadDirectory(path.resolve('public/resorts'), 'resorts');

  // 3. Upload public/guides
  console.log('\n📁 Uploading public/guides...');
  await uploadDirectory(path.resolve('public/guides'), 'guides');

  console.log('\n✨ All media uploaded successfully to Supabase Storage!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
