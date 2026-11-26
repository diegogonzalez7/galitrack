import type { Preferences, RoutesResponse } from './model'

export async function generateRoutes(preferences: Preferences, signal: AbortSignal): Promise<RoutesResponse> {
  const response = await fetch('/api/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
    signal,
  })
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    if (typeof problem?.detail === 'string') throw new Error(problem.detail)
    throw new Error(response.status === 422
      ? 'Revisa las preferencias e inténtalo de nuevo.'
      : 'No se pudieron generar las rutas. Inténtalo de nuevo.')
  }
  return response.json()
}
