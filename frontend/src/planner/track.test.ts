import { describe, expect, it } from 'vitest'
import type { Route } from './model'
import { measureTrack } from './track'

const route: Route = {
  id: 'example', name: 'Example', distance_km: 6, ascent_m: 60, estimated_seconds: 1800,
  geometry: { type: 'LineString', coordinates: [[-9, 42], [-9, 42], [-9, 42.01], [-9, 42.03], [-9, 42.03]] },
  surface: { paved_pct: 0, unpaved_pct: 0, unknown_pct: 100 },
  elevation_profile: [{ distance_km: 0, elevation_m: -5 }, { distance_km: 6, elevation_m: 25 }],
  instructions: [
    { text: 'Inicio', distance_m: 2000, start_index: 0 },
    { text: 'Gira', distance_m: 4000, start_index: 2 },
    { text: 'Meta', distance_m: 0, start_index: 4 },
  ],
}

describe('route playback', () => {
  it('interpolates position by distance across unequal segments and duplicate vertices', () => {
    const track = measureTrack(route)
    expect(track.at(0).position).toEqual([-9, 42])
    expect(track.at(3).position[1]).toBeCloseTo(42.015, 6)
    expect(track.at(6).position).toEqual([-9, 42.03])
  })

  it('synchronizes the current instruction and altitude with that distance', () => {
    const track = measureTrack(route)
    expect(track.at(0)).toMatchObject({ elevation: -5, instructionIndex: 0 })
    expect(track.instructions[1].distanceKm).toBeCloseTo(2, 6)
    expect(track.at(3)).toMatchObject({ elevation: 10, instructionIndex: 1 })
    expect(track.at(6)).toMatchObject({ elevation: 25, instructionIndex: 2 })
  })

  it('keeps a position when elevation and instructions are unavailable', () => {
    const track = measureTrack({ ...route, elevation_profile: [], instructions: undefined })
    expect(track.at(6)).toEqual({ position: [-9, 42.03], elevation: undefined, instructionIndex: -1 })
  })
})
