'use client'

import { resetStaffMfaAction } from '@/app/admin/zamestnanci/actions'
import { ActionForm } from '@/components/admin/ui'

export function ResetMfaButton({ userId, name }: { userId: string; name: string }) {
  return (
    <ActionForm action={resetStaffMfaAction} confirm={`Zresetovať dvojstupňové overenie pre ${name}? Pri ďalšom prihlásení si ho nastaví znova (napr. po strate telefónu).`}>
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="min-h-11 text-sm text-muted2 underline underline-offset-4 hover:text-white">
        Zresetovať 2FA (stratený telefón)
      </button>
    </ActionForm>
  )
}
