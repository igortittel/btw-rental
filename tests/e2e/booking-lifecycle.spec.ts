import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { bookingByNumber, createStaff, dayInFuture, serviceClient, sign, signInCustomer, staffPage, strongPassword, type StaffAccount } from './support'

/**
 * The whole life of one booking, in order (each step needs the previous one):
 * 1. a visitor books a vehicle on the public site,
 * 2. the owner confirms it in the admin (2FA sign-in),
 * 3. the customer sets a password through a one-time link,
 * 4. the customer changes the confirmed booking -> "modified",
 * 5. the owner approves the change,
 * 6. the owner records the rental payment and the deposit,
 * 7. the owner fills in and signs the pick-up protocol -> "active".
 */
// Serial and without retries: a retry would start the story again on an already booked term.
test.describe.configure({ mode: 'serial', retries: 0 })

const VIN = 'TESTBTW0000000001'
const PHOTO = path.join(__dirname, 'fixtures', 'car.jpg')
const customerEmail = `e2e-customer-${Date.now()}@btw-rental.test`
const customerPassword = strongPassword()
const pickupDate = dayInFuture(45)
const returnDate = dayInFuture(48)
const newReturnDate = dayInFuture(49)

let owner: StaffAccount
let bookingNumber = ''
let bookingId = ''
let customerId = ''

async function continueStep(page: Page) {
  await page.getByRole('button', { name: 'Pokračovať' }).click()
}

test.beforeAll(async () => {
  owner = await createStaff('owner')
})

test('1 · visitor books a vehicle', async ({ page }) => {
  await page.goto(`/rezervacia?vozidlo=${VIN}&od=${pickupDate}&do=${returnDate}`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1, name: 'Rezervácia' })).toBeVisible()
  const opened = Date.now()

  // Step 1 – vehicle, term and place are prefilled from the link.
  await expect(page.locator('#pickupDate')).toHaveValue(pickupDate)
  await continueStep(page)

  // Step 2 – driver.
  await page.locator('#firstName').fill('Ján')
  await page.locator('#lastName').fill('Testovací')
  await page.locator('#email').fill(customerEmail)
  await page.locator('#phoneNumber').fill('900123456')
  await page.locator('#dateOfBirth').fill('1985-04-12')
  await page.locator('#licenseConfirmed').check()
  await page.locator('#street').fill('Hlavná 1')
  await page.locator('#city').fill('Bratislava')
  await page.locator('#zip').fill('81101')
  await page.locator('#depositConsent').check()
  await page.locator('#kmLimitConsent').check()
  await continueStep(page)

  // Step 3 – summary and consents.
  await page.locator('#termsConsent').check()
  await page.locator('#gdprConsent').check()
  // The form rejects submissions faster than a person could fill it in (anti-spam).
  const wait = 4_500 - (Date.now() - opened)
  if (wait > 0) await page.waitForTimeout(wait)
  await page.getByRole('button', { name: 'Záväzne rezervovať' }).click()

  await expect(page).toHaveURL(/\/rezervacia\/dakujeme\?cislo=BTW-/)
  bookingNumber = new URL(page.url()).searchParams.get('cislo')!
  const booking = await bookingByNumber(bookingNumber)
  expect(booking.status).toBe('new')
  expect(booking.customer_snapshot).toMatchObject({ email: customerEmail })
  bookingId = booking.id
  customerId = booking.customer_id
})

test('2 · owner confirms the booking (2FA)', async ({ browser }) => {
  const page = await staffPage(browser, owner)
  await page.goto(`/admin/rezervacie/${bookingId}`)
  await expect(page.getByRole('heading', { level: 1, name: `Rezervácia ${bookingNumber}` })).toBeVisible()
  await page.getByRole('button', { name: 'Potvrdiť', exact: true }).click()
  await expect(page.getByText('Potvrdená').first()).toBeVisible()
  await expect.poll(async () => (await bookingByNumber(bookingNumber)).status).toBe('confirmed')
})

test('3 · customer sets a password through the one-time link', async ({ browser }) => {
  const page = await staffPage(browser, owner)
  await page.goto(`/admin/zakaznici/${customerId}`)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Poslať odkaz na nové heslo' }).click()
  // Without an e-mail provider (CI) the link is shown to the staff member instead.
  const linkField = page.getByLabel('Jednorazový odkaz')
  await expect(linkField).toBeVisible()
  const link = new URL(await linkField.inputValue())

  const customer = await browser.newContext()
  const customerPage = await customer.newPage()
  await customerPage.goto(link.pathname + link.search, { waitUntil: 'networkidle' })
  await customerPage.locator('#password').fill(customerPassword)
  await customerPage.locator('#passwordConfirm').fill(customerPassword)
  await customerPage.getByRole('button', { name: 'Uložiť heslo a prihlásiť sa' }).click()
  await expect(customerPage).toHaveURL((url) => url.pathname === '/moj-ucet')
  await expect(customerPage.getByText(bookingNumber).first()).toBeVisible()
  await customer.close()

  const { data: profile } = await serviceClient().from('profiles').select('password_set').eq('id', customerId).single()
  expect(profile?.password_set).toBe(true)
})

