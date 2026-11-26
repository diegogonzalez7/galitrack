import type { components } from './api-schema'

export type Origin = components['schemas']['Origin']
export type Preferences = components['schemas']['GenerateRoutesRequest']
export type Route = components['schemas']['RoutedCircuit']
export type RoutesResponse = components['schemas']['RoutesResponse']

export const GALICIA_BOUNDS = {
  west: -9.55,
  south: 41.75,
  east: -6.55,
  north: 43.85,
} as const

export const DEFAULTS: Preferences = {
  // Acceso sur del Puente de los Tirantes, junto al Lérez.
  origin: { latitude: 42.4337, longitude: -8.6361 },
  distance_km: 10,
  elevation: 'rolling',
  surface: 'mixed',
  pace_seconds_per_km: 330,
  route_count: 2,
  avoid_traffic_signals: false,
  avoid_city_center: false,
  avoid_stairs: false,
}

export const SURFACES: Record<Preferences['surface'], string> = {
  asphalt: 'Asfalto',
  mixed: 'Mixta',
  trail: 'Tierra',
}

const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

export function formatKm(value: number) {
  return decimal.format(value)
}

export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`
}

export function formatOrigin({ latitude, longitude }: Origin) {
  return `${Math.abs(latitude).toFixed(4)}° N, ${Math.abs(longitude).toFixed(4)}° O`
}

export function withinGalicia({ latitude, longitude }: Origin) {
  return longitude >= GALICIA_BOUNDS.west && longitude <= GALICIA_BOUNDS.east
    && latitude >= GALICIA_BOUNDS.south && latitude <= GALICIA_BOUNDS.north
}

export function parsePace(value: string) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  const seconds = Number(match[1]) * 60 + Number(match[2])
  return seconds >= 120 && seconds <= 1200 ? seconds : null
}

export function formatPace(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
