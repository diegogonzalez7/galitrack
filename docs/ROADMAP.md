# Hoja de ruta

## 01 · Fundamentos

Planificador de running con mapa regional, preferencias, contrato FastAPI, dos circuitos de demostración y perfiles simulados. La geometría se crea a partir de fixtures dentro de la API y la aplicación muestra su procedencia.

## 02 · Circuitos reales con OpenRouteService

### Probar el proveedor

OpenRouteService (ORS) admite peticiones de circuito con un solo origen. El primer prototipo usaría `POST /v2/directions/foot-walking/geojson`. Compararía `foot-walking` y `foot-hiking` con circuitos urbanos y rurales de Galicia para elegir un perfil que refleje el uso del corredor. El modo peatonal aplica reglas de acceso del grafo de ORS. La adecuación al running requiere evaluar los resultados.

Este es un cuerpo de referencia para una prueba futura:

```json
{
  "coordinates": [[-8.5443, 42.8805]],
  "options": { "round_trip": { "length": 10000, "points": 5, "seed": 42 } },
  "elevation": true,
  "extra_info": ["surface", "steepness"],
  "instructions": false
}
```

ORS recibe coordenadas de longitud y latitud. `length` está en metros y es un objetivo aproximado. `points` modifica la forma del circuito y `seed` permite explorar otros trazados. Evalúa la versión alojada con varios valores y verifica las restricciones de distancia, cuotas y cobertura vigentes antes de fijar límites en Galitrack. La investigación de esta tarea cubre la documentación y el código público del proveedor. La prueba en vivo queda pendiente.

Consulta [API de Directions](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/), [opciones de circuito en ORS](https://github.com/GIScience/openrouteservice/blob/main/ors-api/src/main/java/org/heigit/ors/api/requests/routing/RouteRequestRoundTripOptions.java), [restricciones del servicio alojado](https://openrouteservice.org/restrictions/).

### Integrar y normalizar

1. Crear un adaptador ORS con HTTPX bajo el módulo planificador. La clave futura `ORS_API_KEY` vive en el backend y se envía en el encabezado `Authorization`. Usar tiempos de espera explícitos y limitar el número de peticiones por planificación.
2. Probar unas pocas semillas y deduplicar por geometría o solapamiento de segmentos. Descartar circuitos demasiado alejados de la distancia solicitada y medir la distancia entre sus extremos y el punto original ajustado al grafo.
3. Normalizar la geografía, distancias y ascenso. Mantener la geometría GeoJSON 2D para el mapa y construir el perfil con las altitudes de los vértices y su distancia acumulada. Si faltan cotas, exponer su ausencia en la respuesta. Calcular la estimación de running con el ritmo del corredor.
4. Ordenar las opciones por error de distancia, ascenso por km y proporción de cada superficie. Ponderar la superficie por longitud de tramos, con una categoría explícita para los segmentos sin clasificar. El desnivel y la superficie objetivo actúan inicialmente como criterios de ranking.
5. Añadir una operación para rutas reales y un contrato con procedencia propia, compartiendo con la vista los campos normalizados. Mantener el modo demo para desarrollo. Diferenciar punto fuera del grafo, circuito inviable, cuota agotada o proveedor temporalmente indisponible. Respetar `Retry-After` cuando exista y mantener los reintentos acotados.

Consulta [opciones por perfil](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options), [datos adicionales](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/).

### Validar con corredores

Usar orígenes representativos en Santiago, costa y zonas rurales. Medir error de distancia, cierre del circuito, cobertura de superficie y elevación, segmentos repetidos, latencia y consumo de cuota. Probar el adaptador con respuestas HTTPX grabadas o simuladas para que la suite no dependa de una clave ni del servicio alojado. Valorar el alojamiento propio únicamente si los resultados, la cuota o la disponibilidad lo justifican.
