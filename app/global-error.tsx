'use client'

// Last-resort error page when even the root layout fails; it must render its own <html>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="sk">
      <body style={{ margin: 0, background: '#111111', color: '#ffffff', fontFamily: 'Montserrat, Arial, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
          <div>
            <h1 style={{ fontSize: 28 }}>Niečo sa pokazilo · Something went wrong</h1>
            <button
              type="button"
              onClick={reset}
              style={{ marginTop: 24, height: 48, padding: '0 24px', borderRadius: 8, border: 0, background: '#B88746', color: '#ffffff', fontWeight: 600, fontSize: 16 }}
            >
              Skúsiť znova · Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
