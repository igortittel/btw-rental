'use client'

import { useFormAction } from '@/components/use-form-action'
import { changePasswordAction, type AdminFormState } from '@/app/admin/actions'
import { Feedback as FormFeedback } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password'

const initial: AdminFormState = {}

export function ChangePasswordForm() {
  const { state: state, onSubmit: action, pending: pending } = useFormAction(changePasswordAction, initial)

  return (
    <form onSubmit={action} className="max-w-md space-y-5" noValidate key={state.ok ? 'done' : 'form'}>
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Aktuálne heslo</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Nové heslo</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
        <p className="text-xs text-muted2">Najmenej {PASSWORD_MIN_LENGTH} znakov.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="passwordConfirm">Nové heslo znova</Label>
        <Input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" required />
      </div>
      <FormFeedback state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Ukladám…' : 'Zmeniť heslo'}
      </Button>
    </form>
  )
}
