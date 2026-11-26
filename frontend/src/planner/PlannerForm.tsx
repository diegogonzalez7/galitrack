import { ArrowRight, ChevronDown, CircleDot, Footprints, ListOrdered, MapPin, Mountain, Route, Timer } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatKm, formatOrigin, formatPace, parsePace, SURFACES, withinGalicia, type Origin, type Preferences } from './model'

const ELEVATIONS = { flat: 'Llano', rolling: 'Ondulado', hilly: 'Exigente' } as const
const ASCENT_HINTS = {
  flat: 'Hasta 3 m de ascenso por km',
  rolling: 'Más de 3 y hasta 15 m de ascenso por km',
  hilly: 'Más de 15 m de ascenso por km',
}
const ROUTE_OPTIONS = [
  ['avoid_traffic_signals', 'Evitar semáforos'],
  ['avoid_city_center', 'Evitar el centro urbano'],
  ['avoid_stairs', 'Evitar escaleras'],
] as const

interface Props {
  preferences: Preferences
  onChange: (preferences: Preferences) => void
  onOriginChange: (origin: Origin) => void
  onSubmit: (preferences: Preferences) => void
  loading: boolean
}

function OriginEditor({ origin, onChange }: { origin: Origin; onChange: (origin: Origin) => void }) {
  const [latitude, setLatitude] = useState(String(origin.latitude))
  const [longitude, setLongitude] = useState(String(origin.longitude))
  const [message, setMessage] = useState('')
  const disclosure = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    setLatitude(String(origin.latitude))
    setLongitude(String(origin.longitude))
    setMessage('')
  }, [origin])

  function apply() {
    const next = {
      latitude: Number(latitude.trim().replace(',', '.')),
      longitude: Number(longitude.trim().replace(',', '.')),
    }
    if (!withinGalicia(next)) {
      setMessage('Introduce una latitud entre 41,75 y 43,85 y una longitud entre −9,55 y −6,55.')
      return
    }
    onChange(next)
    if (disclosure.current) {
      disclosure.current.open = false
      disclosure.current.querySelector('summary')?.focus()
    }
  }

  return (
    <details className="origin-editor" ref={disclosure}>
      <summary>
        <MapPin size={18} />
        <span><strong>Punto de partida</strong><span data-testid="origin" aria-live="polite">{formatOrigin(origin)}</span></span>
        <ChevronDown className="origin-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="coordinate-fields">
        <label>Latitud<input value={latitude} onChange={(event) => setLatitude(event.target.value)} inputMode="decimal" /></label>
        <label>Longitud<input value={longitude} onChange={(event) => setLongitude(event.target.value)} inputMode="decimal" /></label>
        <button type="button" onClick={apply}>Usar coordenadas</button>
        {message && <p role="alert" className="field-error">{message}</p>}
      </div>
    </details>
  )
}

function Segmented<T extends string>({ title, Icon, name, options, value, onChange, hint }: {
  title: string
  Icon: typeof Mountain
  name: string
  options: Record<T, string>
  value: T
  onChange: (value: T) => void
  hint?: string
}) {
  return (
    <fieldset className="field" aria-describedby={hint ? `${name}-hint` : undefined}>
      <legend><Icon size={16} /> {title}</legend>
      <div className="segments">
        {(Object.keys(options) as T[]).map((option) => (
          <label className="segment" key={option}>
            <input className="sr-only" type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            <span>{options[option]}</span>
          </label>
        ))}
      </div>
      {hint && <p className="field-hint" id={`${name}-hint`}>{hint}</p>}
    </fieldset>
  )
}

export function PlannerForm({ preferences, onChange, onOriginChange, onSubmit, loading }: Props) {
  const [pace, setPace] = useState(formatPace(preferences.pace_seconds_per_km))
  const [paceError, setPaceError] = useState(false)
  const paceInput = useRef<HTMLInputElement>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const seconds = parsePace(pace)
    if (seconds === null) {
      setPaceError(true)
      paceInput.current?.focus()
      return
    }
    setPace(formatPace(seconds))
    onSubmit({ ...preferences, pace_seconds_per_km: seconds })
  }

  return (
    <form aria-labelledby="planner-heading" className="planner-card" onSubmit={submit}>
      <div className="planner-heading">
        <span className="section-icon"><Route size={20} /></span>
        <div><h2 id="planner-heading">Configura tu ruta</h2><p>Tu punto de partida y tus preferencias.</p></div>
      </div>

      <OriginEditor origin={preferences.origin} onChange={onOriginChange} />

      <div className="field distance-field">
        <div className="range-heading">
          <label htmlFor="distance"><CircleDot size={16} /> Distancia objetivo</label>
          <output htmlFor="distance">{formatKm(preferences.distance_km)} km</output>
        </div>
        <input
          id="distance" type="range" min="2" max="30" step=".5"
          value={preferences.distance_km}
          aria-valuetext={`${formatKm(preferences.distance_km)} kilómetros`}
          style={{ background: `linear-gradient(to right, var(--lime) ${(preferences.distance_km - 2) / 28 * 100}%, var(--line) 0)` }}
          onChange={(event) => onChange({ ...preferences, distance_km: Number(event.target.value) })}
        />
        <div className="range-scale" aria-hidden="true"><span>2 km</span><span>30 km</span></div>
      </div>

      <Segmented title="Desnivel" Icon={Mountain} name="elevation" options={ELEVATIONS} value={preferences.elevation}
        onChange={(elevation) => onChange({ ...preferences, elevation })} hint={ASCENT_HINTS[preferences.elevation]} />
      <Segmented title="Superficie" Icon={Footprints} name="surface" options={SURFACES} value={preferences.surface}
        onChange={(surface) => onChange({ ...preferences, surface })} />

      <div className="pace-field">
        <label htmlFor="pace"><Timer size={16} /> Ritmo estimado</label>
        <div className="pace-input">
          <input
            ref={paceInput} id="pace" type="text" maxLength={5} value={pace}
            aria-describedby={paceError ? 'pace-error' : 'pace-unit'} aria-invalid={paceError}
            onChange={(event) => {
              const nextPace = event.target.value
              setPace(nextPace)
              setPaceError(false)
              const seconds = parsePace(nextPace)
              if (seconds !== null) onChange({ ...preferences, pace_seconds_per_km: seconds })
            }}
          />
          <span id="pace-unit">min/km</span>
        </div>
        {paceError && <p id="pace-error" className="field-error" role="alert">Usa minutos:segundos, entre 2:00 y 20:00.</p>}
      </div>

      <div className="route-count-field">
        <label htmlFor="route-count"><ListOrdered size={16} /> Número de rutas</label>
        <select id="route-count" value={preferences.route_count}
          onChange={(event) => onChange({ ...preferences, route_count: Number(event.target.value) })}>
          {[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
      </div>

      <fieldset className="field route-avoidance">
        <legend>Preferencias del recorrido</legend>
        {ROUTE_OPTIONS.map(([key, label]) => (
          <label key={key}>
            <input type="checkbox" checked={preferences[key]}
              onChange={(event) => onChange({ ...preferences, [key]: event.target.checked })} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      <button className="generate-button" type="submit" disabled={loading}>
        {loading ? 'Calculando…' : 'Generar rutas'} <ArrowRight size={18} aria-hidden="true" />
      </button>
    </form>
  )
}
