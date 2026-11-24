# Arquitectura

Galitrack usa un monolito modular con una SPA y una única API FastAPI. Compose ejecuta los dos componentes. El planificador es síncrono, determinista y sin estado persistente.

| Ubicación | Responsabilidad |
| --- | --- |
| `backend/app/main.py` | Configuración de FastAPI y entradas HTTP |
| `backend/app/planner/models.py` | Validación Pydantic y contrato OpenAPI |
| `backend/app/planner/fixtures.py` | Escala y desplaza figuras cerradas y perfiles sintéticos |
| `frontend/src/planner/` | Preferencias, cliente HTTP, tarjetas y perfil de elevación |
| `frontend/src/map/` | Estilo local y ciclo de vida de MapLibre |
| `frontend/public/data/` | Cartografía base generalizada servida con la SPA |

Vite enruta `/api` al backend del mismo origen durante el desarrollo y la demostración con Compose. Esto evita dependencias de CORS y mantiene la URL del backend fuera del código del navegador. Para un despliegue futuro, conserva la misma ruta relativa con un servidor de archivos estáticos y un proxy HTTP.

La interfaz mantiene las preferencias editadas y los resultados de la última solicitud válida. Si cambias el origen o los ajustes, puedes comparar los resultados anteriores hasta aplicar los cambios. Un resultado incluye todo lo necesario para pintar mapa, tarjetas y perfil. La aplicación usa fuentes y cartografía locales y funciona sin servicios cartográficos externos después de instalarse.

## Contrato HTTP

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | `/api/health` | `200 {"status":"ok"}` |
| GET | `/api/openapi.json` | Esquema OpenAPI |
| POST | `/api/routes/preview` | `200` con dos circuitos y `source: "demo"`, o `422` si las preferencias son inválidas |

Ejemplo de solicitud:

```json
{
  "origin": { "longitude": -8.5443, "latitude": 42.8805 },
  "distance_km": 10,
  "elevation": "rolling",
  "surface": "mixed",
  "pace_seconds_per_km": 330
}
```

- **Origen.** Ventana de Galicia y alrededores (longitud −9,55 a −6,55, latitud 41,75 a 43,85). Acepta coordenadas en agua o fuera de los límites administrativos dentro de esta ventana.
- **Preferencias.** Distancia objetivo de 2 a 30 km, desnivel `flat`, `rolling` o `hilly`, superficie `asphalt`, `mixed` o `trail` y ritmo entre 120 y 1200 segundos/km.
- **Resultado.** Cada ruta devuelve identificador, nombre, superficie, distancia, ascenso acumulado, duración estimada, una geometría GeoJSON `LineString` cerrada y muestras ordenadas de elevación contra distancia. La geometría usa EPSG:4326 en orden longitud, latitud. Cada muestra tiene `distance_km` y `elevation_m`.
- **Datos demo.** La alternativa principal aproxima la distancia deseada escalando el fixture. La segunda es un 18 % más larga. El ascenso se basa en el nivel indicado, la superficie es una etiqueta de demostración y el tiempo es distancia por ritmo. La posición en el mapa no acredita conectividad ni un derecho de paso.

Los tipos TypeScript se derivan de OpenAPI. Para regenerarlos, desde la raíz y con ambos entornos instalados:

```sh
schema_dir=$(mktemp -d)
schema_file="$schema_dir/openapi.json"
(cd backend && uv run --locked python -c 'import json; from app.main import app; print(json.dumps(app.openapi()))') > "$schema_file" &&
  (cd frontend && npm exec -- openapi-typescript "$schema_file" -o src/planner/api-schema.ts)
rm -f "$schema_file"
rmdir "$schema_dir"
```

Consulta también [la licencia y procedencia de la cartografía](../frontend/public/data/README.md).

## Pruebas y límites

pytest valida la API ASGI con HTTPX. Vitest cubre conversiones, formato y coordenadas. Playwright recorre la SPA en Chromium con tamaños de escritorio y móvil, incluyendo el clic en el mapa, la selección de perfil, el origen por teclado y el reintento tras un error de la API.

MapLibre necesita WebGL. Si el mapa falla, se pueden introducir coordenadas y consultar resultados en las tarjetas. La base cartográfica tiene detalle regional y no incluye el viario local. El perfil usa una escala lineal en kilómetros y metros y los resultados describen circuitos sintéticos.
