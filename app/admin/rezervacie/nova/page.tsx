import type { Metadata } from 'next'
import { BookingEditor } from '@/components/admin/booking-editor'
import { PageHeader } from '@/components/admin/section'
import { requireStaff } from '@/lib/auth/session'
import { loadEditorData } from '@/lib/booking/editor-data'

export const metadata: Metadata = { title: 'Nová rezervácia' }

type Props = { searchParams: Promise<{ vozidlo?: string; od?: string }> }

/** Booking entered by staff, e.g. a phone order. */
export default async function NewBookingPage({ searchParams }: Props) {
  await requireStaff('manager', '/admin/rezervacie/nova')
  const [{ vehicles, locations, config, blank }, query] = await Promise.all([loadEditorData(), searchParams])
  const vin = (query.vozidlo ?? '').toUpperCase()
  const initial = { ...blank, vin: vehicles.some((v) => v.vin === vin) ? vin : '', pickupDate: /^\d{4}-\d{2}-\d{2}$/.test(query.od ?? '') ? query.od! : '' }

  return (
    <div>
      <PageHeader title="Nová rezervácia" back={{ href: '/admin/rezervacie', label: 'Rezervácie' }} />
      <BookingEditor mode="create" vehicles={vehicles} locations={locations} config={config} initial={initial} />
    </div>
  )
}
