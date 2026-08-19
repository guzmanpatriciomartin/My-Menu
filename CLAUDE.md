# Mi Menú — contexto del proyecto

SaaS multi-tenant de menú QR para bares y cafeterías. El comensal escanea un QR en la mesa,
ve el menú y pide; el dueño o encargado gestiona todo desde un panel.

## Stack real

| Capa | Qué usa |
|---|---|
| Frontend | Vite 6 + React 19, SPA **sin router** (`src/App.tsx` orquesta las vistas) |
| Estilos | Tailwind CSS 4 vía `@tailwindcss/vite` |
| Backend | Express 4, un único archivo monolítico: `server.ts` (~740 líneas) |
| Base de datos | Firestore con el **Admin SDK** (`firebase-admin`), credencial por ADC. Ver ADR-006 |
| Validación | zod con `.strict()`, centralizado en `src/server/schemas.ts` |
| Auth | JWT HS256 propio (`jsonwebtoken`) en cookie httpOnly |
| Realtime | Server-Sent Events (`GET /api/realtime`) |
| Pagos | **ninguno.** `Order.paymentStatus` existe en el tipo y se crea en `null` |
| Hosting | Cloud Run vía Google AI Studio (`trust proxy = 1`) |
| Tests | **no hay infraestructura de testing** |

No hay Next.js, App Router, MongoDB, Mongoose, MercadoPago, NextAuth, Clerk ni Firebase Auth.
El paquete `firebase` (SDK cliente) **ya no está en el proyecto**: lo sacó ADR-006 Paso 3. Todo
el acceso a datos —lecturas, escrituras y los 9 listeners— pasa por `adminDb`. El frontend nunca
habla con Firestore: solo consume la API de Express.

## Estructura

```
server.ts                  todos los endpoints Express
src/
  types.ts                 modelo de dominio, compartido front/back
  lib/firebase-admin.ts    init del Admin SDK; exporta `adminDb` y `adminProbe`
  lib/thermalPrint.ts      tickets térmicos 55mm
  server/
    auth.ts                verifySession, requireAuth, requireRole, SECRET, SESSION_COOKIE
    schemas.ts             todos los schemas zod
    store.ts               capa de datos: proyección en memoria + Firestore
    metrics.ts             cálculos puros de métricas
    time.ts                venueDay, dayBounds (America/Argentina/Buenos_Aires)
    users.ts               scrypt + usuarios seed hardcodeados
  db/seedData.ts           datos demo
  components/              AdminView, ClientView, TablePOS, OrdersTable, MetricsDashboard…
  theme/                   ThemeContext + themeConfig
firestore.rules            reglas de Firestore
docs/AGENTES.md            cómo está armado el setup de subagentes
```

## Modelo de datos

Colecciones **planas de primer nivel** en Firestore, todas con campo `establishmentId`:

`establishments`, `categories`, `menuItems`, `tables`, `orders`, `tableCalls`,
`cashCloses`, `cashRegisters`, `tableCloses`

El discriminador de tenant se llama **`establishmentId`**, no `tenantId`. No hay subcolecciones
por tenant: **el aislamiento es responsabilidad del código de aplicación**, por filtrado en
`src/server/store.ts`.

`src/types.ts` tiene el modelo completo. Reusá esas interfaces, no las redefinas.

## El patrón del store

`src/server/store.ts` mantiene una **proyección en memoria** de Firestore:

- Los listeners `onSnapshot` mantienen la memoria al día. **Solo mutan memoria; nunca emiten SSE.**
- Los **getters son sincrónicos** y leen de memoria, siempre filtrando por `establishmentId`.
- Las mutaciones son async: **escriben Firestore primero, memoria después**, y son las que
  llaman a `notifyClients()` (porque conocen el `establishmentId` para segmentar).
- Pasá todo objeto por `forFirestore()` antes de escribir: Firestore rechaza `undefined` y
  hace fallar el write completo.
- Para resultados usá el shape de campos opcionales del proyecto (`{ ok, order?, reason? }`),
  **no** uniones discriminadas: sin `strictNullChecks` el narrowing por booleano no funciona.

**Todo asume un solo proceso.** La proyección en memoria, `closedSessions`,
`cashClosesInFlight` y el rate limiter no se comparten entre instancias ni sobreviven un
reinicio. Cualquier cosa que implique escalar horizontalmente tiene que abordar esos cuatro
puntos explícitamente.

