/** First focusable element: lets keyboard and screen-reader users jump over the navigation (WCAG 2.4.1). */
export function SkipLink({ label, target = 'obsah' }: { label: string; target?: string }) {
  return (
    <a
      href={`#${target}`}
      className="sr-only z-[100] rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-gold"
    >
      {label}
    </a>
  )
}
