export interface PriceTier {
  min_days: number
  max_days: number
  price_per_day: number
}

export interface ContactInfo {
  customer_type: 'private' | 'business'
  first_name: string
  last_name: string
  company_name: string
  ico: string
  email: string
  phone: string
}

export const DEFAULT_CONTACT_INFO: ContactInfo = {
  customer_type: 'private',
  first_name: '', last_name: '',
  company_name: '', ico: '',
  email: '', phone: '',
}

export type VehicleCategory = 'first_class' | 'business_class' | 'business_van'

export const CATEGORY_LABELS: Record<VehicleCategory, string> = {
  first_class:    'First Class',
  business_class: 'Business Class',
  business_van:   'Business Van',
}

export interface Vehicle {
  id: string
  name: string
  vin: string
  plate: string
  year: number
  brand: string
  model: string
  engine: string
  transmission: 'automatic' | 'manual'
  fuel: 'petrol' | 'diesel' | 'electric' | 'hybrid'
  seats_count: number
  category: VehicleCategory
  description_json: { comfort: string[]; tech: string[]; services: string[] }
  image_urls: string[]
  daily_price: number
  price_tiers_json: PriceTier[]
  is_available: boolean
  created_at: string
}

export type BookingStatus = 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled'

export interface Booking {
  id: string
  booking_number: string
  user_id: string | null
  vehicle_id: string
  pickup_datetime: string
  dropoff_datetime: string
  status: BookingStatus
  pickup_location: string
  dropoff_location: string
  total_price: number
  addon_services_json: AddonService[]
  contact_info_json: ContactInfo
  notes?: string
  km_driven?: number
  cancellation_fee: number
  document_urls: string[]
  created_at: string
  vehicle?: Vehicle
  profiles?: Profile
}

export interface AddonService {
  id: string
  name: string
  name_sk: string
  price: number
  selected: boolean
}

export interface Profile {
  id: string
  full_name: string
  company_name?: string
  vat_number?: string
  phone?: string
  total_bookings_count: number
}

export interface Maintenance {
  id: string
  vehicle_id: string
  type: string   // free text — predefined or custom
  expiration_date: string
  created_at: string
  vehicle?: Vehicle
}

export const ADDON_SERVICES: AddonService[] = [
  { id: 'child_seat',    name: 'Child Seat',          name_sk: 'Detská sedačka',  price: 10, selected: false },
  { id: 'booster',       name: 'Booster Cushion',     name_sk: 'Podsedák',        price:  5, selected: false },
  { id: 'roof_box',      name: 'Roof Box',            name_sk: 'Strešný box',     price: 15, selected: false },
  { id: 'ski_rack',      name: 'Ski / Bike Rack',     name_sk: 'Držiak na lyže',  price: 10, selected: false },
  { id: 'fridge',        name: 'Car Fridge',          name_sk: 'Autochladnička',  price:  8, selected: false },
  { id: 'second_driver', name: 'Second Driver',       name_sk: 'Druhý šofér',     price: 20, selected: false },
  { id: 'wifi',          name: 'Mobile WiFi Hotspot', name_sk: 'WiFi Hotspot',    price: 10, selected: false },
]

export const MAINTENANCE_PREDEFINED = ['STK', 'PZP', 'KASKO', 'SERVICE', 'TOLL', 'TIRES']

export const MAINTENANCE_LABELS: Record<string, string> = {
  STK:     'Road-worthiness (STK)',
  PZP:     'Liability Insurance (PZP)',
  KASKO:   'Comprehensive (KASKO)',
  SERVICE: 'Scheduled Service',
  TOLL:    'Motorway Vignette',
  TIRES:   'Tire Change',
}

export function getMaintenanceLabel(type: string): string {
  return MAINTENANCE_LABELS[type] ?? type
}

export const CANCELLATION_POLICY = [
  { min_days_before: 7,  fee_pct: 0,   label: '7+ days before pickup — full refund' },
  { min_days_before: 3,  fee_pct: 25,  label: '3–7 days before pickup — 25% fee' },
  { min_days_before: 1,  fee_pct: 50,  label: '1–3 days before pickup — 50% fee' },
  { min_days_before: 0,  fee_pct: 100, label: 'Less than 24 h — no refund' },
]

export const ASSISTANCE_CONTACTS = {
  emergency: '+420 800 123 456',
  email:     'support@bythwave.com',
  whatsapp:  '+420 777 123 456',
  hours:     '24 / 7',
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  active:    'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['active', 'cancelled'],
  active:    ['completed'],
  completed: [],
  cancelled: [],
}