## Auth y roles

- `POST /api/auth/login` → cookie httpOnly `mimenu_session`, JWT HS256, TTL 8 horas.
- El token **nunca** vuelve al browser en el body. La ruta `Authorization: Bearer` de
  `verifySession` existe solo para clientes programáticos.
- Claims: `sub`, `email`, `role`, `establishmentId`.
- Roles: `'admin' | 'waiter'`. Guardas: `requireAuth`, `requireRole('admin')`.
- Passwords: scrypt (`salt:hash`), verificación en tiempo constante, hash dummy para que el
  timing del login no revele si la cuenta existe.
- Usuarios **hardcodeados** en `src/server/users.ts`. No hay registro ni gestión de usuarios.
- `AUTH_SECRET` es obligatorio en producción (el server se niega a arrancar con el default).

## Convenciones de endpoints

- `/api/establishments/:id/...` → **público** (comensal por QR). El tenant viene de la URL, y
  hay que validar que el recurso referenciado (mesa, ítem) pertenezca a ese establecimiento.
- `/api/my/...` → **autenticado**. El tenant viene *siempre* de `req.user.establishmentId`,
  nunca del cliente.
- Mutaciones por id (`/api/orders/:id/...`) → verifican ownership comparando
  `existing.establishmentId !== req.user.establishmentId` y responden **404** (no 403), para no
  filtrar existencia.
- Salud: `GET /api/health` es **público y mínimo** (`{status, time}`, siempre HTTP 200 incluso
  degradado, para no que un health check de plataforma recicle revisiones que están sirviendo).
  Todo el detalle —listeners, `writePath` del heartbeat, `lastSnapshotAt`— vive en
  `GET /api/health/details`, detrás de `requireAuth` + `requireRole('admin')`, porque publicarlo
  sin auth es un oráculo de actividad de negocio de toda la plataforma.
- Todo endpoint mutante hace `parseBody(schema, req, res)` y corta si devuelve `null`.
- Los errores van con `next(e)` al error handler central, que loguea el detalle real y devuelve
  un mensaje genérico. Nunca devuelvas el error de zod crudo.

## Reglas de negocio que no se negocian

1. **Precios y nombres se recalculan server-side desde el catálogo.** El cliente solo manda
   `menuItemId` + `quantity` + `comment` opcional. Nunca aceptes `price` ni `name` del cliente.
2. Si algún ítem del pedido falta, es de otro tenant o no está disponible, **se rechaza el
   pedido completo** sin escribir nada.
3. Los pedidos con `cashCloseId` están **congelados**: no se modifican (409). Un cierre de caja
   ya emitido no puede desbalancearse.
4. La pertenencia a un cierre de caja es por **estampa de `cashCloseId`**, no por ventana de
   tiempo. Eso es lo que garantiza que un pedido no se cuente dos veces ni se pierda.
5. Si agregás una colección a Firestore, agregá su regla en `firestore.rules` o el write falla
   silenciosamente en runtime.

## TypeScript no es estricto

`tsconfig.json` no tiene `strict` ni `strictNullChecks`, y eso no es accidental:
`src/server/store.ts` documenta que usa shapes de resultado con campos opcionales
*precisamente porque* el narrowing por booleano no funciona sin `strictNullChecks`.

Activar `strict` es una migración con costo real, no un flag. Mientras no se haga, seguí el
patrón de resultados existente.

## Convenciones de estilo

- Comentarios en **inglés**. Mensajes de error y de UI en **español**.
- Comentá el **por qué**, no el qué. El código existente explica trade-offs y modos de falla
  en los comentarios: seguí ese nivel.
- Los comentarios de seguridad usan etiquetas de auditorías previas: `F-3`…`F-9`, `ALTO-1`,
  `ALTO-2`, `MED-1`, `MED-4`, `BAJO`. Si tocás ese código, mantené la etiqueta.
- Las decisiones de arquitectura se citan como `ADR-005`. **Los ADRs no están escritos** en el
  repo, solo se los referencia en comentarios.
- Estados de pedido, como literales en español: `'Recibido' | 'En preparación' | 'Listo' |
  'Entregado' | 'Cancelado'`.
