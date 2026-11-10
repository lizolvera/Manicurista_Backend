# Backend de Entre Uñas

API Express con TypeScript y MongoDB Atlas. Se instala y ejecuta sin depender de Angular. Nunca almacenes secretos en el frontend.

## Preparación

Desde esta carpeta:

```powershell
npm ci
Copy-Item .env.example .env
```

Copia el ejemplo solamente si todavía no tienes `.env`. Completa MONGODB_URI con la cadena real de Atlas y limita el usuario a la base de demostración. ALLOWED_ORIGINS debe incluir la dirección exacta de tu interfaz.

```env
MONGODB_URI=TU_CADENA_PRIVADA_DE_ATLAS
MONGODB_DB=bina03_demo
PORT=3000
ALLOWED_ORIGINS=http://localhost:4200
```

El `.env` se busca en esta carpeta aunque inicies el archivo desde otra ruta. No se imprime la cadena en los mensajes de error y el archivo queda excluido del repositorio.

## Desarrollo

```powershell
npm run dev
```

El servidor reinicia al guardar cambios. Con Atlas conectado abre http://localhost:3000/api/health.

## Producción y comprobaciones

```powershell
npm run build
npm start
```

- `npm run build`: compila TypeScript a `dist/`.
- `npm run check`: revisa los tipos sin generar archivos.
- `npm test`: prueba reglas y rutas con datos ficticios en memoria, sin Atlas.

## Archivos

- `src/index.ts`: inicia el servidor y gestiona el cierre.
- `src/app.ts`: Express, CORS, límites y manejo de solicitudes inválidas.
- `src/config/env.ts`: variables de entorno.
- `src/config/database.ts`: conexión, colecciones e índices MongoDB.
- `src/routes/agenda.routes.ts`: `/api/health`, `/api/state`, `/api/command`.
- `src/services/agenda.service.ts`: validación y coordinación de acciones.
- `src/services/mongo-agenda.repository.ts`: lectura y escritura transaccional por colección.
- `src/domain/documents.ts`: campos exactos de cada documento de Atlas.
- `src/domain/agenda.model.ts`: modelos, validaciones de citas y migración.
- `src/domain/agenda.actions.ts`: operaciones permitidas de citas, avisos, clientas y diseños.
- `tests/agenda.test.ts`: pruebas independientes de Angular.

Las reglas de dominio son autónomas y obligatorias en el servidor. El frontend conserva validación y reglas equivalentes para su modo local; no hay importaciones entre ambas aplicaciones. Una futura modificación de reglas debe acompañarse de comprobaciones de compatibilidad.

En Render selecciona Root Directory `backend`, construcción `npm ci --include=dev && npm run build`, inicio `npm start`, salud `/api/health`. El archivo `render.yaml` de la raíz contiene esas opciones.

El alcance sigue siendo una agenda compartida de demostración sin autenticación. Solo datos ficticios; no se procesa dinero ni se envían mensajes automáticamente.

La versión actual utiliza las seis colecciones y conserva `agenda` sin migrarla ni sobrescribirla. Consulta `../docs/COMPROBAR_ATLAS.md`. La colección interna `_control` coordina los comandos simultáneos.
