import { describe, expect, it } from 'vitest'
import { localizedPath } from '@/i18n/routing'
import { emailSchema, newPasswordSchema, passwordSchema } from '@/lib/auth/password'
import { hasRole, safeNextPath } from '@/lib/auth/roles'
import { generateToken, hashToken, TOKEN_TTL_HOURS } from '@/lib/auth/tokens'

describe('password rules', () => {
  it('requires at least 10 characters', () => {
    expect(passwordSchema.safeParse('123456789').success).toBe(false)
    expect(passwordSchema.safeParse('1234567890').success).toBe(true)
  })
  it('rejects passwords longer than the bcrypt limit', () => {
    expect(passwordSchema.safeParse('x'.repeat(73)).success).toBe(false)
  })
  it('requires both entries to match', () => {
    const result = newPasswordSchema.safeParse({ password: 'correct-horse', passwordConfirm: 'correct-horsE' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('passwords_do_not_match')
  })
  it('normalises email addresses', () => {
    expect(emailSchema.parse('  Anna@Example.COM ')).toBe('anna@example.com')
    expect(emailSchema.safeParse('not-an-email').success).toBe(false)
  })
})

describe('staff roles', () => {
  it('orders operator < manager < owner', () => {
    expect(hasRole('owner', 'manager')).toBe(true)
    expect(hasRole('manager', 'manager')).toBe(true)
    expect(hasRole('operator', 'manager')).toBe(false)
    expect(hasRole('manager', 'owner')).toBe(false)
  })
  it('treats customers as having no role', () => {
    expect(hasRole(null, 'operator')).toBe(false)
    expect(hasRole(undefined, 'operator')).toBe(false)
  })
})

describe('post-login redirect target', () => {
  it('accepts same-origin relative paths', () => {
    expect(safeNextPath('/moj-ucet/rezervacie/1?x=1', '/moj-ucet')).toBe('/moj-ucet/rezervacie/1?x=1')
  })
  it('rejects anything that could leave the site', () => {
    for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', 'moj-ucet', '/x?u=http://evil.example', '', null]) {
      expect(safeNextPath(value, '/moj-ucet')).toBe('/moj-ucet')
    }
  })
})

describe('password link tokens', () => {
  it('generates unguessable, URL-safe tokens', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
  it('stores only a SHA-256 hash', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('keeps the first-password link valid for 72 hours', () => {
    expect(TOKEN_TTL_HOURS.set_password).toBe(72)
    expect(TOKEN_TTL_HOURS.reset_password).toBeLessThan(TOKEN_TTL_HOURS.set_password)
  })
})

describe('locale prefix', () => {
  it('keeps Slovak without a prefix and puts English under /en', () => {
    expect(localizedPath('sk', '/moj-ucet')).toBe('/moj-ucet')
    expect(localizedPath('en', '/moj-ucet')).toBe('/en/moj-ucet')
    expect(localizedPath('en', '/')).toBe('/en')
  })
  it('never localises admin paths', () => {
    expect(localizedPath('en', '/admin')).toBe('/admin')
  })
})
