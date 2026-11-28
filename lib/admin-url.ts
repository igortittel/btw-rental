/**
 * The staff administration lives on admin.btw.sk (repo btw-admin). Staff links from this
 * web (header, notifications to staff) point there; /admin on this web is a 301 to it.
 */
export const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL?.startsWith('http') ? process.env.NEXT_PUBLIC_ADMIN_URL : 'https://admin.btw.sk').replace(/\/$/, '')

/** Absolute URL of an admin page, e.g. adminUrl('/rezervacie/123'). */
export function adminUrl(path = '/'): string {
  return `${ADMIN_URL}${path.startsWith('/') ? path : `/${path}`}`
}
