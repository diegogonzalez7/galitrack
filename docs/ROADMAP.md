# Hoja de ruta

## 01 · Fundamentos

Planificador de running con mapa regional, preferencias, contrato FastAPI, dos circuitos de demostración y perfiles simulados. La geometría se crea a partir de fixtures dentro de la API y la aplicación muestra su procedencia.

## 02 · Circuitos reales con OpenRouteService

Galitrack usa `POST /v2/directions/foot-walking/geojson` con un origen, hasta tres semillas y una preferencia de evitar ferris. La aplicación estima el ritmo y clasifica las opciones según distancia, ascenso y superficie disponible. La cartografía vectorial de OpenFreeMap muestra calles y caminos al acercar el mapa.

El adaptador se comprobó con respuestas controladas. Queda pendiente validar el proveedor alojado con una clave real y comparar `foot-walking` y `foot-hiking` en recorridos rurales.

Consulta la [API de Directions](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/), las [restricciones del servicio alojado](https://openrouteservice.org/restrictions/) y la [documentación de OpenFreeMap](https://openfreemap.org/).

### Validar con corredores

Usar orígenes representativos en Santiago, costa y zonas rurales. Medir error de distancia, cierre del circuito, cobertura de superficie y elevación, segmentos repetidos, latencia y consumo de cuota. Probar el adaptador con respuestas HTTPX grabadas o simuladas para que la suite no dependa de una clave ni del servicio alojado. Valorar el alojamiento propio únicamente si los resultados, la cuota o la disponibilidad lo justifican.
