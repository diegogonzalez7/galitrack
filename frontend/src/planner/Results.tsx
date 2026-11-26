import { ArrowUpRight, Repeat2 } from 'lucide-react'
import type { Route } from './model'
import { routeLink } from './plan'
import { routeColor } from './routeColor'
import { describeSurface, RouteContext, RouteMetrics } from './RouteMetrics'

interface Props {
  routes: Route[]
  planId: string
  requested: number
  warnings: string[]
  highlightedId: string | undefined
  onHighlight: (id: string | undefined) => void
  loading: boolean
  completed: boolean
  stale: boolean
  error: string | null
}

export function Results({ routes, planId, requested, warnings, highlightedId, onHighlight, loading, completed, stale, error }: Props) {
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
        {routes.length > 0 && routes.length < requested && (
          <p className="result-message">Encontramos {routes.length} de {requested} rutas distintas cerca de la distancia indicada.</p>
        )}
        {routes.length > 0 && routes.every((route) => route.elevation_match === false) && (
          <p className="result-message">Ningún circuito encontrado encaja en el desnivel elegido. Las rutas se muestran por proximidad al rango.</p>
        )}
        {warnings.map((warning) => <p className="result-message" key={warning}>{warning}</p>)}
        {completed && !routes.length && (
          <p className="result-message">No encontramos un circuito próximo a la distancia indicada. Prueba otra distancia o mueve el origen a una calle o camino.</p>
        )}
      </div>
      {error && <p className="result-message error-message" role="alert">{error}</p>}
      <div className="results-grid">
        {routes.map((route) => (
          <a className="route-card" key={route.id} href={routeLink(planId, route.id)}
            data-highlighted={route.id === highlightedId}
            onMouseEnter={() => onHighlight(route.id)} onMouseLeave={() => onHighlight(undefined)}
            onFocus={() => onHighlight(route.id)} onBlur={() => onHighlight(undefined)}>
            <span className="route-card-heading">
              <span className="route-icon" style={{ color: routeColor(route.id) }}><Repeat2 size={21} /></span>
              <span className="route-card-title"><strong>{route.name}</strong><small>{describeSurface(route.surface)}</small></span>
              <ArrowUpRight className="route-arrow" size={18} aria-hidden="true" />
            </span>
            <RouteMetrics route={route} />
            <span className="route-context"><RouteContext route={route} /></span>
          </a>
        ))}
      </div>
    </section>
  )
}
