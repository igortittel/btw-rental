import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, DIAGRAMS } from '@/lib/protocol/diagram'
import { DAMAGE_VIEW_LABEL, type DamageView } from '@/lib/protocol/model'

/** Line drawing of one side of the vehicle; the stroke follows the text colour. */
export function CarDiagram({ view, className }: { view: DamageView; className?: string }) {
  const { shapes, transform } = DIAGRAMS[view]
  return (
    <svg viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`} role="img" aria-label={DAMAGE_VIEW_LABEL[view]} className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
      <g transform={transform}>
        {shapes.map((shape, index) =>
          shape.t === 'path' ? <path key={index} d={shape.d} />
          : shape.t === 'circle' ? <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} />
          : shape.t === 'ellipse' ? <ellipse key={index} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
          : <rect key={index} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} />,
        )}
      </g>
      {view === 'top' ? (
        <g stroke="none" fill="currentColor" fontSize={9}>
          <text x={30} y={122}>predok</text>
          <text x={246} y={122}>zadok</text>
        </g>
      ) : null}
    </svg>
  )
}
