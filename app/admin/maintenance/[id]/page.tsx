'use client'

import { useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button }            from '@/components/ui/button'
import { Label }             from '@/components/ui/label'
import { Input }             from '@/components/ui/input'
import { DatePickerInput }   from '@/components/ui/datepicker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { daysUntil, formatDate } from '@/lib/utils'
import { MAINTENANCE_LABELS, type Maintenance, type Vehicle } from '@/types'

const TYPES = ['STK', 'PZP', 'KASKO', 'SERVICE', 'TOLL', 'TIRES'] as const

export default function MaintenanceDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()

  const [record,   setRecord]   = useState<Maintenance | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading,  setLoading]  = useState(true)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form state
  const [vehicleId,       setVehicleId]       = useState('')
  const [type,            setType]            = useState<typeof TYPES[number]>('STK')
  const [expirationDate,  setExpirationDate]  = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: rec }, { data: veh }] = await Promise.all([
        supabase.from('maintenance').select('*, vehicle:vehicles(name, plate)').eq('id', id).single(),
        supabase.from('vehicles').select('id, name, plate').order('brand'),
      ])
      if (rec) {
        setRecord(rec as Maintenance)
        setVehicleId(rec.vehicle_id)
        setType(rec.type as typeof TYPES[number])
        setExpirationDate(rec.expiration_date)
      }
      setVehicles((veh ?? []) as Vehicle[])
      setLoading(false)
    }
    load()
  }, [id])

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error: err } = await supabase
        .from('maintenance')
        .update({ vehicle_id: vehicleId, type, expiration_date: expirationDate })
        .eq('id', id)
      if (err) { setError(err.message); return }
      router.push('/admin/fleet')
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('maintenance').delete().eq('id', id)
      router.push('/admin/fleet')
    })
  }

  const handleMarkDone = () => {
    // "Done" = remove the record; admin adds a new one when the next service is due
    handleDelete()
  }

  if (loading) return (
    <div className="min-h-screen pt-24 flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!record) return (
    <div className="min-h-screen pt-24 text-center py-20">
      <p className="text-zinc-400">Record not found.</p>
      <Button asChild className="mt-4" variant="outline"><Link href="/admin/fleet">Back</Link></Button>
    </div>
  )

  const remaining = daysUntil(expirationDate || record.expiration_date)

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-lg">

        <Link href="/admin/fleet"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-gold transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Fleet
        </Link>

        <h1 className="text-2xl font-black font-montserrat text-white mb-6">
          Maintenance Detail
        </h1>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-base">Edit Record</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Vehicle */}
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger><SelectValue placeholder="Select vehicle…" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.plate})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>Maintenance Type</Label>
              <Select value={type} onValueChange={v => setType(v as typeof TYPES[number])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      <span className="font-mono mr-2">{t}</span>
                      <span className="text-zinc-400">— {MAINTENANCE_LABELS[t]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Expiration date */}
            <div className="space-y-1.5">
              <Label>Expiration Date</Label>
              <DatePickerInput
                value={expirationDate}
                onChange={setExpirationDate}
                placeholder="Select expiration date"
              />
              {expirationDate && (
                <p className={`text-xs mt-1 ${
                  remaining < 0  ? 'text-red-500' :
                  remaining < 30 ? 'text-red-400' :
                  remaining < 60 ? 'text-yellow-400' :
                  'text-emerald-400'
                }`}>
                  {remaining < 0
                    ? `Expired ${Math.abs(remaining)} days ago`
                    : `${remaining} days remaining`}
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}

            <Button onClick={handleSave} disabled={isPending} className="w-full">
              {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Mark as Done */}
        <Card className="border-emerald-500/20 bg-emerald-950/10 mt-4">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">Mark as Done</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Service completed — removes this record from the tracker.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleMarkDone}
              disabled={isPending}
              className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 shrink-0"
            >
              <CheckCircle2 className="h-4 w-4" /> Done
            </Button>
          </CardContent>
        </Card>

        {/* Delete */}
        <Card className="border-red-500/20 bg-red-950/10 mt-4">
          <CardContent className="p-4">
            {!showDeleteConfirm ? (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Delete Record</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Permanently remove this maintenance entry.</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 shrink-0"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-yellow-400">Are you sure? This cannot be undone.</p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={isPending}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                  >
                    {isPending ? 'Deleting…' : 'Confirm Delete'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
