import { DEFAULTS, type Preferences, type Route } from './model'

const storageKey = 'galitrack.last-plan'

export interface Plan {
  id: string
  preferences: Preferences
  routes: Route[]
  warnings?: string[]
}

export function restorePlan(): Plan | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
    if (typeof value?.id !== 'string' || !value.preferences || !Array.isArray(value.routes)) return null
    return { ...value, preferences: { ...DEFAULTS, ...value.preferences } }
  } catch {
    return null
  }
}

export function rememberPlan(plan: Plan | null) {
  try {
    if (plan) sessionStorage.setItem(storageKey, JSON.stringify(plan))
    else sessionStorage.removeItem(storageKey)
  } catch {
    // The planner works in memory when session storage is unavailable.
  }
}

export function routeLink(planId: string, routeId: string) {
  return `#/rutas/${planId}/${routeId}`
}
