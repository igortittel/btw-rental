'use client'

import { useActionState } from 'react'
import { inviteStaffAction, resendInviteAction, updateStaffAction, type AdminFormState } from '@/app/admin/actions'
import { FormFeedback } from '@/components/admin/form-feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { STAFF_ROLE_LABELS, STAFF_ROLES, type StaffRole } from '@/lib/auth/roles'

const initial: AdminFormState = {}
const selectClass =
  'h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/50'

export function InviteStaffForm() {
  const [state, action, pending] = useActionState(inviteStaffAction, initial)

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">Meno</Label>
          <Input id="firstName" name="firstName" autoComplete="off" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Priezvisko</Label>
          <Input id="lastName" name="lastName" autoComplete="off" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="off" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Rola</Label>
          <select id="role" name="role" defaultValue="operator" className={selectClass}>
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {STAFF_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <FormFeedback state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Odosielam…' : 'Pozvať zamestnanca'}
      </Button>
    </form>
  )
}

type StaffRowProps = { userId: string; role: StaffRole; isActive: boolean; isSelf: boolean; passwordSet: boolean }

export function StaffRowActions({ userId, role, isActive, isSelf, passwordSet }: StaffRowProps) {
  const [updateState, update, updating] = useActionState(updateStaffAction, initial)
  const [resendState, resend, resending] = useActionState(resendInviteAction, initial)

  if (isSelf) return <p className="text-sm text-muted2">Váš účet – rolu si nemôžete zmeniť sami.</p>

  return (
    <div className="space-y-3">
      <form action={update} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="userId" value={userId} />
        <div className="space-y-1">
          <Label htmlFor={`role-${userId}`}>Rola</Label>
          <select id={`role-${userId}`} name="role" defaultValue={role} className={`${selectClass} w-40`}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`active-${userId}`}>Stav</Label>
          <select id={`active-${userId}`} name="isActive" defaultValue={String(isActive)} className={`${selectClass} w-40`}>
            <option value="true">Aktívny</option>
            <option value="false">Deaktivovaný</option>
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={updating}>
          {updating ? 'Ukladám…' : 'Uložiť'}
        </Button>
      </form>
      <form action={resend}>
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="link" disabled={resending}>
          {passwordSet ? 'Poslať odkaz na nové heslo' : 'Poslať pozvánku znova'}
        </Button>
      </form>
      <FormFeedback state={updateState} />
      <FormFeedback state={resendState} />
    </div>
  )
}
