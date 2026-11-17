import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * PDF of a signed protocol. Runs as the signed-in user: RLS on the table and on the
 * storage bucket lets staff read every protocol and a customer only the signed protocols
 * of their own bookings. Anything else is a 404.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 })
  const supabase = await createClient()
  const { data: protocol } = await supabase.from('handover_protocols').select('pdf_path, signed_at').eq('id', id).maybeSingle()
  if (!protocol?.signed_at || !protocol.pdf_path) return new NextResponse('Not found', { status: 404 })
  const { data: file } = await supabase.storage.from('protocols').download(protocol.pdf_path)
  if (!file) return new NextResponse('Not found', { status: 404 })
  const filename = protocol.pdf_path.split('/').pop() ?? 'protokol.pdf'
  return new NextResponse(file.stream(), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  })
}
