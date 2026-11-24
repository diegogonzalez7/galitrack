import { expect, test } from '@playwright/test'
import type { Preferences, Preview } from '../src/planner/model'

test('muestra el mapa local, las dos alternativas y el perfil seleccionado', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  expect((await page.request.get('/data/galicia.geojson')).ok()).toBeTruthy()
  await expect(page.getByRole('heading', { name: 'Tu próxima ruta empieza aquí.' })).toBeVisible()
  await expect(page.getByText('Datos de demostración')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Acercar mapa' })).toBeEnabled()
  const canvas = page.getByTestId('map-canvas').locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  await expect(canvas).toBeInViewport({ ratio: 0.25 })
  const bounds = await canvas.boundingBox()
  expect(bounds?.height).toBeGreaterThanOrEqual(320)

  const west = page.getByRole('button', { name: /Circular do Val/ })
  const east = page.getByRole('button', { name: /Volta do Monte/ })
  await expect(west).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('img', { name: /Perfil simulado de Circular do Val/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(testInfo.project.use.viewport?.width)

  if (process.env.UPDATE_SCREENSHOTS === '1') {
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: `../docs/screenshots/${testInfo.project.name}.png`,
      fullPage: true,
      scale: 'css',
      animations: 'disabled',
    })
  }

  await east.click()
  await expect(east).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('img', { name: /Perfil simulado de Volta do Monte/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('regenera las rutas con el origen elegido en el mapa y las preferencias del corredor', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Acercar mapa' })).toBeEnabled()
  const origin = page.getByTestId('origin')
  const original = await origin.textContent()
  await page.getByTestId('map-canvas').locator('canvas').click({ position: { x: 90, y: 190 } })
  await expect(origin).not.toHaveText(original ?? '')
  await expect(page.getByText('Genera rutas para aplicar los cambios.')).toBeVisible()
  await page.getByRole('slider', { name: 'Distancia objetivo' }).fill('12')
  await page.getByText('Exigente', { exact: true }).click()
  await page.getByText('Tierra', { exact: true }).click()
  await page.getByLabel('Ritmo estimado').fill('6:00')

  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/routes/preview') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Generar rutas demo' }).click()
  const response = await responsePromise
  expect(response.ok()).toBeTruthy()
  const result: Preview = await response.json()
  const submitted: Preferences = response.request().postDataJSON()
  expect(submitted).toMatchObject({
    distance_km: 12,
    surface: 'trail',
    elevation: 'hilly',
    pace_seconds_per_km: 360,
  })
  expect(result.source).toBe('demo')
  expect(result.routes[0].geometry.coordinates[0]).toEqual([submitted.origin.longitude, submitted.origin.latitude])
  await expect(page.getByRole('button', { name: /Circular do Val/ })).toContainText('12 km')
  await expect(page.getByRole('button', { name: /Circular do Val/ })).toContainText('1 h 12 min')
  await expect(page.getByText('Genera rutas para aplicar los cambios.')).toHaveCount(0)
})

test('acepta coordenadas por teclado y permite reintentar tras un error de la API', async ({ page }) => {
  await page.route('**/api/routes/preview', (route) => route.fulfill({ status: 503 }))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('No se pudieron generar las rutas')
  await page.unroute('**/api/routes/preview')

  await page.locator('summary').filter({ hasText: 'Punto de partida' }).press('Enter')
  await page.getByLabel('Latitud', { exact: true }).fill('43,371')
  await page.getByLabel('Longitud', { exact: true }).fill('-8,411')
  await page.getByRole('button', { name: 'Usar coordenadas' }).press('Enter')
  await expect(page.getByTestId('origin')).toContainText('43.3710° N, 8.4110° O')

  await page.getByLabel('Ritmo estimado').fill('0:00')
  await page.getByRole('button', { name: 'Generar rutas demo' }).press('Enter')
  await expect(page.getByLabel('Ritmo estimado')).toBeFocused()
  await expect(page.getByText('Usa minutos:segundos, entre 2:00 y 20:00.')).toBeVisible()
  await page.getByLabel('Ritmo estimado').fill('5:00')
  await page.getByRole('button', { name: 'Generar rutas demo' }).press('Enter')
  await expect(page.getByRole('button', { name: /Circular do Val/ })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
