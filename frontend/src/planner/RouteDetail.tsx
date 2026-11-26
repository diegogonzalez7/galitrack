import { ArrowLeft, Navigation, Pause, Play, RotateCcw } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ElevationProfile } from './ElevationProfile'
import { formatKm, type Route } from './model'
import { describeSurface, RouteMetrics } from './RouteMetrics'
import { measureTrack } from './track'

const RouteMap = lazy(() => import('../map/RouteMap'))
const PLAYBACK_MS = 45_000

function Instructions({ instructions, active, onSeek }: {
  instructions: ReturnType<typeof measureTrack>['instructions']
  active: number
  onSeek: (distance: number) => void
}) {
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const element = list.current
    const step = element?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!element || !step) return
    if (step.offsetTop < element.scrollTop || step.offsetTop + step.offsetHeight > element.scrollTop + element.clientHeight) {
      element.scrollTop = step.offsetTop
    }
  }, [active])

  return (
    <section className="detail-card" aria-labelledby="instructions-heading">
      <div className="detail-card-heading">
        <Navigation size={17} />
        <h2 id="instructions-heading">Indicaciones</h2>
      </div>
      {instructions.length ? (
        <ol className="route-instructions" ref={list}>
          {instructions.map((step, index) => (
            <li key={index}>
              <button type="button" aria-current={index === active ? 'step' : undefined}
                onClick={() => onSeek(step.distanceKm)}>
                <span>{step.text}</span>
                <small>{formatKm(step.distanceKm)} km</small>
              </button>
            </li>
          ))}
        </ol>
      ) : <p>Las indicaciones de giro no están disponibles para este circuito.</p>}
    </section>
  )
}

export function RouteDetail({ route }: { route: Route }) {
  const [distance, setDistance] = useState(0)
  const [playing, setPlaying] = useState(false)
  const currentDistance = useRef(0)
  const track = useMemo(() => measureTrack(route), [route])
  const routes = useMemo(() => [route], [route])
  const [longitude, latitude] = route.geometry.coordinates[0]
  const origin = useMemo(() => ({ longitude, latitude }), [longitude, latitude])
  const { position, elevation, instructionIndex } = track.at(distance)

  useEffect(() => {
    if (!playing) return
    const initialDistance = currentDistance.current
    let started: number | undefined
    let lastRender = 0
    let frame = 0

    function advance(now: number) {
      started ??= now
      const next = Math.min(route.distance_km, initialDistance + (now - started) * route.distance_km / PLAYBACK_MS)
      if (now - lastRender >= 32 || next === route.distance_km) {
        setDistance(next)
        currentDistance.current = next
        lastRender = now
      }
      if (next < route.distance_km) frame = requestAnimationFrame(advance)
      else setPlaying(false)
    }

    frame = requestAnimationFrame(advance)
    return () => cancelAnimationFrame(frame)
  }, [playing, route.distance_km])

  function seek(next: number) {
    currentDistance.current = next
    setDistance(next)
    setPlaying(false)
  }

  function togglePlayback() {
    if (!playing && currentDistance.current === route.distance_km) seek(0)
    setPlaying(!playing)
  }

  return (
    <>
      <a className="planner-back" href="#/"><ArrowLeft size={17} /> Volver al planificador</a>
      <div className="hero detail-hero">
        <h1 tabIndex={-1}>{route.name}</h1>
      </div>
      <div className="route-detail-grid">
        <div className="route-detail-track">
          <Suspense fallback={<div className="map-panel map-placeholder" role="status">Cargando mapa…</div>}>
            <RouteMap origin={origin} routes={routes} selectedId={route.id} playbackPosition={position} />
          </Suspense>
          <section className="detail-card route-playback" aria-labelledby="playback-heading">
            <div className="playback-top">
              <div>
                <h2 id="playback-heading">Recorrido</h2>
                <p><strong>{formatKm(distance)} km</strong> de {formatKm(route.distance_km)} km</p>
              </div>
              <div className="playback-actions">
                <button className="playback-play" type="button" onClick={togglePlayback}>
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                  {playing ? 'Pausar' : 'Reproducir'}
                </button>
                <button className="playback-reset" type="button" onClick={() => seek(0)}
                  aria-label="Volver al inicio del recorrido" title="Volver al inicio"><RotateCcw size={17} /></button>
              </div>
            </div>
            <input
              className="playback-range" type="range" min="0" max={Math.round(route.distance_km * 1000)} step="1"
              value={Math.round(distance * 1000)} onChange={(event) => seek(Number(event.target.value) / 1000)}
              aria-label="Progreso del recorrido" aria-valuetext={`${formatKm(distance)} de ${formatKm(route.distance_km)} kilómetros`}
            />
            <ElevationProfile route={route} distance={distance} elevation={elevation} />
          </section>
        </div>
        <aside className="route-detail-side" aria-label="Información del circuito">
          <section className="detail-card" aria-labelledby="data-heading">
            <h2 id="data-heading">Datos de la ruta</h2>
            <RouteMetrics route={route} />
            <p>{describeSurface(route.surface)}</p>
          </section>
          <Instructions instructions={track.instructions} active={instructionIndex} onSeek={seek} />
        </aside>
      </div>
    </>
  )
}
