# Arquitectura

Galitrack usa un monolito modular con una SPA y una única API FastAPI. Compose ejecuta los dos componentes. El planificador consulta OpenRouteService de forma asíncrona y carece de estado persistente.

| Ubicación | Responsabilidad |
| --- | --- |
| `backend/app/main.py` | Configuración de FastAPI y entradas HTTP |
| `backend/app/planner/models.py` | Validación Pydantic y contrato OpenAPI |
| `backend/app/planner/openrouteservice.py` | Solicitud, validación y ordenación de circuitos peatonales |
| `backend/app/planner/fixtures.py` | Compatibilidad con el endpoint de demostración |
| `frontend/src/planner/` | Preferencias, cliente HTTP, tarjetas y perfil de elevación |
| `frontend/src/map/` | Carga del mapa vectorial de OpenFreeMap, rutas y respaldo regional |
| `frontend/public/data/` | Cartografía base generalizada servida con la SPA |

Vite enruta `/api` al backend del mismo origen durante el desarrollo y la demostración con Compose. Esto evita dependencias de CORS y mantiene la URL del backend fuera del código del navegador. Para un despliegue futuro, conserva la misma ruta relativa con un servidor de archivos estáticos y un proxy HTTP.

El navegador carga el estilo Liberty, teselas y etiquetas de OpenFreeMap. Si falla, activa la cartografía regional local. Las capas de rutas se agregan a ambos estilos. Al cambiar el origen, la interfaz retira las rutas previas y deja de esperar una respuesta para ese origen.

El backend conserva `ORS_API_KEY` y envía la clave solo en el encabezado `Authorization` al proveedor. La SPA solicita rutas únicamente al enviar el formulario. El backend prueba hasta tres semillas, solicita evitar ferris y devuelve como máximo dos alternativas. Descarta trazados casi duplicados, abiertos o demasiado alejados del origen o de la distancia objetivo. Conserva las coordenadas del proveedor y muestra la superficie por proporción de distancia, incluida la parte sin clasificar. La distancia, el ascenso por kilómetro y la superficie sirven para ordenar, con preferencia por rutas más cercanas a lo solicitado.

## Contrato HTTP

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | `/api/health` | `200 {"status":"ok"}` |
| GET | `/api/openapi.json` | Esquema OpenAPI |
| POST | `/api/routes` | `200` con cero a dos circuitos y `source: "openrouteservice"` |
| POST | `/api/routes/preview` | Respuesta sintética de la versión inicial para compatibilidad |

Ejemplo para `POST /api/routes`.

```json
{
  "origin": { "longitude": -8.5443, "latitude": 42.8805 },
  "distance_km": 10,
  "elevation": "rolling",
  "surface": "mixed",
  "pace_seconds_per_km": 330
}
```

- **Origen.** Ventana de Galicia y alrededores (longitud −9,55 a −6,55, latitud 41,75 a 43,85). Solo se entregan circuitos cuyo primer punto dista como máximo 120 m del origen solicitado y cuyos extremos distan como máximo 25 m.
- **Preferencias.** Distancia objetivo de 2 a 30 km, desnivel `flat`, `rolling` o `hilly`, superficie `asphalt`, `mixed` o `trail` y ritmo entre 120 y 1200 segundos/km.
- **Resultado.** Cada ruta devuelve identificador, nombre, cobertura de superficie, distancia, ascenso acumulado, duración estimada, geometría GeoJSON `LineString` y muestras de elevación contra distancia. La geometría usa EPSG:4326 en orden longitud, latitud. Sin cotas, el perfil queda vacío y el ascenso puede ser `null`. La duración se calcula con el ritmo indicado.
- **Errores.** Preferencias inválidas (`422`), cuota agotada (`429`), clave ausente o rechazada (`503`) y fallos del proveedor (`502` o `504`). Si el proveedor no encuentra un circuito que cumpla las validaciones, la respuesta contiene una lista vacía. La interfaz utiliza solo `POST /api/routes`.

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

MapLibre necesita WebGL. Si el mapa falla, se pueden introducir coordenadas y consultar resultados en las tarjetas. El mapa detallado y los circuitos dependen de sus respectivos servicios. La cobertura del viario, accesos y superficies depende de los datos de OpenStreetMap. Las suites simulan las respuestas externas para comprobar la integración sin consumir cuota.
