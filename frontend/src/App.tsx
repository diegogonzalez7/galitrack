import { MapPin, Mountain } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { previewRoutes } from './planner/api'
import { DEFAULTS, type Origin, type Preferences, type Route } from './planner/model'
import { PlannerForm } from './planner/PlannerForm'
import { Results } from './planner/Results'

const RouteMap = lazy(() => import('./map/RouteMap'))

export function App() {
  const [preferences, setPreferences] = useState(DEFAULTS)
  const [submitted, setSubmitted] = useState(DEFAULTS)
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fitOnUpdate, setFitOnUpdate] = useState(false)
  const activeRequest = useRef<AbortController | null>(null)

  const loadRoutes = useCallback(async (next: Preferences, fit: boolean) => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setLoading(true)
    setError(null)
    try {
      const preview = await previewRoutes(next, controller.signal)
      if (controller.signal.aborted) return
      setFitOnUpdate(fit)
      setSubmitted(next)
      setRoutes(preview.routes)
      setSelectedId(preview.routes[0]?.id)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error && !(failure instanceof TypeError)
          ? failure.message
          : 'No se pudo conectar con el planificador. Inténtalo de nuevo.')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRoutes(DEFAULTS, false)
    return () => activeRequest.current?.abort()
  }, [loadRoutes])

  const onOriginChange = useCallback((origin: Origin) => {
    setPreferences((current) => ({ ...current, origin }))
  }, [])

  function submit(next: Preferences) {
    setPreferences(next)
    void loadRoutes(next, true)
  }

  const stale = preferences.distance_km !== submitted.distance_km
    || preferences.elevation !== submitted.elevation || preferences.surface !== submitted.surface
    || preferences.pace_seconds_per_km !== submitted.pace_seconds_per_km
    || preferences.origin.latitude !== submitted.origin.latitude
    || preferences.origin.longitude !== submitted.origin.longitude
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
          <p>Elige un punto en Galicia y explora rutas circulares según tus preferencias.</p>
        </div>
        <div className="planner-grid">
          <PlannerForm preferences={preferences} onChange={setPreferences} onSubmit={submit} loading={loading} />
          <Suspense fallback={<div className="map-panel map-placeholder" role="status">Cargando mapa…</div>}>
            <RouteMap origin={preferences.origin} onOriginChange={onOriginChange} routes={routes}
              selectedId={selectedId} fitOnUpdate={fitOnUpdate} />
          </Suspense>
        </div>
        <Results routes={routes} selected={selected} onSelect={setSelectedId} loading={loading} stale={stale} error={error} />
      </main>
    </>
  )
}
