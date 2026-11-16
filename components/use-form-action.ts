'use client'

import { useActionState, useTransition, type FormEvent } from 'react'

/**
 * useActionState with a submit handler that dispatches manually. Unlike
 * <form action={…}>, this does not make React reset the form afterwards, so the
 * user's input survives a validation error.
 */
export function useFormAction<S>(action: (prev: Awaited<S>, formData: FormData) => S | Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState(action, initial)
  const [, startTransition] = useTransition()
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Include the button that was pressed: forms with several submit buttons (approve / reject)
    // tell them apart by its name and value.
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const data = new FormData(event.currentTarget, submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined)
    startTransition(() => dispatch(data))
  }
  return { state, pending, onSubmit }
}
