/**
 * Uploads the photos imported from btw.sk (supabase/seed/images) to the public
 * `vehicle-images` bucket, at the paths referenced by `vehicle_images.storage_path`.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_URL=… npx tsx scripts/seed-vehicle-images.ts
 *
 * Idempotent: existing files are never overwritten, so photos replaced in the admin
 * stay as they are.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'vehicle-images'
const SOURCE_DIR = path.join(process.cwd(), 'supabase', 'seed', 'images')

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.log('[seed-images] skipped: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
    return
  }
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  let uploaded = 0
  let existing = 0
  for (const folder of await readdir(SOURCE_DIR, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue
    const { data: present, error: listError } = await supabase.storage.from(BUCKET).list(folder.name)
    if (listError) throw new Error(`[seed-images] cannot list ${folder.name}: ${listError.message}`)
    const have = new Set((present ?? []).map((f) => f.name))

    for (const file of await readdir(path.join(SOURCE_DIR, folder.name))) {
      if (!file.endsWith('.webp')) continue
      if (have.has(file)) {
        existing++
        continue
      }
      const body = await readFile(path.join(SOURCE_DIR, folder.name, file))
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${folder.name}/${file}`, body, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
      if (error) throw new Error(`[seed-images] cannot upload ${folder.name}/${file}: ${error.message}`)
      uploaded++
    }
  }
  console.log(`[seed-images] uploaded ${uploaded}, already present ${existing}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
