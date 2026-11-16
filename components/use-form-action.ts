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
    const data = new FormData(event.currentTarget)
    startTransition(() => dispatch(data))
  }
  return { state, pending, onSubmit }
}
