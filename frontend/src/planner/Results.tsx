import { ArrowUpRight, Repeat2 } from 'lucide-react'
import type { Route } from './model'
import { routeLink } from './plan'
import { routeColor } from './routeColor'
import { describeSurface, RouteMetrics } from './RouteMetrics'

interface Props {
  routes: Route[]
  planId: string
  loading: boolean
  completed: boolean
  stale: boolean
  error: string | null
}

export function Results({ routes, planId, loading, completed, stale, error }: Props) {
  return (
    <section className="results-section" aria-labelledby="results-heading" aria-busy={loading}>
      <div className="results-heading">
        <div>
          <h2 id="results-heading">Rutas propuestas <span>{routes.length}</span></h2>
          <p>{routes.length ? 'Circuitos peatonales de OpenRouteService.' : 'Elige un origen y genera circuitos por la red peatonal.'}</p>
        </div>
      </div>
      <div aria-live="polite" role="status">
        {stale && !loading && <p className="result-message">Genera rutas para aplicar los cambios.</p>}
        {loading && <p className="result-message">Buscando circuitos peatonales…</p>}
        {completed && !routes.length && (
          <p className="result-message">No encontramos un circuito próximo a la distancia indicada. Prueba otra distancia o mueve el origen a una calle o camino.</p>
        )}
      </div>
      {error && <p className="result-message error-message" role="alert">{error}</p>}
      <div className="results-grid">
        {routes.map((route) => (
          <a className="route-card" key={route.id} href={routeLink(planId, route.id)}>
            <span className="route-card-heading">
              <span className="route-icon" style={{ color: routeColor(route.id) }}><Repeat2 size={21} /></span>
              <span className="route-card-title"><strong>{route.name}</strong><small>{describeSurface(route.surface)}</small></span>
              <ArrowUpRight className="route-arrow" size={18} aria-hidden="true" />
            </span>
            <RouteMetrics route={route} />
          </a>
        ))}
      </div>
    </section>
  )
}
