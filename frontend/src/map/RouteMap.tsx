import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Crosshair, Maximize2, Minus, Plus } from 'lucide-react'
import { AttributionControl, LngLatBounds, Map, Marker, ScaleControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { DEFAULTS, GALICIA_BOUNDS, withinGalicia, type Origin, type Route } from '../planner/model'
import { routeColor } from '../planner/routeColor'
import { DETAILED_STYLE_URL, regionalMapStyle, withRoutes } from './style'

// Let Vite resolve and serve the MapLibre module worker in both dev and build.
setWorkerUrl(workerUrl)

const regionBounds = new LngLatBounds(
  [GALICIA_BOUNDS.west, GALICIA_BOUNDS.south],
  [GALICIA_BOUNDS.east, GALICIA_BOUNDS.north],
)

function position(origin: Origin): [number, number] {
  return [origin.longitude, origin.latitude]
}

function routeBounds(routes: Route[], origin: Origin) {
  const bounds = new LngLatBounds(position(origin), position(origin))
  for (const route of routes) {
    for (const point of route.geometry.coordinates) bounds.extend(point)
  }
  return bounds
}

interface Props {
  origin: Origin
  onOriginChange: (origin: Origin) => void
  routes: Route[]
  selectedId: string | undefined
  focusOrigin: Origin | null
}

export default function RouteMap({ origin, onOriginChange, routes, selectedId, focusOrigin }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('')
  const [styleVersion, setStyleVersion] = useState(0)
  const [basemap, setBasemap] = useState<'loading' | 'detailed' | 'regional'>('loading')

  useEffect(() => {
    if (!container.current) return
    let map: Map
    try {
      map = new Map({
        container: container.current,
        center: position(DEFAULTS.origin),
        zoom: 15,
        minZoom: 5.5,
        maxZoom: 19,
        maxBounds: [[-11.5, 39.4], [-4.5, 46.4]],
        attributionControl: false,
        renderWorldCopies: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        doubleClickZoom: false,
      })
    } catch {
      setStatus('Mapa no disponible. Puedes indicar el origen por coordenadas.')
      return
    }
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new AttributionControl({ compact: false }), 'bottom-right')
    map.addControl(new ScaleControl({ unit: 'metric', maxWidth: 85 }), 'bottom-left')
    const canvas = map.getCanvas()
    canvas.setAttribute('aria-label', 'Mapa de Galicia. Usa las flechas para desplazarte y los campos de coordenadas para elegir el origen con el teclado.')
    const pin = document.createElement('div')
    pin.className = 'map-pin'
    pin.setAttribute('aria-hidden', 'true')
    const marker = new Marker({ element: pin }).setLngLat(position(DEFAULTS.origin)).addTo(map)
    markerRef.current = marker
    let disposed = false
    let regional = false
    let detailedLoaded = false
    const timer = window.setTimeout(() => useRegionalMap(), 12_000)

    function useRegionalMap() {
      if (regional || disposed) return
      regional = true
      window.clearTimeout(timer)
      setBasemap('regional')
      // Style errors can be emitted while MapLibre is applying the current style.
      queueMicrotask(() => {
        if (disposed) return
        if (!detailedLoaded) map.jumpTo({ zoom: 9.4 })
        map.setStyle(regionalMapStyle, { diff: false })
      })
    }

    map.on('style.load', () => setStyleVersion((version) => version + 1))
    map.on('idle', () => {
      setReady(true)
      if (!regional && !detailedLoaded) {
        detailedLoaded = true
        window.clearTimeout(timer)
        setBasemap('detailed')
      }
    })
    map.on('error', () => {
      if (!regional) useRegionalMap()
      else setStatus('No se pudo cargar la cartografía de respaldo. Puedes usar las coordenadas.')
    })
    map.setStyle(DETAILED_STYLE_URL, {
      diff: false,
      transformStyle: (_previous, next) => withRoutes(next),
    })
    map.on('click', ({ lngLat }) => {
      const next = { longitude: Number(lngLat.lng.toFixed(5)), latitude: Number(lngLat.lat.toFixed(5)) }
      if (!withinGalicia(next)) {
        setStatus('Elige un punto dentro de Galicia y su entorno.')
        return
      }
      setStatus('')
      onOriginChange(next)
    })
    return () => {
      disposed = true
      window.clearTimeout(timer)
      marker.remove()
      map.remove()
      markerRef.current = null
      mapRef.current = null
    }
  }, [onOriginChange])

  useEffect(() => {
    markerRef.current?.setLngLat(position(origin))
  }, [origin])

  useEffect(() => {
    const source = mapRef.current?.getSource<GeoJSONSource>('galitrack-routes')
    source?.setData({
      type: 'FeatureCollection',
      features: routes.map((route) => ({
        type: 'Feature',
        geometry: route.geometry,
        properties: { color: routeColor(route.id), priority: Number(route.id === selectedId) },
      })),
    })
  }, [styleVersion, routes, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !routes.length || !map) return
    const [longitude, latitude] = routes[0].geometry.coordinates[0]
    map.fitBounds(routeBounds(routes, { longitude, latitude }), { padding: 88, maxZoom: 16, duration: 450 })
  }, [ready, routes])

  useEffect(() => {
    if (ready && focusOrigin) {
      mapRef.current?.easeTo({ center: position(focusOrigin), zoom: basemap === 'regional' ? 11 : 15, duration: 360 })
    }
  }, [ready, focusOrigin, basemap])

  function showOrigin() {
    const map = mapRef.current
    if (!map) return
    const zoom = Math.max(map.getZoom(), basemap === 'regional' ? 11 : 15)
    map.easeTo({ center: position(origin), zoom, duration: 360 })
  }

  return (
    <section className="map-panel" aria-label="Mapa de planificación" data-basemap={basemap}>
      <div className="map-canvas" ref={container} data-testid="map-canvas" />
      <div className="map-instruction"><span className="map-instruction-dot" /> Haz clic en el mapa para elegir el origen</div>
      <div className="map-tools">
        <div className="map-zoom">
          <button type="button" aria-label="Acercar mapa" title="Acercar" disabled={!ready} onClick={() => mapRef.current?.zoomIn()}><Plus size={18} /></button>
          <button type="button" aria-label="Alejar mapa" title="Alejar" disabled={!ready} onClick={() => mapRef.current?.zoomOut()}><Minus size={18} /></button>
        </div>
        <button type="button" aria-label="Centrar en el origen" title="Centrar en el origen" disabled={!ready} onClick={showOrigin}><Crosshair size={18} /></button>
        <button type="button" aria-label="Ver toda Galicia" title="Ver toda Galicia" disabled={!ready} onClick={() => mapRef.current?.fitBounds(regionBounds, { padding: 32, duration: 360 })}><Maximize2 size={16} /></button>
      </div>
      {(status || basemap === 'regional') && (
        <p className="map-status" role="status">{status || 'Mapa regional de respaldo · Calles y caminos no disponibles'}</p>
      )}
    </section>
  )
}
