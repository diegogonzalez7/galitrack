import { Clock3, Mountain } from 'lucide-react'
import { formatDuration, formatKm, type Route } from './model'

export function RouteMetrics({ route }: { route: Route }) {
  return (
    <span className="route-metrics">
      <span><strong>{formatKm(route.distance_km)} km</strong><small>Distancia</small></span>
      <span><strong>{route.ascent_m === null ? '—' : `+${route.ascent_m} m`}</strong><small><Mountain size={12} /> Desnivel</small></span>
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
