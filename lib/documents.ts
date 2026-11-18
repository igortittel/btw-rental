import type { Database } from '@/types/database'

export type DocumentType = Database['public']['Enums']['document_type']
export const DOCUMENTS_BUCKET = 'documents'
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

export const DOCUMENT_TYPES: DocumentType[] = ['invoice', 'proforma', 'credit_note', 'settlement']

export const DOCUMENT_TYPE_LABELS: Record<'sk' | 'en', Record<DocumentType, string>> = {
  sk: { proforma: 'Zálohová faktúra', invoice: 'Faktúra', credit_note: 'Dobropis', settlement: 'Doúčtovanie' },
  en: { proforma: 'Advance invoice', invoice: 'Invoice', credit_note: 'Credit note', settlement: 'Additional invoice' },
}

/** Storage path of a new document: always inside the booking folder (the database checks it). */
export function documentPath(bookingId: string, fileId: string): string {
  return `${bookingId}/${fileId}.pdf`
}

/** True when `path` is a file directly in the booking folder, with no traversal. */
export function isDocumentPathOf(bookingId: string, path: string): boolean {
  return path.startsWith(`${bookingId}/`) && !path.includes('..') && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i.test(path)
}

/** PDF files start with "%PDF-". */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
}

/** Download name: "Faktura-FA2026-0102.pdf" (ASCII only, safe in a header). */
export function documentFileName(type: DocumentType, number: string | null, fallback: string): string {
  const base = `${DOCUMENT_TYPE_LABELS.sk[type]}${number ? `-${number}` : ''}`
  const ascii = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `${ascii || fallback}.pdf`
}
