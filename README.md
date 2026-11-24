# Galitrack

Planificador web de circuitos de running en Galicia. Elige un origen en el mapa o introduce sus coordenadas, ajusta distancia, desnivel, superficie y ritmo, y compara dos circuitos de demostración con perfiles de elevación.

**Los circuitos y los perfiles son simulados.** La cartografía de referencia es real y generalizada. Utiliza la aplicación para explorar el flujo de planificación.

[Captura de escritorio](docs/screenshots/escritorio.png) · [Captura móvil](docs/screenshots/movil.png)

## Ejecutar con Docker Compose

Requiere Docker con Compose v2 y BuildKit.

```sh
docker compose up --build --wait
```

Abre [la aplicación](http://localhost:5173). La [documentación interactiva de la API](http://localhost:8000/api/docs) y el [health check](http://localhost:8000/api/health) se publican en el puerto del backend. El frontend envía las peticiones a `/api` a través del proxy de Vite.

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
uv run --locked uvicorn app.main:app --reload
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

Para regenerar las capturas, ejecuta `UPDATE_SCREENSHOTS=1 npm run test:e2e` desde `frontend/`. Los PNG se guardan en `docs/screenshots/`.

## Diseño técnico

- [Arquitectura y contrato HTTP](docs/ARCHITECTURE.md)
- [Hoja de ruta e investigación de OpenRouteService](docs/ROADMAP.md)
