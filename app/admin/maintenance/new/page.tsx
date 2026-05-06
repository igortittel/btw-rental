'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import { Button }          from '@/components/ui/button'
import { Label }           from '@/components/ui/label'
import { Input }           from '@/components/ui/input'
import { DatePickerInput } from '@/components/ui/datepicker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient }    from '@/lib/supabase/client'
import { daysUntil }       from '@/lib/utils'
import { MAINTENANCE_PREDEFINED, MAINTENANCE_LABELS, type Vehicle } from '@/types'

export default function NewMaintenancePage() {
  const router = useRouter()
  const [vehicles,       setVehicles]       = useState<Vehicle[]>([])
  const [vehicleId,      setVehicleId]      = useState('')
  const [typeMode,       setTypeMode]       = useState<'predefined' | 'custom'>('predefined')
  const [selectedType,   setSelectedType]   = useState('')
  const [customType,     setCustomType]     = useState('')
  const [savedCustomTypes, setSavedCustomTypes] = useState<string[]>([])
  const [expirationDate, setExpirationDate] = useState('')
  const [isPending, startTransition]        = useTransition()
  const [error, setError]                   = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('vehicles').select('id, name, plate').order('brand'),
      // Load previously used custom types (not in predefined list)
      supabase.from('maintenance').select('type'),
    ]).then(([{ data: veh }, { data: types }]) => {
      setVehicles((veh ?? []) as Vehicle[])
      const predefinedSet = new Set(MAINTENANCE_PREDEFINED as readonly string[])
      const custom = Array.from(new Set((types ?? []).map(r => r.type).filter(t => !predefinedSet.has(t))))
      setSavedCustomTypes(custom)
    })
  }, [])

  const effectiveType = typeMode === 'custom' ? customType.trim() : selectedType
  const remaining     = expirationDate ? daysUntil(expirationDate) : null

  const handleSave = () => {
    if (!vehicleId || !effectiveType || !expirationDate) {
      setError('Vehicle, type and expiration date are required.'); return
    }
    setError(null)
    startTransition(async () => {
      const { error: err } = await createClient().from('maintenance').insert({
        vehicle_id: vehicleId, type: effectiveType, expiration_date: expirationDate,
      })
      if (err) { setError(err.message); return }
      router.push('/admin/maintenance')
    })
  }

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-lg">
        <Link href="/admin/maintenance"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-gold transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Maintenance
        </Link>
        <h1 className="text-2xl font-black font-montserrat text-white mb-6">New Maintenance Record</h1>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader><CardTitle className="text-base">Add Record</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            {/* Vehicle */}
            <div className="space-y-1.5">
              <Label>Vehicle *</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger><SelectValue placeholder="Select vehicle…" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label>Maintenance Type *</Label>

              <div className="flex gap-1 bg-zinc-950 rounded-lg p-1 w-fit">
                <button type="button" onClick={() => setTypeMode('predefined')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${typeMode === 'predefined' ? 'bg-gold text-rich-black' : 'text-zinc-400 hover:text-white'}`}>
                  Predefined
                </button>
                <button type="button" onClick={() => setTypeMode('custom')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${typeMode === 'custom' ? 'bg-gold text-rich-black' : 'text-zinc-400 hover:text-white'}`}>
                  Custom
                </button>
              </div>

              {typeMode === 'predefined' ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {MAINTENANCE_PREDEFINED.map(t => (
                      <button key={t} type="button" onClick={() => setSelectedType(t)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                          selectedType === t
                            ? 'bg-gold border-gold text-rich-black'
                            : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {selectedType && (
                    <p className="text-xs text-zinc-500">{MAINTENANCE_LABELS[selectedType]}</p>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {/* Previously used custom types */}
                  {savedCustomTypes.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1.5">Previously used</p>
                      <div className="flex flex-wrap gap-2">
                        {savedCustomTypes.map(t => (
                          <button key={t} type="button"
                            onClick={() => setCustomType(t)}
                            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                              customType === t
                                ? 'bg-gold border-gold text-rich-black'
                                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
                            }`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <p className="text-xs text-zinc-500">Or enter a new type</p>
                    <Input
                      value={customType}
                      onChange={e => setCustomType(e.target.value)}
                      placeholder="e.g. Fire Extinguisher, First Aid Kit…"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Expiration */}
            <div className="space-y-1.5">
              <Label>Expiration Date *</Label>
              <DatePickerInput value={expirationDate} onChange={setExpirationDate} placeholder="Select expiration date" />
              {remaining !== null && (
                <p className={`text-xs mt-1 ${remaining < 0 ? 'text-red-500' : remaining < 30 ? 'text-red-400' : remaining < 60 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                  {remaining < 0 ? `Already expired ${Math.abs(remaining)} days ago` : `${remaining} days from today`}
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="outline" asChild className="flex-1"><Link href="/admin/maintenance">Cancel</Link></Button>
              <Button onClick={handleSave} disabled={isPending} className="flex-1">
                {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Add Record'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
