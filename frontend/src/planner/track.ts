import type { Route } from './model'

type Position = Route['geometry']['coordinates'][number]

function segmentKm([lonA, latA]: Position, [lonB, latB]: Position): number {
  const rad = Math.PI / 180
  const a = Math.sin((latB - latA) * rad / 2) ** 2
    + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin((lonB - lonA) * rad / 2) ** 2
  return 12_742.0176 * Math.asin(Math.sqrt(Math.min(1, a)))
}

function nextSample(samples: number[], distance: number) {
  let low = 0
  let high = samples.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (samples[middle] <= distance) low = middle + 1
    else high = middle
  }
  return low
}

export function measureTrack(route: Route) {
  const positions = route.geometry.coordinates
  let total = 0
  const vertices = positions.map((point, index) => {
    if (index) total += segmentKm(positions[index - 1], point)
    return total
  })
  const distances = vertices.map((distance) => total ? distance / total * route.distance_km : 0)
  const elevations = route.elevation_profile.map((sample) => sample.distance_km)
  const heights = route.elevation_profile.map((sample) => sample.elevation_m)
  const instructions = (route.instructions ?? [])
    .filter((step) => step.start_index < distances.length)
    .map((step) => ({ ...step, distanceKm: distances[step.start_index] }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
  const turns = instructions.map((step) => step.distanceKm)

  return {
    instructions,
    at(distance: number) {
      const position = interpolate(distances, positions, distance, ([x, y], [nx, ny], fraction): Position =>
        [x + (nx - x) * fraction, y + (ny - y) * fraction]) ?? positions[0]
      const elevation = interpolate(elevations, heights, distance,
        (a, b, fraction) => a + (b - a) * fraction)
      const instructionIndex = nextSample(turns, distance) - 1
      return { position, elevation, instructionIndex }
    },
  }
}

function interpolate<T>(
  distances: number[],
  values: T[],
  distance: number,
  blend: (a: T, b: T, fraction: number) => T,
): T | undefined {
  const next = nextSample(distances, distance)
  if (next === 0) return values[0]
  if (next === distances.length) return values[next - 1]
  const previous = next - 1
  const fraction = (distance - distances[previous]) / (distances[next] - distances[previous])
  return blend(values[previous], values[next], fraction)
}
