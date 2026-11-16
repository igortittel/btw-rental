import { createClient } from '@/lib/supabase/server'

type Props = { searchParams: Promise<{ chyba?: string }> }

// Phase 2: confirms that sign-in, roles and RLS work. The real dashboard (pickups,
// returns, KPIs) arrives with bookings in Phase 6.
export default async function AdminHomePage({ searchParams }: Props) {
  const { chyba } = await searchParams
  const supabase = await createClient()
  const [vehicles, bookings] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }),
    supabase.from('bookings').select('id', { count: 'exact', head: true }),
  ])

  const tiles = [
    { label: 'Vozidlá', value: vehicles.count ?? 0 },
    { label: 'Rezervácie', value: bookings.count ?? 0 },
  ]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-wide text-white">Prehľad</h1>
      {chyba === 'opravnenie' ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Na požadovanú stránku nemáte oprávnenie.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-gold/50 bg-surface p-6">
            <p className="text-sm text-muted2">{tile.label}</p>
            <p className="mt-2 text-3xl font-bold text-white">{tile.value}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted2">Správa vozidiel, príplatkov a nastavení pribudne vo Fáze 3, rezervácie vo Fáze 6.</p>
    </div>
  )
}
