'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, ChevronUp, ChevronDown, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { daysUntil, formatDate, cn } from '@/lib/utils'
import { MAINTENANCE_LABELS, type Maintenance } from '@/types'

type MaintenanceRow = Maintenance & { vehicle?: { name: string; plate: string } }
type SortField = 'vehicle' | 'type' | 'expiration_date' | 'remaining'
type SortDir   = 'asc' | 'desc'
type StatusFilter = 'all' | 'critical' | 'warning'

interface ServiceTrackerProps {
  records:          MaintenanceRow[]
  maintenanceLinkBase?: string
}

function StatusIcon({ days }: { days: number }) {
  if (days < 0)  return <AlertTriangle className="h-4 w-4 text-red-500" />
  if (days < 30) return <AlertTriangle className="h-4 w-4 text-red-400" />
  if (days < 60) return <Clock className="h-4 w-4 text-yellow-400" />
  return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
}

function RemainingBadge({ days }: { days: number }) {
  const label   = days < 0 ? 'EXPIRED' : `${days}d`
  const variant = days < 0 ? 'destructive' : days < 30 ? 'destructive' : days < 60 ? 'warning' : 'success'
  return <Badge variant={variant as any} className="tabular-nums font-mono text-xs">{label}</Badge>
}

export default function ServiceTracker({
  records,
  maintenanceLinkBase = '/admin/maintenance/',
}: ServiceTrackerProps) {
  const [sortField, setSortField] = useState<SortField>('remaining')
  const [sortDir,   setSortDir]   = useState<SortDir>('asc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter,   setTypeFilter]   = useState<string>('all')
  const [vehicleFilter, setVehicleFilter] = useState<string>('all')

  const enriched = useMemo(
    () => records.map(r => ({ ...r, remaining: daysUntil(r.expiration_date) })),
    [records]
  )

  const uniqueVehicles = useMemo(
    () => Array.from(new Set(records.map(r => r.vehicle?.name ?? '').filter(Boolean))),
    [records]
  )

  const filtered = useMemo(() => enriched.filter(r => {
    if (statusFilter === 'critical' && r.remaining >= 30) return false
    if (statusFilter === 'warning'  && (r.remaining < 30 || r.remaining >= 60)) return false
    if (typeFilter !== 'all'    && r.type !== typeFilter) return false
    if (vehicleFilter !== 'all' && r.vehicle?.name !== vehicleFilter) return false
    return true
  }), [enriched, statusFilter, typeFilter, vehicleFilter])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortField === 'vehicle')        cmp = (a.vehicle?.name ?? '').localeCompare(b.vehicle?.name ?? '')
    if (sortField === 'type')           cmp = a.type.localeCompare(b.type)
    if (sortField === 'expiration_date') cmp = a.expiration_date.localeCompare(b.expiration_date)
    if (sortField === 'remaining')      cmp = a.remaining - b.remaining
    return sortDir === 'asc' ? cmp : -cmp
  }), [filtered, sortField, sortDir])

  const criticalCount = enriched.filter(r => r.remaining < 30).length
  const warningCount  = enriched.filter(r => r.remaining >= 30 && r.remaining < 60).length

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField !== field
      ? <ChevronUp className="h-3 w-3 opacity-30" />
      : sortDir === 'asc'
        ? <ChevronUp className="h-3 w-3 text-gold" />
        : <ChevronDown className="h-3 w-3 text-gold" />

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        {criticalCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400">{criticalCount} Critical (&lt;30 days)</span>
          </div>
        )}
        {warningCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
            <Clock className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-semibold text-yellow-400">{warningCount} Due Soon</span>
          </div>
        )}
        {criticalCount === 0 && warningCount === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">All maintenance up-to-date</span>
          </div>
        )}
        <Button asChild size="sm" className="ml-auto">
          <Link href="/admin/maintenance/new">
            <Plus className="h-4 w-4" /> Add Maintenance
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Status filter tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1">
          {([['all', `All (${enriched.length})`], ['critical', `Critical (${criticalCount})`], ['warning', `Warning (${warningCount})`]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
                statusFilter === key ? 'bg-gold text-rich-black' : 'text-zinc-400 hover:text-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="h-8 rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 px-2 focus:outline-none focus:ring-1 focus:ring-gold/50 cursor-pointer"
        >
          <option value="all">All Types</option>
          {(['STK','PZP','KASKO','SERVICE','TOLL','TIRES'] as const).map(t => (
            <option key={t} value={t}>{t} — {MAINTENANCE_LABELS[t]}</option>
          ))}
        </select>

        {/* Vehicle filter */}
        <select
          value={vehicleFilter}
          onChange={e => setVehicleFilter(e.target.value)}
          className="h-8 rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 px-2 focus:outline-none focus:ring-1 focus:ring-gold/50 cursor-pointer"
        >
          <option value="all">All Vehicles</option>
          {uniqueVehicles.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60">
                {([
                  ['vehicle',        'Vehicle'],
                  ['type',           'Type'],
                  ['expiration_date','Expires'],
                  ['remaining',      'Remaining'],
                ] as [SortField, string][]).map(([field, label]) => (
                  <th
                    key={field}
                    onClick={() => handleSort(field)}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 cursor-pointer hover:text-white select-none"
                  >
                    <div className="flex items-center gap-1">
                      {label}
                      <SortIcon field={field} />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No records match the current filters.
                  </td>
                </tr>
              ) : sorted.map(record => (
                <tr
                  key={record.id}
                  className={cn(
                    'transition-colors hover:bg-zinc-800/40 cursor-pointer',
                    record.remaining < 30 ? 'bg-red-950/20' : ''
                  )}
                  onClick={() => window.location.href = `${maintenanceLinkBase}${record.id}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{record.vehicle?.name ?? '—'}</p>
                    <p className="text-xs text-zinc-500">{record.vehicle?.plate ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-300">{record.type}</span>
                    <p className="text-xs text-zinc-500 mt-0.5">{MAINTENANCE_LABELS[record.type]}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-300 tabular-nums text-sm">
                    {formatDate(record.expiration_date)}
                  </td>
                  <td className="px-4 py-3">
                    <RemainingBadge days={record.remaining} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusIcon days={record.remaining} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
