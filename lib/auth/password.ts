import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 72 // bcrypt limit used by Supabase Auth

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH, { message: 'password_too_short' }).max(PASSWORD_MAX_LENGTH, { message: 'password_too_long' })

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'email_invalid' }).max(254))

export const newPasswordSchema = z.object({ password: passwordSchema, passwordConfirm: z.string() }).refine((v) => v.password === v.passwordConfirm, {
  message: 'passwords_do_not_match',
  path: ['passwordConfirm'],
})
