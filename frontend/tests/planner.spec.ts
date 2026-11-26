import { expect, test } from '@playwright/test'
import type { StyleSpecification } from 'maplibre-gl'
import type { Preferences, Route, RoutesResponse } from '../src/planner/model'

const styleUrl = 'https://tiles.openfreemap.org/styles/liberty'
const detailedStyle: StyleSpecification = {
  version: 8,
  sources: {
    streets: {
      type: 'geojson',
      attribution: 'OpenStreetMap',
      data: {
        type: 'Feature',
        properties: { name: 'Avenida de Bos Aires' },
        geometry: { type: 'LineString', coordinates: [[-8.642, 42.4345], [-8.6361, 42.4337]] },
      },
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#eaf0e2' } },
    { id: 'street', type: 'line', source: 'streets', paint: { 'line-color': '#807a65', 'line-width': 4 } },
    {
      id: 'street-names', type: 'symbol', source: 'streets',
      layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Arial Regular'] },
    },
  ],
}

function answer(preferences: Preferences): RoutesResponse {
  const { origin: { longitude, latitude }, distance_km, pace_seconds_per_km } = preferences
  const loop: Route['geometry']['coordinates'] = [
    [longitude, latitude], [longitude + .009, latitude],
    [longitude + .009, latitude + .006], [longitude, latitude + .006], [longitude, latitude],
  ]
  const first: Route = {
    id: 'ors-1', name: 'Circuito 1', distance_km, ascent_m: 80,
    estimated_seconds: Math.round(distance_km * pace_seconds_per_km),
    geometry: { type: 'LineString', coordinates: loop },
    elevation_profile: [
      { distance_km: 0, elevation_m: 25 },
      { distance_km: distance_km / 2, elevation_m: 63 },
      { distance_km, elevation_m: 25 },
    ],
    surface: { paved_pct: 60, unpaved_pct: 30, unknown_pct: 10 },
    instructions: [
      { text: 'Comienza por el paseo del Lérez', distance_m: 300, start_index: 0 },
      { text: 'Gira a la izquierda hacia el puente', distance_m: 450, start_index: 1 },
      { text: 'Has llegado a la meta', distance_m: 0, start_index: 4 },
    ],
  }
  return {
    source: 'openrouteservice',
    routes: [first, {
      ...first,
      id: 'ors-2', name: 'Circuito 2',
      geometry: { type: 'LineString', coordinates: loop.map(([x, y]) => [2 * longitude - x, y]) },
    }],
  }
}

test('abre, reproduce y recupera el detalle de una ruta', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(styleUrl, (route) => route.fulfill({ json: detailedStyle }))
  await page.route('**/api/routes', (route) => route.fulfill({ json: answer(route.request().postDataJSON()) }))
  await page.goto('/')

  const map = page.getByRole('region', { name: 'Mapa de planificación' })
  await expect(map).toHaveAttribute('data-basemap', 'detailed')
  await expect(page.getByText('OpenStreetMap', { exact: true })).toBeVisible()
  await expect(page.getByTestId('origin')).toHaveText('42.4337° N, 8.6361° O')
  const canvas = page.getByTestId('map-canvas').locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  await expect(canvas).toBeInViewport()
  expect((await canvas.boundingBox())?.height).toBeGreaterThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(testInfo.project.use.viewport?.width)

  await expect(page.getByRole('link', { name: /Circuito [12]/ })).toHaveCount(0)
  const request = page.waitForRequest((request) => request.url().endsWith('/api/routes') && request.method() === 'POST')
  await page.getByRole('button', { name: 'Generar rutas' }).click()
  expect((await request).postDataJSON().origin).toEqual({ latitude: 42.4337, longitude: -8.6361 })
  await expect(page.getByRole('link', { name: /Circuito 1/ })).toContainText('10 % sin clasificar')
  await expect(page.getByRole('img', { name: /Perfil de elevación/ })).toHaveCount(0)
  await page.getByRole('link', { name: /Circuito 2/ }).click()
  await expect(page).toHaveURL(/#\/rutas\/[^/]+\/ors-2$/)
  await expect(page.getByRole('heading', { name: 'Circuito 2' })).toBeFocused()
  await expect(page.getByRole('img', { name: 'Perfil de elevación de Circuito 2' })).toBeVisible()

  const slider = page.getByRole('slider', { name: 'Progreso del recorrido' })
  await expect(slider).toHaveValue('0')
  await page.getByRole('button', { name: 'Reproducir', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible()
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Pausar' }).click()

  const movingPoint = page.locator('.map-runner')
  await expect(page.getByRole('button', { name: 'Ver todo el recorrido' })).toBeEnabled()
  const markerPosition = await movingPoint.getAttribute('style')
  await slider.fill('5000')
  await expect(page.getByText('63 m', { exact: true })).toBeVisible()
  await expect(movingPoint).not.toHaveAttribute('style', markerPosition ?? '')
  const turn = page.getByRole('button', { name: /Gira a la izquierda/ })
  await expect(turn).toHaveAttribute('aria-current', 'step')
  await page.getByRole('button', { name: /Has llegado a la meta/ }).click()
  await expect(slider).toHaveValue('10000')
  await page.getByRole('button', { name: 'Volver al inicio del recorrido' }).click()
  await expect(slider).toHaveValue('0')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Circuito 2' })).toBeVisible()
  await page.getByRole('link', { name: 'Volver al planificador' }).click()
  await expect(page.getByRole('link', { name: /Circuito 2/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('el respaldo regional conserva la selección del mapa y limpia las rutas al cambiar el origen', async ({ page }) => {
  await page.route(styleUrl, (route) => route.fulfill({ status: 503 }))
  await page.route('**/api/routes', (route) => route.fulfill({ json: answer(route.request().postDataJSON()) }))
  await page.goto('/')
  await expect(page.getByText('Mapa regional de respaldo · Calles y caminos no disponibles')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Acercar mapa' })).toBeEnabled()
  await page.getByRole('button', { name: 'Generar rutas' }).click()
  await expect(page.getByRole('link', { name: /Circuito 1/ })).toBeVisible()
  const origin = page.getByTestId('origin')
  const original = await origin.textContent()
  await page.getByTestId('map-canvas').locator('canvas').click({ position: { x: 20, y: 145 } })
  await expect(origin).not.toHaveText(original ?? '')
  await expect(page.getByRole('link', { name: /Circuito 1/ })).toHaveCount(0)

  await page.getByRole('slider', { name: 'Distancia objetivo' }).fill('12')
  await page.getByText('Exigente', { exact: true }).click()
  await page.getByText('Tierra', { exact: true }).click()
  await page.getByLabel('Ritmo estimado').fill('6:00')
  const request = page.waitForRequest((request) => request.url().endsWith('/api/routes') && request.method() === 'POST')
  await page.getByRole('button', { name: 'Generar rutas' }).click()
  expect((await request).postDataJSON()).toMatchObject({
    distance_km: 12, surface: 'trail', elevation: 'hilly', pace_seconds_per_km: 360,
  })
  await expect(page.getByRole('link', { name: /Circuito 1/ })).toContainText('1 h 12 min')
})

test('un error de configuración o un origen sin circuito no dibujan rutas sintéticas', async ({ page }) => {
  await page.route(styleUrl, (route) => route.abort())
  let configured = false
  await page.route('**/api/routes', (route) => configured
    ? route.fulfill({ json: { source: 'openrouteservice', routes: [] } })
    : route.fulfill({ status: 503, json: { detail: 'Configura ORS_API_KEY en el servidor para generar rutas reales.' } }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Generar rutas' }).click()
  await expect(page.getByRole('alert')).toContainText('Configura ORS_API_KEY')
  await expect(page.getByRole('link', { name: /Circuito 1/ })).toHaveCount(0)
  configured = true

  await page.locator('summary').filter({ hasText: 'Punto de partida' }).press('Enter')
  await page.getByLabel('Latitud', { exact: true }).fill('42,4331')
  await page.getByLabel('Longitud', { exact: true }).fill('-8,6441')
  await page.getByRole('button', { name: 'Usar coordenadas' }).press('Enter')
  await expect(page.getByTestId('origin')).toContainText('42.4331° N, 8.6441° O')
  await page.getByLabel('Ritmo estimado').fill('0:00')
  await page.getByRole('button', { name: 'Generar rutas' }).press('Enter')
  await expect(page.getByLabel('Ritmo estimado')).toBeFocused()
  await expect(page.getByText('Usa minutos:segundos, entre 2:00 y 20:00.')).toBeVisible()
  await page.getByLabel('Ritmo estimado').fill('5:00')
  const request = page.waitForRequest((request) => request.url().endsWith('/api/routes') && request.method() === 'POST')
  await page.getByRole('button', { name: 'Generar rutas' }).press('Enter')
  expect((await request).postDataJSON().origin).toEqual({ latitude: 42.4331, longitude: -8.6441 })
  await expect(page.getByText(/No encontramos un circuito/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Circuito 1/ })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})


test('abre una ruta al pulsar su trazado en el mapa', async ({ page }) => {
  await page.route(styleUrl, (route) => route.fulfill({ json: detailedStyle }))
  await page.route('**/api/routes', (route) => route.fulfill({ json: answer(route.request().postDataJSON()) }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Acercar mapa' })).toBeEnabled()
  await page.getByRole('button', { name: 'Generar rutas' }).click()
  await expect(page.getByRole('link', { name: /Circuito 1/ })).toBeVisible()

  const canvas = page.getByTestId('map-canvas').locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  const marker = page.locator('.map-pin')
  const pointOnRoute = async () => {
    const box = await marker.boundingBox()
    if (!box) throw new Error('No se encontró el marcador de inicio')
    return { x: box.x + box.width / 2 + 30, y: box.y + box.height / 2 }
  }
  // Both fixture loops start at the marker. The eastbound line belongs to circuit 1.
  await expect.poll(async () => {
    const { x, y } = await pointOnRoute()
    await page.mouse.move(x, y)
    return canvas.evaluate((element) => getComputedStyle(element).cursor)
  }).toBe('pointer')

  const map = page.getByRole('region', { name: 'Mapa de planificación' })
  await expect(map).toHaveAttribute('data-highlighted-route', 'ors-1')
  await expect(page.getByRole('link', { name: /Circuito 1/ })).toHaveAttribute('data-highlighted', 'true')
  const { x, y } = await pointOnRoute()
  await page.mouse.click(x, y)
  await expect(page.getByRole('heading', { name: 'Circuito 1' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('link', { name: /Circuito 2/ })).toBeVisible()
})


test('envía el número de alternativas y las preferencias de recorrido', async ({ page }) => {
  await page.route(styleUrl, (route) => route.fulfill({ json: detailedStyle }))
  await page.route('**/api/routes', (route) => {
    const preferences: Preferences = route.request().postDataJSON()
    const response = answer(preferences)
    const base = response.routes[0]
    const routes = Array.from({ length: preferences.route_count - 1 }, (_, index) => ({
      ...base, id: `ors-${index + 1}`, name: `Circuito ${index + 1}`, ascent_m: 20,
      elevation_match: index === 0, traffic_signals: 0, urban_center_pct: 4,
    }))
    return route.fulfill({ json: { ...response, routes } })
  })
  await page.goto('/')
  await page.getByLabel('Número de rutas').selectOption('4')
  await page.getByText('Llano', { exact: true }).click()
  await expect(page.getByText('Hasta 3 m de ascenso por km')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Evitar semáforos' }).check()
  await page.getByRole('checkbox', { name: 'Evitar el centro urbano' }).check()
  await page.getByRole('checkbox', { name: 'Evitar escaleras' }).check()
  const request = page.waitForRequest((request) => request.url().endsWith('/api/routes') && request.method() === 'POST')
  await page.getByRole('button', { name: 'Generar rutas' }).click()
  expect((await request).postDataJSON()).toMatchObject({
    route_count: 4, elevation: 'flat', avoid_traffic_signals: true, avoid_city_center: true, avoid_stairs: true,
  })
  await expect(page.getByText('Encontramos 3 de 4 rutas distintas')).toBeVisible()
  const first = page.getByRole('link', { name: /Circuito 1/ })
  await expect(first).toContainText('2 m/km')
  await expect(first).toContainText('0 semáforos cercanos')
  await expect(first).toContainText('4 % por el centro urbano')
  await expect(page.getByRole('link', { name: /Circuito 2/ })).toContainText('Fuera del desnivel elegido')
  await first.focus()
  await expect(page.getByRole('region', { name: 'Mapa de planificación' })).toHaveAttribute('data-highlighted-route', 'ors-1')
})
