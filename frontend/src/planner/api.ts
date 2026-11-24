import type { Preferences, Preview } from './model'

export async function previewRoutes(preferences: Preferences, signal: AbortSignal): Promise<Preview> {
  const response = await fetch('/api/routes/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
    signal,
  })
  if (!response.ok) {
    throw new Error(response.status === 422
      ? 'Revisa las preferencias e inténtalo de nuevo.'
      : 'No se pudieron generar las rutas. Inténtalo de nuevo.')
  }
  return response.json()
}
