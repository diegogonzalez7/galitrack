# Galitrack

- Trabaja desde el checkout existente. El backend FastAPI es un monolito modular y el frontend React es su aplicación web.
- Mantén la lógica de rutas en `backend/app/planner/` y la UI del planificador en `frontend/src/planner/`. Mantén las dependencias de MapLibre en `frontend/src/map/`.
- FastAPI y sus modelos Pydantic definen el contrato HTTP. Si cambias el contrato, regenera `frontend/src/planner/api-schema.ts` siguiendo `docs/ARCHITECTURE.md`.
- Usa GeoJSON WGS84 en orden longitud, latitud. Usa kilómetros, metros y segundos en las propiedades identificadas por unidad.
- Conserva la procedencia visible de los fixtures. Las geometrías y alturas de demostración no deben presentarse como navegación real.
- Instala con `uv sync --locked` y `npm ci`. Ejecuta pytest, Vitest y la compilación tras cambios de lógica. Ejecuta Playwright para cambios de interacción.
- No guardes claves ni valores privados en el repositorio. Mantén `.env.example` con valores públicos de ejemplo.
