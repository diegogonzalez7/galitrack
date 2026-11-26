import { useId } from 'react'
import { formatKm, type Route } from './model'
import { routeColor } from './routeColor'

export function ElevationProfile({ route, distance, elevation }: {
  route: Route
  distance: number
  elevation: number | undefined
}) {
  const titleId = useId()
  const fillId = useId()
  if (route.elevation_profile.length < 2) {
    return <div className="profile-heading"><h3>Perfil de elevación</h3><p>Altitudes no disponibles para este circuito.</p></div>
  }

  const heights = route.elevation_profile.map((sample) => sample.elevation_m)
  const floor = Math.floor(Math.min(...heights) / 20) * 20
  const peak = Math.max(floor + 20, Math.ceil(Math.max(...heights) / 20) * 20)
  const left = 43
  const right = 484
  const top = 11
  const bottom = 99
  const x = (distanceKm: number) => left + distanceKm / route.distance_km * (right - left)
  const y = (height: number) => bottom - (height - floor) / (peak - floor) * (bottom - top)
  const path = route.elevation_profile.map((sample, index) =>
    `${index ? 'L' : 'M'} ${x(sample.distance_km)} ${y(sample.elevation_m)}`).join(' ')
  const color = routeColor(route.id)
  const cursor = x(distance)

  return (
    <div className="elevation-profile">
      <div className="profile-heading">
        <h3>Perfil de elevación</h3>
        {elevation !== undefined && <p><strong>{Math.round(elevation)} m</strong> de altitud</p>}
      </div>
      <svg className="profile-chart" viewBox="0 0 500 122" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{`Perfil de elevación de ${route.name}`}</title>
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop stopColor={color} stopOpacity=".24" />
            <stop offset="1" stopColor={color} stopOpacity=".04" />
          </linearGradient>
        </defs>
        {[peak, (peak + floor) / 2, floor].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="#e1e7dc" strokeDasharray={tick === floor ? undefined : '3 4'} />
            <text x={left - 7} y={y(tick) + 3} textAnchor="end">{tick} m</text>
          </g>
        ))}
        <path d={`${path} L ${right} ${bottom} L ${left} ${bottom} Z`} fill={`url(#${fillId})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {elevation !== undefined && (
          <g aria-hidden="true">
            <line x1={cursor} x2={cursor} y1={top} y2={bottom} stroke={color} strokeWidth="1" strokeDasharray="3 4" />
            <circle cx={cursor} cy={y(elevation)} r="4.5" fill={color} stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
        <text x={left} y="117">0 km</text>
        <text x={x(route.distance_km / 2)} y="117" textAnchor="middle">{formatKm(route.distance_km / 2)} km</text>
        <text x={right} y="117" textAnchor="end">{formatKm(route.distance_km)} km</text>
      </svg>
    </div>
  )
}
