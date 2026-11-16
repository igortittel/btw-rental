export const VEHICLE_IMAGES_BUCKET = 'vehicle-images'

/** Public URL of a file in the public `vehicle-images` bucket. */
export function vehicleImageUrl(path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${VEHICLE_IMAGES_BUCKET}/${encoded}`
}
