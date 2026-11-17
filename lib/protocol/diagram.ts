import type { DamageView } from '@/lib/protocol/model'

/**
 * Line drawings of the vehicle for the damage diagram, as plain data so that the browser
 * (SVG) and the PDF renderer draw exactly the same picture. Every view lives in a
 * 300 × 130 box; damage positions are stored as percent of that box.
 */
export const DIAGRAM_WIDTH = 300
export const DIAGRAM_HEIGHT = 130

export type DiagramShape =
  | { t: 'path'; d: string }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx: number }

const SIDE: DiagramShape[] = [
  { t: 'path', d: 'M20 98 L20 90 Q20 78 40 74 L85 66 Q110 40 140 38 L190 38 Q215 40 235 62 L268 70 Q282 74 282 92 L282 98 L258 98 A22 22 0 0 0 214 98 L98 98 A22 22 0 0 0 54 98 Z' },
  { t: 'circle', cx: 76, cy: 98, r: 17 },
  { t: 'circle', cx: 236, cy: 98, r: 17 },
  { t: 'circle', cx: 76, cy: 98, r: 7 },
  { t: 'circle', cx: 236, cy: 98, r: 7 },
  { t: 'path', d: 'M100 64 Q118 46 140 45 L160 45 L160 64 Z' },
  { t: 'path', d: 'M166 45 L188 45 Q205 47 220 64 L166 64 Z' },
  { t: 'path', d: 'M163 64 L163 97 M108 66 L104 97 M222 66 L212 80 M172 74 L182 74 M118 74 L128 74 M22 84 L32 84 M272 80 L280 80' },
]

const TOP: DiagramShape[] = [
  { t: 'rect', x: 18, y: 27, w: 264, h: 76, rx: 26 },
  { t: 'path', d: 'M92 36 Q82 65 92 94 L114 88 Q109 65 114 42 Z' },
  { t: 'path', d: 'M218 42 Q224 65 218 88 L236 94 Q244 65 236 36 Z' },
  { t: 'path', d: 'M114 42 L218 42 M114 88 L218 88 M166 42 L166 88 M100 30 L96 22 L106 22 L108 28 M100 100 L96 108 L106 108 L108 102 M22 48 Q28 65 22 82 M278 48 Q272 65 278 82' },
]

// Front and rear are drawn in a 160-wide box and centred with `dx`.
const BODY: DiagramShape[] = [
  { t: 'path', d: 'M12 100 L12 66 Q14 54 28 50 L42 20 Q46 12 58 12 L102 12 Q114 12 118 20 L132 50 Q146 54 148 66 L148 100 Z' },
  { t: 'path', d: 'M48 22 L112 22 L124 48 L36 48 Z' },
  { t: 'path', d: 'M14 100 L14 112 L38 112 L38 100 M122 100 L122 112 L146 112 L146 100 M4 46 L18 46 M142 46 L156 46' },
]
const FRONT: DiagramShape[] = [
  ...BODY,
  { t: 'rect', x: 56, y: 62, w: 48, h: 16, rx: 3 },
  { t: 'ellipse', cx: 32, cy: 68, rx: 12, ry: 7 },
  { t: 'ellipse', cx: 128, cy: 68, rx: 12, ry: 7 },
  { t: 'path', d: 'M20 88 L140 88 M64 70 L96 70' },
]
const REAR: DiagramShape[] = [
  ...BODY,
  { t: 'rect', x: 18, y: 60, w: 26, h: 10, rx: 3 },
  { t: 'rect', x: 116, y: 60, w: 26, h: 10, rx: 3 },
  { t: 'rect', x: 60, y: 76, w: 40, h: 12, rx: 1 },
  { t: 'path', d: 'M44 65 L116 65 M20 92 L140 92' },
]

export const DIAGRAMS: Record<DamageView, { shapes: DiagramShape[]; transform?: string }> = {
  left: { shapes: SIDE },
  right: { shapes: SIDE, transform: `translate(${DIAGRAM_WIDTH} 0) scale(-1 1)` },
  top: { shapes: TOP },
  front: { shapes: FRONT, transform: 'translate(70 4)' },
  rear: { shapes: REAR, transform: 'translate(70 4)' },
}
