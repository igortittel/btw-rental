'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { emailSchema, newPasswordSchema } from '@/lib/auth/password'
import { sendPasswordLink } from '@/lib/auth/password-links'
import { getClientIp, rateLimit } from '@/lib/auth/rate-limit'
import { STAFF_ROLES } from '@/lib/auth/roles'
import { getSessionUser, getStaff } from '@/lib/auth/session'
import { createAdminClient, createStatelessClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type AdminFormState = { error?: string; ok?: boolean; message?: string; link?: string }

const ERRORS: Record<string, string> = {
  forbidden: 'Na túto akciu nemáte oprávnenie.',
  rate_limited: 'Príliš veľa pokusov. Skúste to o niekoľko minút.',
  current_password_wrong: 'Aktuálne heslo nie je správne.',
  password_too_short: 'Heslo musí mať najmenej 10 znakov.',
  password_too_long: 'Heslo môže mať najviac 72 znakov.',
  passwords_do_not_match: 'Heslá sa nezhodujú.',
  password_rejected: 'Toto heslo nie je možné použiť. Zvoľte iné.',
  email_invalid: 'Zadajte platnú e-mailovú adresu.',
  name_required: 'Zadajte meno aj priezvisko.',
  already_staff: 'Tento e-mail už patrí zamestnancovi.',
  cannot_change_self: 'Vlastnú rolu ani stav nemôžete meniť.',
  last_owner: 'V systéme musí zostať aspoň jeden aktívny majiteľ.',
  not_found: 'Zamestnanec sa nenašiel.',
  unknown: 'Akcia sa nepodarila. Skúste to znova.',
}

const fail = (code: string): AdminFormState => ({ error: ERRORS[code] ?? ERRORS.unknown })

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

// ── Môj profil → Zmena hesla ─────────────────────────────────────────────
export async function changePasswordAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const user = await getSessionUser()
  if (!user) return fail('forbidden')

  const ip = await getClientIp()
  if (!(await rateLimit(`changepw:${user.id}:${ip}`, 8, 15 * 60))) return fail('rate_limited')

  const parsed = newPasswordSchema.safeParse({
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
  })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'unknown')

  // Re-authenticate with the current password without touching the session cookies.
  const current = formData.get('currentPassword')
  const check = await createStatelessClient().auth.signInWithPassword({
    email: user.email,
    password: typeof current === 'string' ? current : '',
  })
  if (check.error) return fail('current_password_wrong')

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return fail('password_rejected')

  await supabase.from('profiles').update({ password_set: true }).eq('id', user.id)
  return { ok: true, message: 'Heslo bolo zmenené.' }
}

// ── Zamestnanci (owner) ──────────────────────────────────────────────────
const inviteSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  role: z.enum(STAFF_ROLES),
})

export async function inviteStaffAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const owner = await getStaff('owner')
  if (!owner) return fail('forbidden')

  const email = emailSchema.safeParse(field(formData, 'email'))
  if (!email.success) return fail('email_invalid')
  const parsed = inviteSchema.safeParse({
    firstName: field(formData, 'firstName'),
    lastName: field(formData, 'lastName'),
    role: field(formData, 'role'),
  })
  if (!parsed.success) return fail('name_required')

  const admin = createAdminClient()
  const supabase = await createClient() // owner session: RLS + audit log carry the real actor

  const { data: existing } = await admin
    .from('profiles')
    .select('id, password_set, anonymized_at')
    .ilike('email', email.data.replace(/[%_\\]/g, '\\$&'))
    .maybeSingle()

  let profileId = existing && !existing.anonymized_at ? existing.id : null
  let passwordSet = existing?.password_set ?? false

  if (profileId) {
    const { data: role } = await admin.from('staff_roles').select('user_id').eq('user_id', profileId).maybeSingle()
    if (role) return fail('already_staff')
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: email.data,
      email_confirm: true,
      user_metadata: { first_name: parsed.data.firstName, last_name: parsed.data.lastName },
    })
    if (error || !created.user) return fail('unknown')
    profileId = created.user.id
    passwordSet = false
  }

  const { error: profileError } = await supabase.from('profiles').update({ type: 'staff', first_name: parsed.data.firstName, last_name: parsed.data.lastName }).eq('id', profileId)
  if (profileError) return fail('unknown')

  const { error: roleError } = await supabase.from('staff_roles').insert({ user_id: profileId, role: parsed.data.role, invited_by: owner.id })
  if (roleError) return fail('unknown')

  revalidatePath('/admin/zamestnanci')

  if (passwordSet) {
    return { ok: true, message: 'Existujúci účet dostal prístup do administrácie. Prihlási sa svojím heslom.' }
  }
  const result = await sendPasswordLink({
    profileId,
    email: email.data,
    locale: 'sk',
    purpose: 'set_password',
    kind: 'staff_invite',
    createdBy: owner.id,
    next: '/admin',
  })
  return result.emailSent
    ? { ok: true, message: `Pozvánka bola odoslaná na ${email.data}.` }
    : {
        ok: true,
        message: 'Zamestnanec je vytvorený, ale e-mail sa nepodarilo odoslať. Pošlite mu tento jednorazový odkaz (platí 72 hodín):',
        link: result.link,
      }
}

export async function resendInviteAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const owner = await getStaff('owner')
  if (!owner) return fail('forbidden')
  const userId = field(formData, 'userId')

  const admin = createAdminClient()
  const { data: target } = await admin.from('staff_roles').select('user_id, profiles!staff_roles_user_id_fkey(email, password_set)').eq('user_id', userId).maybeSingle()
  const profile = target?.profiles
  if (!target || !profile?.email) return fail('not_found')

  const result = await sendPasswordLink({
    profileId: target.user_id,
    email: profile.email,
    locale: 'sk',
    purpose: profile.password_set ? 'reset_password' : 'set_password',
    kind: profile.password_set ? 'reset_password' : 'staff_invite',
    createdBy: owner.id,
    next: '/admin',
  })
  return result.emailSent
    ? { ok: true, message: `Odkaz bol odoslaný na ${profile.email}.` }
    : { ok: true, message: 'E-mail sa nepodarilo odoslať. Odovzdajte tento jednorazový odkaz:', link: result.link }
}

export async function updateStaffAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const owner = await getStaff('owner')
  if (!owner) return fail('forbidden')

  const userId = field(formData, 'userId')
  const role = z.enum(STAFF_ROLES).safeParse(field(formData, 'role'))
  const isActive = field(formData, 'isActive') === 'true'
  if (!role.success) return fail('unknown')
  if (userId === owner.id) return fail('cannot_change_self')

  const supabase = await createClient()
  const { data: target } = await supabase.from('staff_roles').select('role, is_active').eq('user_id', userId).maybeSingle()
  if (!target) return fail('not_found')

  const losesOwner = target.role === 'owner' && target.is_active && (role.data !== 'owner' || !isActive)
  if (losesOwner) {
    const { count } = await supabase.from('staff_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'owner').eq('is_active', true).neq('user_id', userId)
    if (!count) return fail('last_owner')
  }

  const { error } = await supabase.from('staff_roles').update({ role: role.data, is_active: isActive }).eq('user_id', userId)
  if (error) return fail('unknown')

  // A deactivated employee is signed out everywhere.
  if (!isActive)
    await createAdminClient()
      .auth.admin.signOut(userId, 'global')
      .catch(() => undefined)

  revalidatePath('/admin/zamestnanci')
  return { ok: true, message: 'Uložené.' }
}
