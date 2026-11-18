'use client'

import { useEffect, useRef, useState } from 'react'
import { createDocumentAction, deleteDocumentAction, resendDocumentAction } from '@/app/admin/rezervacie/document-actions'
import { ActionForm, Feedback, selectClass } from '@/components/admin/ui'
import { DateField, SELECT_CHEVRON_STYLE } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFormAction } from '@/components/use-form-action'
import { DOCUMENTS_BUCKET, DOCUMENT_MAX_BYTES, DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, documentPath, type DocumentType } from '@/lib/documents'
import { createClient } from '@/lib/supabase/client'

export type DocumentRow = {
  id: string
  type: DocumentType
  number: string | null
  amount: string | null
  issuedAt: string | null
  uploadedBy: string | null
  emailedAt: string | null
}

/** Documents of a booking: list with download, upload (managers), delete, resend email 11. */
export function DocumentsPanel({ bookingId, documents, canManage, hasEmail, today }: { bookingId: string; documents: DocumentRow[]; canManage: boolean; hasEmail: boolean; today: string }) {
  return (
    <div className="space-y-5">
      {documents.length === 0 ? (
        <p className="text-sm text-muted2">K rezervácii zatiaľ nie je nahratý žiadny doklad.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted2">
              <tr>
                <th scope="col" className="py-2 pr-3 font-semibold">Typ</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Číslo</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Suma s DPH</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Vystavený</th>
                <th scope="col" className="py-2 pr-3 font-semibold">E-mail</th>
                <th scope="col" className="py-2 font-semibold"><span className="sr-only">Akcie</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {documents.map((doc) => (
                <tr key={doc.id} className="align-top">
                  <td className="py-3 pr-3 text-white">
                    {DOCUMENT_TYPE_LABELS.sk[doc.type]}
                    {doc.uploadedBy ? <span className="block text-xs text-muted2">nahral {doc.uploadedBy}</span> : null}
                  </td>
                  <td className="py-3 pr-3 font-semibold text-white">{doc.number ?? '—'}</td>
                  <td className="py-3 pr-3 text-white">{doc.amount ?? '—'}</td>
                  <td className="py-3 pr-3 text-muted2">{doc.issuedAt ?? '—'}</td>
                  <td className="py-3 pr-3 text-muted2">{doc.emailedAt ? `odoslaný ${doc.emailedAt}` : 'neodoslaný'}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1">
                      <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener" className="flex min-h-11 items-center font-semibold text-gold hover:underline">
                        PDF
                      </a>
                      {canManage && hasEmail ? (
                        <ActionForm action={resendDocumentAction} confirm="Poslať zákazníkovi e-mail s dokladom?">
                          <input type="hidden" name="id" value={doc.id} />
                          <button type="submit" className="min-h-11 text-muted2 underline underline-offset-4 hover:text-white">
                            {doc.emailedAt ? 'Poslať znova' : 'Poslať e-mailom'}
                          </button>
                        </ActionForm>
                      ) : null}
                      {canManage ? (
                        <ActionForm action={deleteDocumentAction} confirm="Zmazať doklad? Zákazník ho prestane vidieť v Mojom účte a e-mailom upozornený nebude.">
                          <input type="hidden" name="id" value={doc.id} />
                          <button type="submit" className="min-h-11 text-red-200 underline underline-offset-4 hover:text-red-100">
                            Zmazať
                          </button>
                        </ActionForm>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canManage ? <UploadForm bookingId={bookingId} hasEmail={hasEmail} today={today} /> : null}
    </div>
  )
}

function UploadForm({ bookingId, hasEmail, today }: { bookingId: string; hasEmail: boolean; today: string }) {
  const { state, pending, onSubmit } = useFormAction(createDocumentAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  const [file, setFile] = useState<{ path: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  // After a successful save the form starts over.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset()
      setFile(null)
    }
  }, [state])

  const choose = async (picked: File | undefined) => {
    setFileError(null)
    setFile(null)
    if (!picked) return
    if (picked.type !== 'application/pdf' && !picked.name.toLowerCase().endsWith('.pdf')) return setFileError('Vyberte súbor PDF.')
    if (picked.size > DOCUMENT_MAX_BYTES) return setFileError('Súbor je väčší ako 10 MB.')
    setUploading(true)
    const path = documentPath(bookingId, crypto.randomUUID())
    const { error } = await createClient().storage.from(DOCUMENTS_BUCKET).upload(path, picked, { contentType: 'application/pdf' })
    setUploading(false)
    if (error) return setFileError('Súbor sa nepodarilo nahrať. Skúste to znova.')
    setFile({ path, name: picked.name })
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4 rounded-xl border border-line bg-[#161616] p-4">
      <h3 className="text-base font-bold text-white">Nahrať doklad</h3>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="path" value={file?.path ?? ''} />
      <input type="hidden" name="fileName" value={file?.name ?? ''} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="doc-type">Typ</Label>
          <select id="doc-type" name="type" defaultValue="invoice" className={`${selectClass} h-11 appearance-none bg-no-repeat pr-9`} style={SELECT_CHEVRON_STYLE}>
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS.sk[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="doc-number">Číslo dokladu</Label>
          <Input id="doc-number" name="number" maxLength={60} placeholder="napr. FA2026-0102" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="doc-amount">Suma s DPH (€)</Label>
          <Input id="doc-amount" name="amount" inputMode="decimal" placeholder="nepovinné" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="doc-issued">Dátum vystavenia</Label>
          <DateField id="doc-issued" name="issuedAt" defaultValue={today} className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white" />
        </div>
      </div>
      <label htmlFor="doc-file" className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gold/60 px-4 py-4 text-center text-sm text-muted2 hover:bg-gold/5">
        <span className="font-semibold text-white">{uploading ? 'Nahrávam…' : file ? file.name : 'Vybrať PDF'}</span>
        <span>{file ? 'pripravené – vyplňte údaje a uložte' : 'len PDF do 10 MB'}</span>
        <input id="doc-file" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => void choose(event.target.files?.[0])} />
      </label>
      {fileError ? (
        <p role="alert" className="text-sm text-red-200">
          {fileError}
        </p>
      ) : null}
      <label className="flex min-h-11 items-center gap-3 text-sm text-white">
        <input type="checkbox" name="notify" defaultChecked={hasEmail} disabled={!hasEmail} className="h-5 w-5 accent-[#B88746]" />
        {hasEmail ? 'Poslať zákazníkovi e-mail „Doklad k dispozícii“ s PDF v prílohe' : 'Zákazník nemá e-mail (anonymizovaný) – e-mail sa nepošle'}
      </label>
      <button type="submit" disabled={pending || uploading || !file} className="h-11 rounded-lg bg-gold px-5 text-sm font-semibold text-white transition-colors hover:bg-gold-hover disabled:opacity-50">
        {pending ? 'Ukladám…' : 'Nahrať doklad'}
      </button>
      <Feedback state={state} />
      <p className="text-xs text-muted2">Doklad sa zákazníkovi zobrazí v Mojom účte hneď po uložení. Dobropis zadajte kladnou sumou.</p>
    </form>
  )
}

