import type { Database } from '@/types/database'

export type BookingStatus = Database['public']['Enums']['booking_status']

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  new: 'Nová',
  confirmed: 'Potvrdená',
  modified: 'Upravená',
  active: 'Prebiehajúca',
  completed: 'Ukončená',
  cancelled: 'Zrušená',
}

export const PAYMENT_METHOD_LABELS: Record<Database['public']['Enums']['payment_method'], string> = {
  transfer: 'Bankový prevod',
  terminal: 'Platobný terminál',
  cash: 'Hotovosť',
}
