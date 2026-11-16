import type { Metadata } from 'next'
import { saveVehicleAction } from '../actions'
import { PageHeader, Section } from '@/components/admin/section'
import { ActionForm, SubmitButton } from '@/components/admin/ui'
import { VehicleBasicsFields } from '@/components/admin/vehicle-basics-fields'
import { requireStaff } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Nové vozidlo' }

export default async function NewVehiclePage() {
  await requireStaff('manager', '/admin/vozidla/nove')
  const supabase = await createClient()
  const [{ data: categories }, { data: last }] = await Promise.all([
    supabase.from('vehicle_categories').select('id, slug, name').order('sort_order'),
    supabase.from('vehicles').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle(),
  ])

  return (
    <div>
      <PageHeader title="Nové vozidlo" back={{ href: '/admin/vozidla', label: 'Vozidlá' }} />
      <Section title="Základné údaje" description="Ceny, fotky, výbavu a podmienky doplníte po uložení.">
        <ActionForm action={saveVehicleAction}>
          <div className="space-y-6">
            <VehicleBasicsFields categories={categories ?? []} nextSort={(last?.sort_order ?? 0) + 10} />
            <SubmitButton>Vytvoriť vozidlo</SubmitButton>
          </div>
        </ActionForm>
      </Section>
    </div>
  )
}
