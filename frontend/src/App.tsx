import { MapPin, Mountain } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { generateRoutes } from './planner/api'
import { DEFAULTS, type Origin, type Preferences, type Route } from './planner/model'
import { PlannerForm } from './planner/PlannerForm'
import { Results } from './planner/Results'

const RouteMap = lazy(() => import('./map/RouteMap'))
const NO_ROUTES: Route[] = []

export function App() {
  const [preferences, setPreferences] = useState(DEFAULTS)
  const [result, setResult] = useState<{ preferences: Preferences; routes: Route[] } | null>(null)
  const [selectedId, setSelectedId] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusOrigin, setFocusOrigin] = useState<Origin | null>(null)
  const activeRequest = useRef<AbortController | null>(null)

  useEffect(() => () => activeRequest.current?.abort(), [])

  const onOriginChange = useCallback((origin: Origin) => {
    activeRequest.current?.abort()
    setPreferences((current) => ({ ...current, origin }))
    setResult(null)
    setLoading(false)
    setError(null)
  }, [])

  function onCoordinatesChange(origin: Origin) {
    onOriginChange(origin)
    setFocusOrigin(origin)
  }

  async function submit(next: Preferences) {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setPreferences(next)
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const response = await generateRoutes(next, controller.signal)
      if (controller.signal.aborted) return
      setResult({ preferences: next, routes: response.routes })
      setSelectedId(response.routes[0]?.id)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error && !(failure instanceof TypeError)
          ? failure.message
          : 'No se pudo conectar con el planificador. Inténtalo de nuevo.')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  const submitted = result?.preferences
  const stale = submitted !== undefined && (
    preferences.distance_km !== submitted.distance_km
    || preferences.elevation !== submitted.elevation || preferences.surface !== submitted.surface
    || preferences.pace_seconds_per_km !== submitted.pace_seconds_per_km
  )
  const routes = result?.routes ?? NO_ROUTES
  const selected = routes.find((route) => route.id === selectedId)

  return (
    <>
      <header className="app-header">
        <div className="shell flex items-center justify-between">
          <div className="brand"><span><Mountain size={25} strokeWidth={2.4} /></span>galitrack<span className="brand-period">.</span></div>
          <div className="header-location"><MapPin size={15} /> Galicia, España</div>
        </div>
      </header>
      <main className="shell workspace">
        <div className="hero">
          <p className="eyebrow">PLANIFICADOR DE RUNNING</p>
          <h1>Tu próxima ruta empieza aquí.</h1>
          <p>Elige dónde empezar y encuentra circuitos por calles y caminos de Galicia.</p>
        </div>
        <div className="planner-grid">
          <PlannerForm preferences={preferences} onChange={setPreferences} onOriginChange={onCoordinatesChange}
            onSubmit={submit} loading={loading} />
          <Suspense fallback={<div className="map-panel map-placeholder" role="status">Cargando mapa…</div>}>
            <RouteMap origin={preferences.origin} onOriginChange={onOriginChange} routes={routes}
              selectedId={selectedId} focusOrigin={focusOrigin} />
          </Suspense>
        </div>
        <Results routes={routes} selected={selected} onSelect={setSelectedId} loading={loading}
          completed={result !== null} stale={stale} error={error} />
      </main>
    </>
  )
}
