import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPwnedPassword, pwnedCount } from '@/lib/auth/pwned'

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase()

describe('pwnedCount', () => {
  const body = '0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:0\r\n011053FD0102E94D6AE2F8B83D76FAF94F6:13'
  it('finds the suffix, case-insensitively', () => {
    expect(pwnedCount(body, '011053FD0102E94D6AE2F8B83D76FAF94F6')).toBe(13)
    expect(pwnedCount(body, '0018a45c4d1def81644b54ab7f969b88d65')).toBe(1)
  })
  it('treats padding lines (count 0) and missing suffixes as not leaked', () => {
    expect(pwnedCount(body, '00D4F6E8FA6EECAD2A3AA415EEC418D38EC')).toBe(0)
    expect(pwnedCount(body, 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(0)
  })
})

describe('isPwnedPassword', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends only the 5-character hash prefix and detects a leaked password', async () => {
    const hash = sha1('password123')
    const fetchMock = vi.fn(async () => new Response(`${hash.slice(5)}:250000\nABC:0`))
    vi.stubGlobal('fetch', fetchMock)
    expect(await isPwnedPassword('password123')).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`)
    expect(url).not.toContain('password123')
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true')
  })

  it('accepts a password that is not in the list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ABC:3')))
    expect(await isPwnedPassword('a-unique-passphrase-42')).toBe(false)
  })

  it('fails open when the service is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    expect(await isPwnedPassword('password123')).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })))
    expect(await isPwnedPassword('password123')).toBe(false)
  })
})
