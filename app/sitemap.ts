import type { MetadataRoute } from 'next'
import { getCatalog } from '@/lib/catalog'
import { absoluteUrl } from '@/lib/seo'
import { vehiclePath } from '@/lib/vehicle-url'

// Rendered on request (the data itself is cached), so a build never depends on the database.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getCatalog()
  const entry = (path: string, lastModified?: string, priority = 0.7): MetadataRoute.Sitemap[number] => ({
    url: absoluteUrl(path, 'sk'),
    lastModified,
    priority,
    alternates: { languages: { sk: absoluteUrl(path, 'sk'), en: absoluteUrl(path, 'en') } },
  })
  const latest = catalog.vehicles
    .map((v) => v.updatedAt)
    .sort()
    .at(-1)

  return [
    entry('/', latest, 1),
    ...catalog.categories.filter((c) => c.vehicleCount > 0).map((c) => entry(`/${c.slug}`, latest, 0.8)),
    ...catalog.vehicles.map((v) => entry(vehiclePath(v.categorySlug, v.slug, v.vin), v.updatedAt, 0.9)),
  ]
}
