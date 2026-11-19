import { createHmac, randomBytes } from 'node:crypto'
import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Helpers for the end-to-end tests. They talk to the local Supabase stack with the
 * service role (test data setup and checks only – the flows themselves go through the UI).
 */

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (local Supabase).')
  // Guard: the tests create bookings, accounts and immutable audit records.
  if (/\.supabase\.co/.test(url) && process.env.E2E_ALLOW_REMOTE !== '1') {
    throw new Error(`Refusing to run E2E against ${url} – use the local Supabase stack (supabase start).`)
  }
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from a base32 secret – what an authenticator app shows. */
export function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = secret
    .replace(/[\s=]/g, '')
    .toUpperCase()
    .split('')
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0'))
    .join('')
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 15
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

export function strongPassword(): string {
  return `E2e-${randomBytes(12).toString('base64url')}-9`
}

export type StaffAccount = { email: string; password: string; totpSecret?: string; state?: BrowserContextOptions['storageState'] }

/** Staff member created directly (an invitation would need e-mail); 2FA is enrolled on first sign-in. */
export async function createStaff(role: 'owner' | 'manager' | 'operator'): Promise<StaffAccount> {
  const admin = serviceClient()
  const email = `e2e-${role}-${Date.now()}@btw-rental.test`
  const password = strongPassword()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: 'E2E', last_name: role } })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  const profile = await admin.from('profiles').update({ type: 'staff', password_set: true }).eq('id', data.user.id)
  if (profile.error) throw profile.error
  const role_ = await admin.from('staff_roles').insert({ user_id: data.user.id, role })
  if (role_.error) throw role_.error
  return { email, password }
}

/** Waits for the next 30-second TOTP window when the current one is almost over (codes are single-use). */
async function freshTotp(secret: string): Promise<string> {
  const left = 30_000 - (Date.now() % 30_000)
  if (left < 4_000) await new Promise((resolve) => setTimeout(resolve, left + 500))
  return totp(secret)
}

/** Password sign-in followed by the 2FA step: enrolment (QR + secret shown) on the first sign-in, a code afterwards. */
export async function signInStaff(page: Page, account: StaffAccount) {
  await page.goto('/prihlasenie?next=/admin', { waitUntil: 'networkidle' })
  await page.locator('#email').fill(account.email)
  await page.locator('#password').fill(account.password)
  await page.locator('form:has(#password) button[type=submit]').click()
  await expect(page.locator('#totp-code')).toBeVisible()
  const secretElement = page.locator('code')
  if (!account.totpSecret && (await secretElement.count()) > 0) account.totpSecret = (await secretElement.first().textContent())?.trim()
  if (!account.totpSecret) throw new Error('No TOTP secret: the account was enrolled outside this test run.')
  await page.locator('#totp-code').fill(await freshTotp(account.totpSecret))
  await page.getByRole('button', { name: /Zapnúť a pokračovať|Overiť/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Prehľad' })).toBeVisible()
}

/** YYYY-MM-DD `days` from today. */
export function dayInFuture(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

export async function bookingByNumber(number: string) {
  const { data, error } = await serviceClient().from('bookings').select('*').eq('number', number).single()
  if (error) throw error
  return data
}

/** Draws a short stroke on a signature canvas. */
export async function sign(page: Page, label: string) {
  const canvas = page.getByLabel(label)
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error(`signature pad ${label} not visible`)
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3, { steps: 8 })
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 8 })
  await page.mouse.up()
}

/**
 * A page signed in as the staff member. The first call signs in (password + TOTP) and keeps
 * the session; later calls reuse it, so each TOTP code is used once.
 */
export async function staffPage(browser: Browser, account: StaffAccount): Promise<Page> {
  const context = await browser.newContext(account.state ? { storageState: account.state } : {})
  const page = await context.newPage()
  if (!account.state) {
    await signInStaff(page, account)
    account.state = await context.storageState()
  }
  return page
}

/** Customer sign-in with e-mail and password; ends in Môj účet (fails with the form's error otherwise). */
export async function signInCustomer(page: Page, email: string, password: string) {
  // Wait for the page to be interactive: the form is submitted by JavaScript.
  await page.goto('/prihlasenie?next=/moj-ucet', { waitUntil: 'networkidle' })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('form:has(#password) button[type=submit]').click()
  // Either Môj účet opens or the form shows its error (Next.js also has a page-wide role="alert" announcer).
  const formError = page.locator('form:has(#password) [role=alert]')
  await expect(async () => {
    if ((await formError.count()) > 0) throw new Error(`sign-in failed: ${await formError.first().textContent()}`)
    expect(new URL(page.url()).pathname).toBe('/moj-ucet')
  }).toPass({ timeout: 20_000 })
}
