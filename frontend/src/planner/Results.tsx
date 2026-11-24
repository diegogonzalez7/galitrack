import { ArrowUpRight, Clock3, FlaskConical, Mountain, Repeat2 } from 'lucide-react'
import { useId } from 'react'
import { formatDuration, formatKm, SURFACES, type Route } from './model'
import { routeColor } from './routeColor'

function ElevationProfile({ route }: { route: Route }) {
  const titleId = useId()
  const fillId = useId()
  const heights = route.elevation_profile.map((sample) => sample.elevation_m)
  const peak = Math.ceil(Math.max(...heights) / 20) * 20
  const width = 296
  const height = 100
  const left = 34
  const right = 284
  const top = 12
  const bottom = 76
  const points = route.elevation_profile.map(({ distance_km, elevation_m }) => ({
    x: left + distance_km / route.distance_km * (right - left),
    y: bottom - elevation_m / peak * (bottom - top),
  }))
  const path = points.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')
  const color = routeColor(route.id)

  return (
    <div className="profile-card">
      <div className="profile-heading">
        <div><h3>Perfil de elevación</h3><p>{route.name} · Simulado</p></div>
        <span className="profile-icon"><Mountain size={19} /></span>
      </div>
      <svg className="profile-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{`Perfil simulado de ${route.name}: ${route.ascent_m} metros de ascenso acumulado`}</title>
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop stopColor={color} stopOpacity=".24" />
            <stop offset="1" stopColor={color} stopOpacity=".04" />
          </linearGradient>
        </defs>
        {[peak, peak / 2, 0].map((tick, index) => {
          const y = top + (bottom - top) * index / 2
          return <g key={tick}><line x1={left} x2={right} y1={y} y2={y} stroke="#e3e6df" strokeDasharray={index === 2 ? undefined : '3 4'} /><text x={left - 6} y={y + 3} textAnchor="end">{tick} m</text></g>
        })}
        <path d={`${path} L ${right} ${bottom} L ${left} ${bottom} Z`} fill={`url(#${fillId})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round" />
        <text x={left} y="94">0 km</text>
        <text x={(left + right) / 2} y="94" textAnchor="middle">{formatKm(route.distance_km / 2)} km</text>
        <text x={right} y="94" textAnchor="end">{formatKm(route.distance_km)} km</text>
      </svg>
    </div>
  )
}

interface Props {
  routes: Route[]
  selected: Route | undefined
  onSelect: (id: string) => void
  loading: boolean
  stale: boolean
  error: string | null
}

export function Results({ routes, selected, onSelect, loading, stale, error }: Props) {
  return (
    <section className="results-section" aria-labelledby="results-heading" aria-busy={loading}>
      <div className="results-heading">
        <div>
          <h2 id="results-heading">Rutas propuestas <span>{routes.length}</span></h2>
          <p>Los trazados y desniveles son simulados. No los uses para navegar.</p>
        </div>
        <span className="demo-label"><FlaskConical size={15} /> Datos de demostración</span>
      </div>
      <div aria-live="polite" role="status">
        {stale && !loading && <p className="result-message">Genera rutas para aplicar los cambios.</p>}
        {loading && !routes.length && <p className="result-message">Cargando rutas de demostración…</p>}
      </div>
      {error && <p className="result-message error-message" role="alert">{error}</p>}
      <div className="results-grid">
        {routes.map((route) => (
          <button
            className="route-card"
            type="button"
            key={route.id}
            aria-pressed={route.id === selected?.id}
            onClick={() => onSelect(route.id)}
          >
            <span className="route-card-heading">
              <span className="route-icon" style={{ color: routeColor(route.id) }}><Repeat2 size={21} /></span>
              <span className="route-card-title"><strong>{route.name}</strong><small>Circular · {SURFACES[route.surface]}</small></span>
              <ArrowUpRight className="route-arrow" size={18} aria-hidden="true" />
            </span>
            <span className="route-metrics">
              <span><strong>{formatKm(route.distance_km)} km</strong><small>Distancia</small></span>
              <span><strong>+{route.ascent_m} m</strong><small><Mountain size={12} /> Desnivel</small></span>
              <span><strong>{formatDuration(route.estimated_seconds)}</strong><small><Clock3 size={12} /> Estimación</small></span>
            </span>
          </button>
        ))}
        {selected && <ElevationProfile route={selected} />}
      </div>
    </section>
  )
}
