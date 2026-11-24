import { describe, expect, it } from 'vitest'
import { formatDuration, formatOrigin, formatPace, parsePace, withinGalicia } from './model'

describe('running pace', () => {
  it.each([['2:00', 120], ['5:30', 330], [' 6:05 ', 365], ['20:00', 1200]])(
    'parses %s into %i seconds per kilometre',
    (pace, seconds) => expect(parsePace(pace)).toBe(seconds),
  )
  it.each(['5.5', '1:59', '5:60', '20:01', '5:3', ''])('rejects %s', (pace) => {
    expect(parsePace(pace)).toBeNull()
  })
  it('formats pace and rounded durations', () => {
    expect(formatPace(365)).toBe('6:05')
    expect(formatDuration(3300)).toBe('55 min')
    expect(formatDuration(3894)).toBe('1 h 5 min')
  })
})

describe('map origin', () => {
  it('accepts Santiago and formats coordinates as north and west', () => {
    const origin = { latitude: 42.8805, longitude: -8.5443 }
    expect(withinGalicia(origin)).toBe(true)
    expect(formatOrigin(origin)).toBe('42.8805° N, 8.5443° O')
  })
  it('rejects out-of-region and invalid positions', () => {
    expect(withinGalicia({ latitude: 42.8, longitude: -2 })).toBe(false)
    expect(withinGalicia({ latitude: NaN, longitude: -8 })).toBe(false)
  })
})
