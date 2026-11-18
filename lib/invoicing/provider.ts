import type { DocumentType } from '@/lib/documents'

/**
 * Interface for issuing accounting documents in BTW's invoicing system (iKros).
 *
 * Phase 9 only defines the contract – no implementation is wired up and the admin hides
 * the "Issue in iKros" button while `getInvoicingProvider()` returns null. Until then BTW
 * issues invoices in iKros by hand and uploads the PDF to the booking.
 *
 * An implementation will:
 *  1. build the document from the booking (customer billing data from `customer_snapshot`,
 *     lines from `price_snapshot` / the approved settlement, VAT rate of the booking),
 *  2. create it in iKros and download the PDF,
 *  3. store the PDF under `documents/<booking_id>/` and insert a `documents` row – the same
 *     path the manual upload uses, so the customer zone and email 11 work unchanged.
 * API credentials belong in Vercel environment variables, never in the code.
 */

export type InvoiceParty = {
  name: string
  street: string | null
  city: string | null
  zip: string | null
  country: string | null
  ico: string | null
  dic: string | null
  icDph: string | null
  email: string | null
}

export type InvoiceLine = {
  description: string
  quantity: number
  /** Unit price including VAT, in cents. */
  unitPriceCents: number
  vatRate: number
}

export type InvoiceRequest = {
  bookingId: string
  bookingNumber: string
  type: DocumentType
  customer: InvoiceParty
  lines: InvoiceLine[]
  /** Variable symbol for bank transfers (numeric part of the booking number). */
  variableSymbol: string
  issueDate: string // YYYY-MM-DD
  dueDate: string | null // YYYY-MM-DD
  currency: 'EUR'
  locale: 'sk' | 'en'
  /** For a credit note: number of the invoice it corrects. */
  correctsNumber?: string | null
}

export type IssuedInvoice = {
  /** Identifier in the invoicing system. */
  externalId: string
  number: string
  totalCents: number
  pdf: Uint8Array
}

export interface InvoicingProvider {
  /** Shown in the admin ("Vystaviť v iKros"). */
  readonly name: string
  issue(request: InvoiceRequest): Promise<IssuedInvoice>
  /** PDF of a document issued earlier (e.g. after a correction in the invoicing system). */
  downloadPdf(externalId: string): Promise<Uint8Array>
}

/** The configured provider, or null while invoices are issued by hand (Phase 9). */
export function getInvoicingProvider(): InvoicingProvider | null {
  return null
}
