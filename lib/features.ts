import type { Database } from '@/types/database'

export type FeatureGroup = Database['public']['Enums']['feature_group']

/** Equipment groups in display order (vehicle detail, admin). */
export const FEATURE_GROUPS: FeatureGroup[] = ['comfort', 'technical', 'safety', 'included']

export const FEATURE_GROUP_LABELS: Record<FeatureGroup, string> = {
  comfort: 'Komfort',
  technical: 'Technické',
  safety: 'Bezpečnosť',
  included: 'V cene prenájmu',
}
