/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer <Image> has no alt attribute (PDF, not HTML) */
import { Circle, Defs, Document, Ellipse, Font, G, Image, LinearGradient, Page, Path, Rect, Stop, StyleSheet, Svg, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { LOGO_PATHS, LOGO_VIEWBOX, MONTSERRAT_BASE64 } from '@/lib/pdf/assets.generated'
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, DIAGRAMS } from '@/lib/protocol/diagram'
import { DAMAGE_KIND_LABEL, DAMAGE_VIEW_LABEL, DAMAGE_VIEWS, PROTOCOL_TITLE, type DamageView, type ProtocolType } from '@/lib/protocol/model'

/** Everything printed in the protocol, already formatted. Built by lib/protocol/pdf-data.ts. */
export type ProtocolPdfData = {
  type: ProtocolType
  bookingNumber: string
  version: number
  /** Version this document replaces (corrections only). */
  supersedesVersion: number | null
  company: { name: string; address: string; ids: string[] }
  customer: { name: string; lines: string[] }
  vehicle: { name: string; plate: string | null; vin: string }
  term: string
  /** Rows of the state table: label, value at pickup, value at return (return protocol only), difference. */
  state: { label: string; pickup?: string; value: string; diff?: string }[]
  accessories: { label: string; present: boolean; missing: boolean }[]
  damages: { no: number; view: DamageView; x: number; y: number; kind: string; description: string; isNew: boolean }[]
  photos: { label: string; image: PdfImage }[]
  damagePhotos: { no: number; image: PdfImage }[]
  note: string | null
  kmLimitPerDay: number
  extraKmPrice: string
  signedAt: string
  customerName: string
  staffName: string
  customerSignature: PdfImage | null
  staffSignature: PdfImage | null
}
export type PdfImage = { data: Buffer; format: 'jpg' | 'png' }

const GOLD = '#B88746'
const GOLD_DARK = '#8a6532'
const INK = '#151515'
const MUTED = '#666666'
const LINE = '#d9d2c5'
const RED = '#c62f3b'

