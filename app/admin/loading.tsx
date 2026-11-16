// Shown immediately on navigation while the next admin page loads its data.
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-10 text-sm text-muted2">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" aria-hidden="true" />
      Načítavam…
    </div>
  )
}