- Ids con prefijo: `ord-`, `orditem-`, `call-`, `close-`, `tclose_`.
- Fechas de negocio pasan por `src/server/time.ts`. **No uses `new Date()` para lógica de día
  de negocio** — la zona es America/Argentina/Buenos_Aires.

## Comandos

```bash
npm run dev
```

Levanta `server.ts` con tsx (Express + middleware de Vite) en el puerto 3000.

```bash
npm run lint
```

Es `tsc --noEmit`. No hay ESLint configurado. Correlo antes de dar por terminado un cambio.

Un cambio típico toca cinco archivos a la vez: `src/types.ts`, `src/server/schemas.ts`,
`src/server/store.ts`, `server.ts` y el componente.

## Riesgo estructural que condiciona toda decisión de seguridad

`firestore.rules` tiene `allow read, write: if true` en **todas** las colecciones, y
`firebase-applet-config.json` está commiteado. Combinados: cualquiera con ese config puede leer
y escribir la base entera **sin pasar por Express**, salteándose auth, validación zod,
aislamiento de tenant y precios server-side.

Medido, no inferido: `runQuery` sin autenticar contra las 9 colecciones devuelve 200, y 403 en
una colección sin regla. La escritura se sigue infiriendo del archivo de reglas.

**El bloqueo que impedía cerrarlas ya no existe.** ADR-006 migró el backend al Admin SDK, que
bypassea las reglas, y sacó el SDK cliente del proyecto. Como no queda ningún cliente de
Firestore vivo —ni en el server ni en el bundle del frontend—, `firestore.rules` hoy gobierna
exactamente a una población: atacantes no autenticados. Cerrarlas es funcionalmente un no-op
para la app. Falta solo desplegar (Pasos 4 y 5 del ADR).

**Mientras ese deploy no ocurra, toda mitigación en la capa Express es defensa en profundidad,
no la frontera de seguridad real.** No concluyas "está cubierto" porque un endpoint valida bien:
preguntate qué pasa si el atacante escribe directo en Firestore.

**Cuando ocurra, el corolario se invierte y se vuelve más exigente:** Express pasa a ser la
única frontera, y el aislamiento por `establishmentId` en `src/server/store.ts` deja de tener
red de contención. Un bug de tenant ahí ya no lo tapa nada.

## Deuda conocida

Ya identificada — no hace falta redescubrirla:

1. `firestore.rules` completamente abierto (arriba). **Ya no está bloqueado**: falta el deploy
   de los Pasos 4 y 5 del ADR-006.
2. `SECURITY_BACKLOG.md` y `README.md` no existen, pero `firestore.rules` cita el primero.
3. `ADR-005` (cierre de caja y métricas) se cita en varios archivos y **sigue sin escribirse**.
   `ADR-006` sí existe, en `docs/adr/`.
4. Sin tests. Ninguna red de seguridad para refactors grandes, y hay dos pendientes que la
   necesitan: `runTransaction` en las mutaciones de pedidos y la proyección a `Map<string, T>`.
5. TypeScript no estricto, con código que ya se apoya en eso.
6. CSP desactivada en helmet, por el inline/eval del dev server de Vite.
7. Todo asume una sola instancia.
8. Doce `catch { console.error }` en el store actualizan memoria y emiten SSE después de un
   write que pudo fallar: la UI muestra la operación aplicada y se pierde en el próximo
   snapshot. El heartbeat de `/api/health/details` (`writePath`) ya detecta que se están
   perdiendo escrituras, pero **no cuál** operación se perdió, así que el usuario sigue viendo
   un cambio que no ocurrió.
9. Coexisten `bun.lock` y `package-lock.json`. El primero quedó desincronizado al sacar
   `firebase` de `package.json`, así que `bun install --frozen-lockfile` fallaría.

Hallazgos de seguridad abiertos, de la auditoría completa: falta prueba de presencia en la mesa
(el QR no lleva token, así que se pueden inyectar pedidos y espiar por SSE en cualquier local),
ids de recurso elegidos por el cliente, cancelaciones sin rol ni atribución, y enumeración de
locales por los endpoints públicos.

## Subagentes

Hay cuatro subagentes en `.claude/agents/`: `developer`, `security-reviewer`, `qa-tester` y
`architect`. Ver @docs/AGENTES.md para cuándo usar cada uno.

Como heredan este archivo, **no repitas el stack ni el modelo de datos al invocarlos**.