let fontsRegistered = false
function registerFonts() {
  if (fontsRegistered) return
  Font.register({
    family: 'Montserrat',
    fonts: ([400, 600, 700] as const).map((fontWeight) => ({ src: `data:font/ttf;base64,${MONTSERRAT_BASE64[fontWeight]}`, fontWeight })),
  })
  // Slovak text must not be hyphenated by the built-in English rules.
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

const s = StyleSheet.create({
  page: { fontFamily: 'Montserrat', fontSize: 8.5, color: INK, lineHeight: 1.4, paddingTop: 92, paddingBottom: 44, paddingHorizontal: 34 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 74,
    backgroundColor: '#111111',
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 34,
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  brandName: { color: GOLD, fontSize: 13, fontWeight: 700, letterSpacing: 2.6 },
  brandSub: { color: '#bbbbbb', fontSize: 6.5, letterSpacing: 1.2, marginTop: 2 },
  docTitle: { color: '#ffffff', fontSize: 13, fontWeight: 600, letterSpacing: 1, textAlign: 'right' },
  docSub: { color: '#bbbbbb', fontSize: 7.5, textAlign: 'right', marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 34,
    right: 34,
    borderTopWidth: 0.75,
    borderTopColor: GOLD,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6.5,
    color: MUTED,
  },
  section: { marginBottom: 14 },
  h: { fontSize: 7, fontWeight: 700, letterSpacing: 1.3, color: GOLD_DARK, textTransform: 'uppercase', borderBottomWidth: 0.75, borderBottomColor: GOLD, paddingBottom: 3, marginBottom: 6 },
  cols: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  bold: { fontWeight: 600 },
  muted: { color: MUTED },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  th: { fontSize: 6.5, fontWeight: 600, letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase', paddingVertical: 3, paddingHorizontal: 4 },
  td: { paddingVertical: 4, paddingHorizontal: 4 },
  acc: { flexDirection: 'row', flexWrap: 'wrap' },
  accItem: { width: '50%', flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  box: { width: 7, height: 7, borderWidth: 0.75, borderColor: GOLD_DARK, marginRight: 5, alignItems: 'center', justifyContent: 'center' },
  diagrams: { flexDirection: 'row', gap: 6 },
  diagram: { width: 100.5, borderWidth: 0.5, borderColor: LINE },
  diagramLabel: { fontSize: 6.5, color: MUTED, textAlign: 'center', paddingBottom: 2 },
  mark: {
    position: 'absolute',
    width: 11,
    height: 11,
    marginLeft: -5.5,
    marginTop: -5.5,
    borderRadius: 5.5,
    borderWidth: 0.75,
    borderColor: '#333333',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markNew: { backgroundColor: RED, borderColor: RED },
  markText: { fontSize: 6, fontWeight: 700, lineHeight: 1 },
  tag: { fontSize: 6.5, fontWeight: 700, letterSpacing: 0.5, color: RED },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photo: { width: 126.5, height: 95, backgroundColor: '#222222' },
  photoCap: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#000000', opacity: 0.75, color: '#ffffff', fontSize: 6.5, paddingHorizontal: 4, paddingVertical: 2 },
  signs: { flexDirection: 'row', gap: 40, marginTop: 18 },
  signBox: { height: 62, borderBottomWidth: 0.75, borderBottomColor: '#333333', alignItems: 'center', justifyContent: 'flex-end' },
})

function Logo({ size }: { size: number }) {
  return (
    <Svg viewBox={LOGO_VIEWBOX} style={{ width: size * (1000 / 901), height: size }}>
      <Defs>
        <LinearGradient id="g" x1="466.973" y1="0" x2="466.973" y2="643.902" gradientUnits="userSpaceOnUse">
          <Stop offset="0.48" stopColor={GOLD} />
          <Stop offset="1" stopColor="#FDF5A6" />
        </LinearGradient>
      </Defs>
      {LOGO_PATHS.map((path, index) => (
        <Path key={index} d={path.d} fill={path.gradient ? 'url(#g)' : '#FDF5A6'} />
      ))}
    </Svg>
  )
}

function Diagram({ view, damages }: { view: DamageView; damages: ProtocolPdfData['damages'] }) {
  const { shapes, transform } = DIAGRAMS[view]
  const stroke = { stroke: '#555555', strokeWidth: 1.6, fill: 'none', strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  return (
    <View style={s.diagram}>
      <View style={{ position: 'relative' }}>
        <Svg viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}>
          <G transform={transform}>
            {shapes.map((shape, index) =>
              shape.t === 'path' ? (
                <Path key={index} d={shape.d} {...stroke} />
              ) : shape.t === 'circle' ? (
                <Circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} {...stroke} />
              ) : shape.t === 'ellipse' ? (
                <Ellipse key={index} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...stroke} />
              ) : (
                <Rect key={index} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} ry={shape.rx} {...stroke} />
              ),
            )}
          </G>
        </Svg>
        {damages
          .filter((damage) => damage.view === view)
          .map((damage) => (
            <View key={damage.no} style={[s.mark, damage.isNew ? s.markNew : {}, { left: `${damage.x}%`, top: `${damage.y}%` }]}>
              <Text style={[s.markText, damage.isNew ? { color: '#ffffff' } : {}]}>{damage.no}</Text>
            </View>
          ))}
      </View>
      <Text style={s.diagramLabel}>{DAMAGE_VIEW_LABEL[view]}</Text>
    </View>
  )
}

export function ProtocolDocument({ data }: { data: ProtocolPdfData }) {
  const isReturn = data.type === 'return'
  const title = PROTOCOL_TITLE[data.type].toUpperCase()
  const widths = isReturn ? ['22%', '26%', '26%', '26%'] : ['30%', '70%']
  return (
    <Document title={`${PROTOCOL_TITLE[data.type]} ${data.bookingNumber}`} author={data.company.name} language="sk">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View style={s.brand}>
            <Logo size={40} />
            <View style={{ marginLeft: 12 }}>
              <Text style={s.brandName}>BY THE WAVE</Text>
              <Text style={s.brandSub}>RENTAL · rental.btw.sk</Text>
            </View>
          </View>
          <View>
            <Text style={s.docTitle}>{title}</Text>
            <Text style={s.docSub}>
              {data.bookingNumber} · verzia {data.version}
              {data.supersedesVersion ? ` (nahrádza verziu ${data.supersedesVersion})` : ''}
            </Text>
          </View>
        </View>
        <View style={s.footer} fixed>
          <Text>{[data.company.name, data.company.address].join(' · ')}</Text>
          <Text>Podpísané elektronicky {data.signedAt} · dokument je nemenný</Text>
          <Text render={({ pageNumber, totalPages }) => `strana ${pageNumber} / ${totalPages}`} />
        </View>

        <View style={[s.section, s.cols]}>
          <View style={s.col}>
            <Text style={s.h}>Prenajímateľ</Text>
            <Text style={s.bold}>{data.company.name}</Text>
            <Text>{data.company.address}</Text>
            {data.company.ids.map((line) => (
              <Text key={line} style={s.muted}>
                {line}
              </Text>
            ))}
            <Text style={s.muted}>zastúpený: {data.staffName}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.h}>Nájomca</Text>
            <Text style={s.bold}>{data.customer.name}</Text>
            {data.customer.lines.map((line) => (
              <Text key={line} style={s.muted}>
                {line}
              </Text>
            ))}
          </View>
          <View style={s.col}>
            <Text style={s.h}>Vozidlo</Text>
            <Text style={s.bold}>{data.vehicle.name}</Text>
            {data.vehicle.plate ? <Text>EČV: {data.vehicle.plate}</Text> : null}
            <Text style={s.muted}>VIN: {data.vehicle.vin}</Text>
            <Text style={s.muted}>Prenájom: {data.term}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h}>{isReturn ? 'Prevzatie vozidla od nájomcu' : 'Odovzdanie vozidla nájomcovi'}</Text>
          <View style={s.tr}>
            <Text style={[s.th, { width: widths[0] }]}> </Text>
            {isReturn ? (
              <>
                <Text style={[s.th, { width: widths[1] }]}>Pri odovzdaní</Text>
                <Text style={[s.th, { width: widths[2] }]}>Pri prevzatí</Text>
                <Text style={[s.th, { width: widths[3] }]}>Rozdiel</Text>
              </>
            ) : (
              <Text style={[s.th, { width: widths[1] }]}>Stav</Text>
            )}
          </View>
          {data.state.map((row) => (
            <View key={row.label} style={s.tr} wrap={false}>
              <Text style={[s.td, s.muted, { width: widths[0] }]}>{row.label}</Text>
              {isReturn ? (
                <>
                  <Text style={[s.td, { width: widths[1] }]}>{row.pickup ?? '—'}</Text>
                  <Text style={[s.td, s.bold, { width: widths[2] }]}>{row.value}</Text>
                  <Text style={[s.td, { width: widths[3] }]}>{row.diff ?? ''}</Text>
                </>
              ) : (
                <Text style={[s.td, s.bold, { width: widths[1] }]}>{row.value}</Text>
              )}
            </View>
          ))}
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h}>Príslušenstvo</Text>
          <View style={s.acc}>
            {data.accessories.map((item) => (
              <View key={item.label} style={s.accItem}>
                <View style={[s.box, item.missing ? { borderColor: RED } : {}]}>{item.present ? <View style={{ width: 3.5, height: 3.5, backgroundColor: GOLD_DARK }} /> : null}</View>
                <Text style={item.missing ? { color: RED, fontWeight: 600 } : {}}>
                  {item.label}
                  {item.missing ? ' – nevrátené' : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h}>Poškodenia{isReturn ? ' – porovnanie s odovzdávacím protokolom' : ''}</Text>
          <View style={s.diagrams}>
            {DAMAGE_VIEWS.map((view) => (
              <Diagram key={view.key} view={view.key} damages={data.damages} />
            ))}
          </View>
        </View>
        <View style={s.section}>
          <View style={s.tr}>
            <Text style={[s.th, { width: '7%' }]}>Č.</Text>
            <Text style={[s.th, { width: '16%' }]}>Pohľad</Text>
            <Text style={[s.th, { width: '17%' }]}>Druh</Text>
            <Text style={[s.th, { width: isReturn ? '45%' : '60%' }]}>Popis</Text>
            {isReturn ? <Text style={[s.th, { width: '15%' }]}>Stav</Text> : null}
          </View>
          {data.damages.length === 0 ? (
            <View style={s.tr}>
              <Text style={s.td}>Bez poškodení.</Text>
            </View>
          ) : (
            data.damages.map((damage) => (
              <View key={damage.no} style={[s.tr, damage.isNew ? { backgroundColor: '#fdeeee' } : {}]} wrap={false}>
                <Text style={[s.td, s.bold, { width: '7%' }]}>{damage.no}</Text>
                <Text style={[s.td, { width: '16%' }]}>{DAMAGE_VIEW_LABEL[damage.view]}</Text>
                <Text style={[s.td, { width: '17%' }]}>{DAMAGE_KIND_LABEL[damage.kind] ?? damage.kind}</Text>
                <Text style={[s.td, { width: isReturn ? '45%' : '60%' }]}>{damage.description || '—'}</Text>
                {isReturn ? <View style={[s.td, { width: '15%' }]}>{damage.isNew ? <Text style={s.tag}>NOVÉ</Text> : <Text style={s.muted}>pôvodné</Text>}</View> : null}
              </View>
            ))
          )}
        </View>

        {data.photos.length > 0 ? (
          <View style={s.section} break>
            <Text style={s.h}>Fotodokumentácia ({data.photos.length})</Text>
            <View style={s.photos}>
              {data.photos.map((photo, index) => (
                <View key={index} style={s.photo} wrap={false}>
                  <Image src={photo.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <Text style={s.photoCap}>{photo.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {data.damagePhotos.length > 0 ? (
          <View style={s.section}>
            <Text style={s.h}>Detaily poškodení</Text>
            <View style={s.photos}>
              {data.damagePhotos.map((photo) => (
                <View key={photo.no} style={s.photo} wrap={false}>
                  <Image src={photo.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <Text style={s.photoCap}>Poškodenie č. {photo.no}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={s.section} wrap={false}>
          <Text style={s.h}>Poznámka</Text>
          <Text>{data.note || 'Bez poznámky.'}</Text>
        </View>

        <View wrap={false}>
          <Text style={s.h}>Vyhlásenie</Text>
          <Text>
            {isReturn
              ? 'Nájomca vrátil vozidlo v stave uvedenom v tomto protokole. Poškodenia označené ako NOVÉ neboli zaznamenané pri odovzdaní vozidla. Vyúčtovanie (kilometre nad limit, palivo, poškodenia, meškanie) dostane nájomca samostatne po jeho potvrdení prenajímateľom.'
              : `Nájomca prevzal vozidlo v stave uvedenom v tomto protokole, vrátane príslušenstva a zaznamenaných poškodení, a bol oboznámený s limitom ${data.kmLimitPerDay} km na deň a cenou ${data.extraKmPrice} za každý kilometer nad limit.`}
          </Text>
          <View style={s.signs}>
            {(
              [
                [data.customerSignature, data.customerName, 'nájomca'],
                [data.staffSignature, data.staffName, 'za prenajímateľa'],
              ] as const
            ).map(([signature, name, role]) => (
              <View key={role} style={s.col}>
                <View style={s.signBox}>{signature ? <Image src={signature} style={{ maxHeight: 58, maxWidth: '100%', objectFit: 'contain' }} /> : null}</View>
                <Text style={[s.bold, { marginTop: 4 }]}>{name}</Text>
                <Text style={s.muted}>
                  {role} · {data.signedAt}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  )
}

/** Renders the protocol to a PDF file. */
export async function renderProtocolPdf(data: ProtocolPdfData): Promise<Buffer> {
  registerFonts()
  return renderToBuffer(<ProtocolDocument data={data} />)
}
