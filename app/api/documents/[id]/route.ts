import { NextResponse, type NextRequest } from 'next/server'
import { DOCUMENTS_BUCKET, documentFileName } from '@/lib/documents'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * PDF of an accounting document. Runs as the signed-in user: RLS on `documents` and on
 * the storage bucket lets staff read every document and a customer only those of their
 * own bookings. Anything else is a 404.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 })
  const supabase = await createClient()
  const { data: document } = await supabase.from('documents').select('storage_path, type, number').eq('id', id).maybeSingle()
  if (!document) return new NextResponse('Not found', { status: 404 })
  const { data: file } = await supabase.storage.from(DOCUMENTS_BUCKET).download(document.storage_path)
  if (!file) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(file.stream(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${documentFileName(document.type, document.number, 'doklad')}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
