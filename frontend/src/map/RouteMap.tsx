import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Crosshair, Maximize2, Minus, Plus } from 'lucide-react'
import { AttributionControl, LngLatBounds, Map, Marker, ScaleControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { DEFAULTS, GALICIA_BOUNDS, withinGalicia, type Origin, type Route } from '../planner/model'
import { routeColor } from '../planner/routeColor'
import { mapStyle } from './style'

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
  fitOnUpdate: boolean
}

export default function RouteMap({ origin, onOriginChange, routes, selectedId, fitOnUpdate }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!container.current) return
    let map: Map
    try {
      map = new Map({
        container: container.current,
        style: mapStyle,
        center: container.current.clientWidth < 520 ? position(DEFAULTS.origin) : [-8.63, 42.867],
        zoom: 9.4,
        minZoom: 5.5,
        maxZoom: 14,
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
    map.on('load', () => setReady(true))
    map.on('error', () => setStatus('No se pudo cargar la cartografía. Puedes indicar el origen por coordenadas.'))
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
    if (!ready) return
    const source = mapRef.current?.getSource<GeoJSONSource>('routes')
    source?.setData({
      type: 'FeatureCollection',
      features: routes.map((route) => ({
        type: 'Feature',
        geometry: route.geometry,
        properties: { color: routeColor(route.id), priority: Number(route.id === selectedId) },
      })),
    })
  }, [ready, routes, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !fitOnUpdate || !routes.length || !map) return
    const [longitude, latitude] = routes[0].geometry.coordinates[0]
    map.fitBounds(routeBounds(routes, { longitude, latitude }), { padding: 88, maxZoom: 11.5, duration: 450 })
  }, [ready, fitOnUpdate, routes])

  function showOrigin() {
    mapRef.current?.easeTo({ center: position(origin), zoom: 10, duration: 360 })
  }

  return (
    <section className="map-panel" aria-label="Mapa de planificación">
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
      {status && <p className="map-status" role="status">{status}</p>}
    </section>
  )
}
