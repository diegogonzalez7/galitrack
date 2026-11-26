import { Clock3, Mountain } from 'lucide-react'
import { formatDuration, formatKm, type Route } from './model'

export function RouteMetrics({ route }: { route: Route }) {
  return (
    <span className="route-metrics">
      <span><strong>{formatKm(route.distance_km)} km</strong><small>Distancia</small></span>
      <span>
        <strong>{route.ascent_m === null ? '—' : `+${route.ascent_m} m`}</strong>
        <small><Mountain size={12} /> {route.ascent_m === null ? 'Desnivel' : `${formatKm(Math.round(route.ascent_m / route.distance_km * 10) / 10)} m/km`}</small>
      </span>
      <span><strong>{formatDuration(route.estimated_seconds)}</strong><small><Clock3 size={12} /> Estimación</small></span>
    </span>
  )
}

export function describeSurface(surface: Route['surface']) {
  if (surface.unknown_pct === 100) return 'Superficie sin datos'
  const parts = []
  if (surface.paved_pct) parts.push(`${surface.paved_pct} % pavimentada`)
  if (surface.unpaved_pct) parts.push(`${surface.unpaved_pct} % sin pavimentar`)
  if (surface.unknown_pct) parts.push(`${surface.unknown_pct} % sin clasificar`)
  return parts.join(' · ')
}


export function RouteContext({ route }: { route: Route }) {
  return (
    <>
      {route.traffic_signals != null && <span>{route.traffic_signals} {route.traffic_signals === 1 ? 'semáforo cercano' : 'semáforos cercanos'}</span>}
      {route.urban_center_pct != null && <span>{route.urban_center_pct} % por el centro urbano</span>}
      {route.elevation_match === false && <span className="grade-mismatch">Fuera del desnivel elegido</span>}
    </>
  )
}