test('4 · customer changes the confirmed booking -> modified', async ({ page }) => {
  await signInCustomer(page, customerEmail, customerPassword)

  const before = await bookingByNumber(bookingNumber)
  expect(before, 'booking must be confirmed with a price list price to be editable online').toMatchObject({ status: 'confirmed', price_override_reason: null })
  expect(before.total_cents).not.toBeNull()
  await page.goto(`/moj-ucet/rezervacie/${bookingId}/upravit`)
  // The page redirects to the detail when the booking cannot be changed online.
  await expect(page).toHaveURL(/\/upravit$/)
  await page.locator('#returnDate').fill(newReturnDate)
  await page.getByRole('button', { name: 'Odoslať úpravu' }).click()
  await expect(page).toHaveURL(new RegExp(`/moj-ucet/rezervacie/${bookingId}\\?zmena=caka`))

  const booking = await bookingByNumber(bookingNumber)
  expect(booking.status).toBe('modified')
  // The original term stays valid until the change is approved.
  expect(booking.return_at.slice(0, 10)).toBe(returnDate)
})

test('5 · owner approves the change', async ({ browser }) => {
  const page = await staffPage(browser, owner)
  await page.goto(`/admin/rezervacie/${bookingId}`)
  await expect(page.getByRole('heading', { name: 'Úprava od zákazníka' })).toBeVisible()
  await page.getByRole('button', { name: 'Schváliť úpravu' }).click()
  await expect.poll(async () => (await bookingByNumber(bookingNumber)).status).toBe('confirmed')
  const booking = await bookingByNumber(bookingNumber)
  expect(booking.return_at.slice(0, 10)).toBe(newReturnDate)
  expect(booking.pending_change).toBeNull()
})

test('6 · owner records the rental payment and the deposit', async ({ browser }) => {
  const page = await staffPage(browser, owner)
  await page.goto(`/admin/rezervacie/${bookingId}#platby`)
  await page.getByRole('button', { name: 'Označiť ako uhradené' }).click()
  await page.getByRole('button', { name: 'Potvrdiť úhradu' }).click()
  await expect.poll(async () => (await bookingByNumber(bookingNumber)).rental_payment_status).toBe('paid')
  await page.getByRole('button', { name: 'Depozit prijatý' }).click()
  await page.getByRole('button', { name: 'Potvrdiť prijatie' }).click()
  await expect.poll(async () => (await bookingByNumber(bookingNumber)).deposit_status).toBe('received')
  const booking = await bookingByNumber(bookingNumber)
  expect(booking.rental_paid_cents).toBe(booking.total_cents)
})

test('7 · owner signs the pick-up protocol -> active', async ({ browser }) => {
  const page = await staffPage(browser, owner)
  await page.goto(`/admin/rezervacie/${bookingId}/protokol/odovzdavaci`)
  await page.getByRole('button', { name: /Začať odovzdávací protokol/i }).click()

  // Vehicle and condition.
  await page.locator('#protocol-km').fill('12500')
  await page.getByRole('button', { name: '8/8' }).click()
  await page.getByRole('button', { name: /^Ďalej/ }).click()
  // Accessories, damage: nothing to change.
  await page.getByRole('button', { name: /^Ďalej/ }).click()
  await page.getByRole('button', { name: /^Ďalej/ }).click()

  // Photos: the four required angles.
  for (const angle of ['Spredu', 'Zozadu', 'Ľavý bok', 'Pravý bok']) {
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: new RegExp(`^＋?\\s*${angle}`) }).click()
    await (await chooser).setFiles(PHOTO)
    await expect(page.getByRole('img', { name: angle })).toBeVisible()
  }
  await page.getByRole('button', { name: /^Ďalej/ }).click()

  // Signatures.
  await expect(page.getByRole('heading', { name: 'Kontrola a podpisy' })).toBeVisible()
  await page.locator('#protocol-customer-name').fill('Ján Testovací')
  await page.locator('#protocol-staff-name').fill('E2E owner')
  await sign(page, 'Podpis: Zákazník')
  await sign(page, 'Podpis: Zamestnanec BTW')
  await page.getByRole('button', { name: 'Podpísať a uzavrieť' }).click()

  await expect.poll(async () => (await bookingByNumber(bookingNumber)).status, { timeout: 60_000 }).toBe('active')
  const { data: protocols } = await serviceClient().from('handover_protocols').select('type, signed_at').eq('booking_id', bookingId)
  expect(protocols?.some((p) => p.type === 'pickup' && p.signed_at)).toBe(true)
})
