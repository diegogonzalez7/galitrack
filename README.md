# Galitrack

Planificador web de circuitos de running en Galicia. Elige un origen en el mapa o introduce sus coordenadas, ajusta distancia, desnivel, superficie y ritmo, y compara hasta dos circuitos de la red peatonal con perfiles de elevación.

El mapa detallado usa OpenStreetMap a través de OpenFreeMap, sin clave. Los circuitos requieren una clave gratuita de OpenRouteService.

[Demostración inicial en escritorio](docs/screenshots/escritorio.png) · [Demostración inicial en móvil](docs/screenshots/movil.png)

## Ejecutar con Docker Compose

Requiere Docker con Compose v2 y BuildKit. Obtén una clave gratuita de OpenRouteService. En la raíz del proyecto, crea o edita `.env` y añade `ORS_API_KEY=` con tu clave. Si ya usas `BACKEND_PORT=8010`, conserva esa línea. [Panel de OpenRouteService](https://openrouteservice.org/dev/#/home)

Si ya tienes un clon en la rama `feature/project-foundation`, actualízalo con `git pull --ff-only origin feature/project-foundation`.

```sh
docker compose up --build --wait
```

Abre [la aplicación](http://localhost:5173). La [documentación interactiva de la API](http://localhost:8000/api/docs) y el [health check](http://localhost:8000/api/health) se publican en el puerto del backend. El frontend envía las peticiones a `/api` a través del proxy de Vite.

El navegador necesita acceso a `tiles.openfreemap.org` y el backend a `api.openrouteservice.org`. Si la cartografía detallada falla, el mapa muestra el respaldo regional e indica que faltan calles y caminos. Si no hay clave o el proveedor no devuelve un circuito válido, el planificador muestra el motivo y deja el mapa sin rutas.

Si necesitas cambiar los puertos, copia `.env.example` a `.env` y edita sus valores. Usa `docker compose down` para detener los servicios. Compose sirve la compilación del frontend para probar la aplicación en local.

<details>
<summary>Compilar detrás de un proxy HTTPS con CA privada</summary>

Pasa el bundle de CAs de confianza del sistema a BuildKit mediante un override local. El override siguiente usa la ruta habitual de Linux. Los Dockerfiles montan ese fichero únicamente durante la instalación de las dependencias.

```sh
cat > /tmp/galitrack-compose.proxy.yaml <<'YAML'
services:
  backend:
    build:
      secrets: [build_ca]
  frontend:
    build:
      secrets: [build_ca]
secrets:
  build_ca:
    file: /etc/ssl/certs/ca-certificates.crt
YAML

BACKEND_PORT=8010 docker compose -f compose.yaml -f /tmp/galitrack-compose.proxy.yaml up --build --wait
```

En Codex Cloud, el ejemplo usa el puerto 8010 para evitar el 8000, reservado por el entorno.

</details>

## Desarrollo local con recarga

Requiere Python 3.12, [uv](https://docs.astral.sh/uv/) y Node.js 22.12+.

```sh
cd backend
uv sync --locked
uv run --locked --env-file ../.env uvicorn app.main:app --reload
```

En otra terminal, desde la raíz:

```sh
cd frontend
npm ci
npm run dev
```

Si cambias el puerto de Uvicorn (por ejemplo, a 8010 en Codex Cloud), inicia Vite con `API_PROXY_TARGET=http://127.0.0.1:8010 npm run dev`.

## Pruebas

```sh
(cd backend && uv run --locked pytest)
(cd frontend && npm test && npm run build)
(cd frontend && npx playwright install chromium && npm run test:e2e)
```

Playwright inicia ambos servidores en puertos de prueba y ejecuta escenarios en escritorio y móvil. Para comprobar una instancia existente, ejecuta `E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e` desde `frontend/`. Si ya dispones de Chromium, puedes usar `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` con su ruta.

Las pruebas de enrutamiento y de carga del mapa usan respuestas controladas. Para validar el servicio en vivo, elige un origen próximo a una calle en Pontevedra, genera un circuito de 10 km y revisa el trazado. Acerca el mapa para distinguir las calles y caminos de referencia.

## Diseño técnico

- [Arquitectura y contrato HTTP](docs/ARCHITECTURE.md)
- [Hoja de ruta e investigación de OpenRouteService](docs/ROADMAP.md)
