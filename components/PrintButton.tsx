'use client'

export function PrintButton() {
  return (
    <div className="no-print fixed top-4 right-4 z-50">
      <button
        onClick={() => window.print()}
        className="px-4 py-2 bg-[#B88746] text-[#111111] text-sm font-bold rounded-lg hover:opacity-90 transition-opacity shadow-lg"
      >
        Export PDF
      </button>
    </div>
  )
}
