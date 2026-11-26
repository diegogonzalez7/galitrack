import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Crosshair, Maximize2, Minus, Plus } from 'lucide-react'
import { AttributionControl, LngLatBounds, Map, Marker, ScaleControl, type Point, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { GALICIA_BOUNDS, withinGalicia, type Origin, type Route } from '../planner/model'
import { routeColor } from '../planner/routeColor'
import { addRouteSymbols } from './routeSymbols'
import { DETAILED_STYLE_URL, regionalMapStyle, ROUTE_FINISH_LAYER, ROUTE_HIGHLIGHT_LAYERS, ROUTE_LINE_LAYER, withRoutes } from './style'

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
  onOriginChange?: (origin: Origin) => void
  onRouteOpen?: (id: string) => void
  onRouteHover?: (id: string | undefined) => void
  highlightedId?: string
  routes: Route[]
  selectedId: string | undefined
  focusOrigin?: Origin | null
  playbackPosition?: [number, number]
}

export default function RouteMap({ origin, onOriginChange, onRouteOpen, onRouteHover, highlightedId, routes, selectedId, focusOrigin, playbackPosition }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const initialOrigin = useRef(origin)
  const canOpenRoute = Boolean(onRouteOpen)
  const openRoute = useEffectEvent((id: string) => onRouteOpen?.(id))
  const hoverRoute = useEffectEvent((id: string | undefined) => onRouteHover?.(id))
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
        center: position(initialOrigin.current),
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
      setStatus(onOriginChange
        ? 'Mapa no disponible. Puedes indicar el origen por coordenadas.'
        : 'Mapa no disponible. Puedes consultar el perfil y las indicaciones.')
      return
    }
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new AttributionControl({ compact: false }), 'bottom-right')
    map.addControl(new ScaleControl({ unit: 'metric', maxWidth: 85 }), 'bottom-left')
    const canvas = map.getCanvas()
    canvas.setAttribute('aria-label', onOriginChange
      ? 'Mapa de Galicia. Usa las flechas para desplazarte y los campos de coordenadas para elegir el origen con el teclado.'
      : 'Mapa del circuito. Usa las flechas para desplazarte y el control de progreso para explorar el recorrido.')
    const pin = document.createElement('div')
    pin.className = onOriginChange ? 'map-pin' : 'map-runner'
    pin.setAttribute('aria-hidden', 'true')
    const marker = new Marker({ element: pin }).setLngLat(position(initialOrigin.current)).addTo(map)
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

    map.on('style.load', () => {
      addRouteSymbols(map)
      setStyleVersion((version) => version + 1)
    })
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
      else setStatus('No se pudo cargar la cartografía de respaldo.')
    })
    map.setStyle(DETAILED_STYLE_URL, {
      diff: false,
      transformStyle: (_previous, next) => withRoutes(next),
    })
    function routeAt(point: Point): string | undefined {
      const layers = [ROUTE_FINISH_LAYER, ROUTE_LINE_LAYER].filter((id) => map.getLayer(id))
      if (!layers.length) return
      return map.queryRenderedFeatures([[point.x - 6, point.y - 6], [point.x + 6, point.y + 6]], { layers })
        .find((feature) => typeof feature.properties.routeId === 'string')?.properties.routeId
    }

    if (canOpenRoute) {
      map.on('mousemove', ({ point }) => {
        const id = routeAt(point)
        canvas.style.cursor = id ? 'pointer' : ''
        hoverRoute(id)
      })
      map.on('mouseout', () => {
        canvas.style.cursor = ''
        hoverRoute(undefined)
      })
    }
    map.on('click', ({ lngLat, point }) => {
      if (canOpenRoute) {
        const routeId = routeAt(point)
        if (routeId) {
          openRoute(routeId)
          return
        }
      }
      if (!onOriginChange) return
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
  }, [onOriginChange, canOpenRoute])

  useEffect(() => {
    markerRef.current?.setLngLat(playbackPosition ?? position(origin))
  }, [origin, playbackPosition])

  useEffect(() => {
    const source = mapRef.current?.getSource<GeoJSONSource>('galitrack-routes')
    source?.setData({
      type: 'FeatureCollection',
      features: routes.flatMap((route) => {
        const properties = { routeId: route.id, color: routeColor(route.id), priority: Number(route.id === selectedId) }
        const finish = route.geometry.coordinates[route.geometry.coordinates.length - 1]
        return [
          { type: 'Feature', geometry: route.geometry, properties },
          { type: 'Feature', geometry: { type: 'Point', coordinates: finish }, properties },
        ]
      }),
    })
  }, [styleVersion, routes, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer(ROUTE_HIGHLIGHT_LAYERS[1])) return
    for (const layer of ROUTE_HIGHLIGHT_LAYERS) {
      map.setFilter(layer, ['==', ['get', 'routeId'], highlightedId ?? ''])
    }
    map.setPaintProperty(ROUTE_LINE_LAYER, 'line-opacity', highlightedId ? .6 : 1)
  }, [styleVersion, highlightedId])

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

  function showRoute() {
    mapRef.current?.fitBounds(routeBounds(routes, origin), { padding: 60, maxZoom: 16, duration: 400 })
  }

  function showOrigin() {
    const map = mapRef.current
    if (!map) return
    const zoom = Math.max(map.getZoom(), basemap === 'regional' ? 11 : 15)
    map.easeTo({ center: position(origin), zoom, duration: 360 })
  }

  return (
    <section className="map-panel" aria-label={onOriginChange ? 'Mapa de planificación' : 'Mapa del recorrido'}
      data-basemap={basemap} data-highlighted-route={highlightedId}>
      <div className="map-canvas" ref={container} data-testid="map-canvas" />
      {onOriginChange && (
        <div className="map-instruction">
          <span className="map-instruction-dot" />
          {routes.length ? 'Pulsa un trazado para abrir su recorrido' : 'Haz clic en el mapa para elegir el origen'}
        </div>
      )}
      <div className="map-tools">
        <div className="map-zoom">
          <button type="button" aria-label="Acercar mapa" title="Acercar" disabled={!ready} onClick={() => mapRef.current?.zoomIn()}><Plus size={18} /></button>
          <button type="button" aria-label="Alejar mapa" title="Alejar" disabled={!ready} onClick={() => mapRef.current?.zoomOut()}><Minus size={18} /></button>
        </div>
        {onOriginChange ? (
          <>
            <button type="button" aria-label="Centrar en el origen" title="Centrar en el origen" disabled={!ready} onClick={showOrigin}><Crosshair size={18} /></button>
            <button type="button" aria-label="Ver toda Galicia" title="Ver toda Galicia" disabled={!ready} onClick={() => mapRef.current?.fitBounds(regionBounds, { padding: 32, duration: 360 })}><Maximize2 size={16} /></button>
          </>
        ) : (
          <button type="button" aria-label="Ver todo el recorrido" title="Ver todo el recorrido" disabled={!ready} onClick={showRoute}><Maximize2 size={16} /></button>
        )}
      </div>
      {(status || basemap === 'regional') && (
        <p className="map-status" role="status">{status || 'Mapa regional de respaldo · Calles y caminos no disponibles'}</p>
      )}
    </section>
  )
}
