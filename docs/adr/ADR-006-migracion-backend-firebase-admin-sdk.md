# ADR-006 — Migración del backend al Firebase Admin SDK para poder cerrar `firestore.rules`

- **Estado:** aceptado (plan; sin implementar)
- **Fecha:** 2026-08-18
- **Afecta:** `src/lib/firebase.ts`, `src/server/store.ts`, `firestore.rules`, `.env.example`, `package.json`, `server.ts`
- **Relacionado:** ADR-005 (cierre de caja por estampa de `cashCloseId`) — no se toca

> Nota de numeración: los ADR 001–005 no están escritos. `ADR-005` se cita en nueve archivos y
> corresponde a la decisión de cierre de caja / métricas. Este ADR toma el 006 para no pisarlo.

---

## Contexto

### El agujero

`firestore.rules` tiene `allow read, write: if true` en todas las colecciones y
`firebase-applet-config.json` está commiteado en un repo **público**
(`github.com/guzmanpatriciomartin/My-Menu`). Cualquiera con ese JSON lee y escribe la base
entera vía la REST API de Firestore, sin pasar por Express: sin auth, sin zod, sin aislamiento
por `establishmentId`, sin recálculo de precios server-side.

No es un descuido: el backend usa el **SDK cliente** (`src/lib/firebase.ts` importa
`firebase/firestore`), así que está sujeto a esas mismas reglas. Cerrar las reglas hoy rompe el
server. Las reglas y el SDK del backend son **una sola decisión**, no dos.

### Lo que se verificó en el código (no asumido)

1. **`src/lib/firebase.ts` lo importa un solo archivo: `src/server/store.ts`.** Cero
   componentes del frontend. Todo el acceso a Firestore es server-side; el frontend habla
   únicamente con `/api/*` y el SSE de `/api/realtime`.
2. **`export const auth = getAuth(app)` es código muerto.** Nadie lo importa. No hay Firebase
   Auth en el proyecto.
3. **Las variables de Firebase de `.env.example` no las lee nadie.** `FIREBASE_PROJECT_ID`,
   `FIRESTORE_DATABASE_ID` y `FIREBASE_SERVICE_ACCOUNT` son documentación de un diseño que
   nunca se escribió. El comentario de `server.ts:1-4` describe un módulo
   (`src/lib/firebase-admin`) que no existe. `src/lib/firebase.ts` lee el `projectId` y el
   `firestoreDatabaseId` del JSON commiteado, no del entorno.
4. **El entorno local ya está preparado, pero con otras variables que las documentadas.** El
   `.env` (ignorado) define `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID` y
   **`GOOGLE_APPLICATION_CREDENTIALS`** — no `FIREBASE_SERVICE_ACCOUNT`. Y existe un
   `firebase-service-account.json` en la raíz, **no trackeado y ausente del historial de git**
   (`.gitignore` lo cubre), del proyecto correcto y con
   `client_email = firebase-adminsdk-fbsvc@gen-lang-client-0776464266.iam.gserviceaccount.com`.
   O sea: la credencial local ya está, `.env.example` está desactualizado.
5. **`firebase.json` y `.firebaserc` existen** y apuntan al proyecto y a la base correctos, así
   que las reglas se despliegan con `firebase deploy --only firestore:rules`. Esto es
   importante: el paso de cerrar reglas es un comando reversible en menos de un minuto.
6. **Bug vivo, consecuencia directa del agujero:** `firestore.rules` **no tiene regla para
   `tableCloses`**, colección que el store escribe (`store.ts:1003`) y escucha
   (`store.ts:293`) desde el commit f276b15. Con `rules_version = '2'` y sin `match`, el
   default es denegar. El write falla, el `catch` lo tragua con un `console.error`, la memoria
   queda actualizada y el listener muere. **El historial de cierres de mesa vive solo en
   memoria y se pierde en cada reinicio.** Es exactamente el modo de falla que documenta la
   regla 5 de `CLAUDE.md`, ocurriendo ahora en producción.
7. **La superficie real del SDK en `store.ts` es chica.** De ~1350 líneas, ~130 tocan Firestore,
   y 92 de esas son el bloque de listeners copy-pasteado 9 veces. Las otras ~1200 (filtrado por
   tenant, sesiones de mesa, aritmética de cierre de caja, métricas, SSE) operan sobre
   `this.data`, que son arrays de objetos planos, y no ven un tipo de Firestore nunca.

El punto 7 es el hallazgo que define este ADR: **el patrón del store — getters sincrónicos
sobre una proyección en memoria, con el SDK solo en los bordes — es lo que hace que esta
migración sea chica.** Cualquier otra cosa que cueste ese patrón, esto lo paga.

### El inventario exacto a migrar

| Operación cliente | Sitios | Equivalente Admin |
|---|---|---|
| `onSnapshot(collection(db, n), next, err)` | 9 | `db.collection(n).onSnapshot(next, err)` |
| `setDoc(doc(db, n, id), data)` | 11 | `db.collection(n).doc(id).set(data)` |
| `setDoc(..., { merge: true })` | 1 | `.set(data, { merge: true })` |
| `deleteDoc(doc(db, n, id))` | 2 | `.delete()` |
| `writeBatch(db)` + `batch.set/delete` + `commit()` | 4 bloques | `db.batch()`, API idéntica |
| `getDocs(query(collection(db, n), limit(1)))` | 1 | `db.collection(n).limit(1).get()` |
| `snap.docs.map(d => d.data() as T)` | 9 | idéntico |
| `snap.metadata.fromCache` | 1 | **no existe** |

Diferencias semánticas que importan, en orden de peligro:

- **Un listener que muere, muere en silencio.** En los dos SDKs un error terminal
  (`permission-denied`, credencial inválida, base inexistente) invoca el handler de error y
  **no resuscribe**. Los 9 handlers actuales solo hacen `console.error`. Post-migración, una
  credencial o un IAM mal configurados matan los 9 listeners al boot: la app sigue sirviendo
  los datos *seed* que el store carga en memoria en el constructor, `/api/health` responde
  `{status:'ok'}` y el panel se ve normal. **Es el modo de falla más peligroso de toda la
  migración** y es la razón por la que el plan agrega una señal de liveness de listeners
  *antes* de cerrar las reglas.
- **`databaseId` mal pasado = base equivocada, silenciosamente.** La base no es la default
  (`ai-studio-mimenuchecktable-9d36...`). Si se omite, el Admin SDK va a `(default)`, la
  encuentra vacía, la siembra con datos demo y todo "funciona" apuntando al lugar equivocado.
  `getFirestore(app, databaseId)` está soportado en `firebase-admin` ^14.
- **No hay caché offline ni cola de writes.** `.get()` llega al servidor o rechaza. El guard de
  `snap.metadata.fromCache` en `seedIfEmpty()` (`store.ts:317`) desaparece y su intención se
  cumple gratis: si no se puede leer, tira, el `catch` de `initFirebaseSync` loguea y **no se
  siembra**. Queda fail-closed, mejor que hoy.
- **`undefined` sigue siendo un error.** `@google-cloud/firestore` tira
  `Cannot use "undefined" as a Firestore value` salvo que se active
  `ignoreUndefinedProperties`. `forFirestore()` sigue siendo necesario y se mantiene tal cual.
  No se activa el flag: dos mecanismos para el mismo invariante es lo que se podre.
- **Los datos son ISO strings, no `Timestamp`.** Los casts `d.data() as Order` siguen siendo
  válidos sin tocar nada. Si el proyecto hubiera usado `Timestamp` o `serverTimestamp()`, esta
  migración sería otra conversación.

### La premisa falsa

El pedido asume "si la migración es larga". No es larga: **~150–200 líneas modificadas, un día
de código**. El calendario lo domina un gate de observación, no el trabajo. Eso cambia la
respuesta sobre mitigaciones intermedias (abajo): no conviene invertir en mitigaciones para
comprar tiempo que no hace falta.

---

## Opciones consideradas

### Sobre el patrón del store

**A. Migración directa, llamadas Admin inline.** Reemplazar cada sitio por su equivalente.
Diff mínimo, cero capas nuevas. Riesgo: los 9 listeners son copy-paste; migrar 8 bien y
tipear mal el 9no es un bug invisible.

**B. Capa de abstracción / repositorio (`FirestoreAdapter` con `get/set/delete/onChange`).**
Se descarta. Una interfaz de puerto se paga cuando hay (i) más de una implementación viva,
(ii) tests que necesitan un fake, o (iii) plan de cambiar de base. Acá hay cero tests, una
implementación, un solo consumidor (`store.ts`) y ninguna intención de dejar Firestore. Con
27 sitios de 6 operaciones, la interfaz sería casi tan grande como lo que esconde. Es la
opción que se ve más profesional y envejece peor: alguien tendría que mantenerla, y ese
alguien es una persona sola.

**C. Cinco helpers privados dentro de `store.ts`** (`col()`, `docRef()`, `writeDoc()`,
`deleteById()`, `watch<T>(name, assign)`), sin archivo nuevo ni interfaz exportada.
`watch<T>()` colapsa las 92 líneas de listeners a 9 llamadas de una línea que difieren en dos
cosas: el nombre de la colección y el campo de memoria que asignan.

### Sobre las credenciales

**D. Implementar `.env.example` como está escrito**: leer `FIREBASE_SERVICE_ACCOUNT` con el
JSON en una sola línea y hacer `cert(JSON.parse(...))`, con fallback a
`applicationDefault()`. Requiere branching de credencial en el código y meter una private key
PEM (con `\n`) dentro de una variable de entorno, que es un clásico de errores de escapado.

**E. `GOOGLE_APPLICATION_CREDENTIALS` apuntando al archivo + ADC en Cloud Run.**
`initializeApp()` sin argumento de credencial resuelve ADC en los dos entornos: local toma el
archivo de la variable, Cloud Run toma la identidad del runtime. Cero branching. Es además
**lo que el `.env` local ya tiene configurado**, así que alinea el código con la realidad en
vez de con `.env.example`.

**F. No usar env vars, leer `projectId`/`databaseId` de `firebase-applet-config.json`.** Una
sola fuente de verdad para "a qué base apunto" y a prueba de que AI Studio no inyecte las
variables en la revisión de Cloud Run. Pero deja el config commiteado como dependencia de
runtime para siempre.

### Sobre las reglas finales

**G. `allow read, write: if false` por colección**, manteniendo los bloques actuales.

**H. Un catch-all `match /{document=**} { allow read, write: if false; }`.**

**I. Reglas parciales como paso intermedio** (`allow read: if true; allow write: if false`, o
`request.auth != null`). Ver "Mitigaciones" — no funciona.

---

## Decisión

**Opciones C + E (con F como fallback) + H**, ejecutadas en la secuencia de abajo.

- **C**: helpers dentro de `store.ts`, no capa de abstracción. Los helpers no están para
  desacoplar de Firestore — están para que el bloque de 9 listeners deje de ser copy-paste, que
  es donde vive el riesgo del cambio. Trade-off explícito: con `watch<T>()` ese bloque pasa a
  ser una reescritura y no un swap línea por línea, así que se vuelve más difícil de revisar de
  ojo. Se compensa con la verificación del Paso 3 (editar un doc a mano en la consola).
- **E + F**: `initializeApp()` con ADC, `getFirestore(app, databaseId)`. `projectId` y
  `databaseId` salen de `FIREBASE_PROJECT_ID` / `FIRESTORE_DATABASE_ID`, y si no están, del
  `firebase-applet-config.json`. Se loguea **de qué fuente salió cada uno**. Razón: que el
  server no arranque en producción porque AI Studio no propagó una variable es peor que un
  fallback documentado; apuntar a la base equivocada en silencio es peor que las dos cosas, y
  el log lo hace imposible. `FIREBASE_SERVICE_ACCOUNT` se **borra** de `.env.example` y se
  documenta `GOOGLE_APPLICATION_CREDENTIALS` en su lugar.
- **H**: catch-all deny. La razón es de mantenibilidad, no de seguridad — las dos formas
  cierran igual. Con `if false` por colección, agregar una colección nueva sigue requiriendo
  editar las reglas, y **la regla 5 de `CLAUDE.md` existe precisamente por eso**: es la que se
  incumplió con `tableCloses`. Con el catch-all, el Admin SDK bypassea las reglas, una colección
  nueva no necesita nada, y esa clase de bug se vuelve estructuralmente imposible. La regla 5 de
  `CLAUDE.md` se puede borrar. La consola de Firebase sigue funcionando para arreglar datos a
  mano: usa IAM, no reglas.

### El camino, en orden

Cada paso deja el sistema funcionando y es desplegable por sí solo. La regla que ordena todo:
**cerrar las reglas va último y solo**, porque es lo único que rompe todo a la vez y también lo
único que se revierte en un minuto.

#### Paso 0 — Reconocimiento. No toca código.

1. Comparar las reglas **desplegadas** (consola → Firestore → Reglas) contra
   `firestore.rules` del repo. Con `firebase.json` presente probablemente coincidan, pero hay
   que verlo: si difieren, el repo no es la fuente de verdad y eso cambia el Paso 5.
2. Confirmar el bug de `tableCloses`: cerrar una mesa con pedidos, reiniciar el server, ver si
   el historial sobrevive. Si no sobrevive, queda confirmado y el Paso 2 lo arregla de taquito.
3. Anotar: `projectId`, `databaseId`, service account del runtime de Cloud Run, y si ese SA
   tiene `roles/datastore.user`.
4. **Backup**: `gcloud firestore export` de la base a un bucket. La base fue escribible por
   cualquiera durante semanas; el export es el piso desde el que se recupera si alguien la
   borra mientras esto se hace.

**Qué se rompe:** nada. **Verificación:** tenés el export terminado y los cuatro datos anotados.

#### Paso 1 — `src/lib/firebase-admin.ts`, sin que el store lo use todavía.

Archivo nuevo que exporta `adminDb`, resuelve credencial por ADC, loguea una línea al boot y
hace un **probe**: leer un doc conocido (`establishments/bodegon-palermo`). En producción, si
el probe falla → log FATAL y `process.exit(1)`; en dev, solo warning. Se importa desde
`server.ts` (y así el comentario obsoleto de `server.ts:1-4` pasa a ser verdad, cerrando el
punto 4 de la deuda conocida).

El nombre del archivo es `src/lib/firebase-admin.ts` a propósito: es el que ya cita ese
comentario.

**Qué se rompe:** nada. El store sigue 100% en SDK cliente. Si la credencial está mal, lo ves
en un log de dev, no en producción.

**Verificación:**
- `npm run dev` imprime algo como
  `[Firestore] admin init: project=gen-lang-client-0776464266 (env) database=ai-studio-... (env) credential=ADC` y
  `[Firestore] probe ok: establishments/bodegon-palermo`.
- Si el `database=` no es el largo de AI Studio, pará acá.
- **Desplegar este cambio a producción y mirar los logs de Cloud Run.** Es gratis (nada
  depende de él todavía) y es lo que valida ADC + IAM. La mayoría de las migraciones de esta
  forma fallan porque el camino de ADC se probó al final; acá se prueba primero, cuando el
  rollback es un no-op.

#### Paso 2 — Migrar solo las escrituras. Los listeners quedan en SDK cliente.

Los 11 `setDoc`, el `merge:true`, los 2 `deleteDoc`, los 4 bloques de `writeBatch` y el
`getDocs` de `seedIfEmpty` pasan a `adminDb`. Estado intermedio deliberadamente feo: dos SDKs
conviviendo contra la misma base. Es **seguro**: los writes van por Admin (bypassean reglas),
las lecturas y listeners siguen por cliente (las reglas siguen abiertas), y la memoria queda
coherente porque los listeners del SDK cliente ven los writes de Admin como cualquier otro.

Acá también se borra el guard de `fromCache` en `seedIfEmpty()`, dejando el comentario que
explique por qué ya no hace falta (el Admin SDK no tiene caché local; un `.get()` que no llega
tira, y no sembrar es el comportamiento correcto).

**Qué se rompe:** si se cuela un `undefined` sin pasar por `forFirestore()`, Admin tira y los
`catch` actuales lo tragan con un `console.error` → memoria y Firestore divergen hasta el
reinicio. Es el riesgo de este paso y es por eso que la verificación es endpoint por endpoint.

**Verificación** — manual, y esta lista es el paso (por eso conviene hacerlo de una sentada).
Para cada mutación: (a) la UI refleja el cambio, (b) el doc aparece/desaparece en la consola de
Firestore, (c) no hay `[Firestore]` en la consola del server, y (d) **reiniciar el server y ver
que el dato sigue ahí** — (d) es la única que separa "quedó en memoria" de "se persistió", que
es exactamente el modo de falla.

- Crear pedido desde la vista comensal (QR)
- Cambiar estado de pedido (`Recibido` → … → `Entregado`)
- Cancelar un plato individual (total y parcial)
- Alta/edición y baja de ítem de menú
- Alta/edición y baja de categoría (verificar la **cascada** a `menuItems`)
- Alta/edición y baja de mesa
- Llamar mozo / pedir cuenta, y marcar atendido
- **Cerrar mesa** → y acá tiene que aparecer el doc en `tableCloses`, que hoy no aparece.
  Reiniciar y ver que el historial sobrevive: es el canario que prueba que los writes de Admin
  bypassean las reglas.
- Abrir caja / cerrar caja (verificar que los pedidos quedan estampados con `cashCloseId` y que
  un segundo cierre inmediato da 409)
- `POST /api/seed` (en dev)

#### Paso 3 — Migrar los 9 listeners, agregar liveness, y sacar el SDK cliente.

1. `attachListeners()` pasa a usar `watch<T>(name, assign)` sobre `adminDb`. 92 líneas → ~15.
2. `watch()` registra por colección: si arrancó, timestamp del último snapshot, y último error.
3. `/api/health` deja de ser `{status:'ok'}` fijo. **Implementado en dos endpoints**, porque el
   detalle resultó ser un oráculo de actividad sin autenticación:
   - `GET /api/health` — público, sin auth, siempre HTTP 200: `{ status, time }` con
     `status: 'ok' | 'degraded'`. Nada más.
   - `GET /api/health/details` — `requireAuth` + `requireRole('admin')`:
     `{ status, time, firestore: { listeners: '9/9', lastSnapshotAt, down, errors, probe,
     writePath, heartbeatStream, heartbeatLagMs, … } }`.

   **Este cambio es el que hace seguro el Paso 5**: sin él, el modo de falla "listeners muertos,
   datos falsos, health ok" no es observable. El `writePath` del heartbeat cubre además el caso
   que ni los listeners ni el probe ven, porque los dos son lecturas: una credencial de solo
   lectura deja los 9 listeners en verde mientras ninguna escritura se guarda.
4. Borrar `src/lib/firebase.ts` (se va con él el `getAuth` muerto) y sacar `firebase` de
   `package.json`. Esto no es cosmético: mientras la dependencia exista, alguien puede escribir
   `import { db } from '../lib/firebase'` en un componente y volver a abrir el agujero desde el
   otro lado.

**Qué se rompe:** si un listener no arranca, la memoria queda congelada en los datos seed **y la
app parece funcionar**. Ese es el riesgo del paso, y es el que justifica los puntos 2 y 3.

**Verificación:**
- `GET /api/health/details` **con sesión de admin** → `9/9`, `lastSnapshotAt` reciente,
  `writePath: 'ok'`. El endpoint público `/api/health` solo devuelve `{status, time}`: si esperás
  ver `9/9` ahí vas a creer que el endpoint está roto.
- **Editar un documento a mano en la consola de Firestore** (por ejemplo el `price` de un
  `menuItems`) y ver que el panel lo refleja sin reiniciar. Es la única verificación que prueba
  el listener end-to-end; sin esto no sabés si estás leyendo memoria vieja.
- Repetir el recorrido corto del Paso 2 (crear pedido, cerrar mesa, cerrar caja).
- `npm run lint` limpio.
- `npm run build` y buscar `firestore.googleapis.com` en `dist/assets/` → **no debe haber
  ninguna coincidencia**. Prueba de que el frontend nunca tuvo Firestore, y ahora no puede
  tenerlo.

#### Paso 4 — Desplegar el store en Admin a producción, con las reglas todavía abiertas.

Acá ADC se prueba con el store real. Reglas abiertas todavía: si algo falla, el rollback es
redesplegar el commit anterior, sin tocar reglas.

**Qué se rompe:** el IAM del SA de Cloud Run (`roles/datastore.user`). Síntoma: el probe de
boot del Paso 1 falla y el proceso muere, así que Cloud Run no promueve la revisión. Ese
resultado es preferible a una revisión viva sirviendo datos inventados.

**Verificación y gate:** `/api/health/details` (con sesión de admin) en `9/9` con
`lastSnapshotAt` fresco y `writePath: 'ok'`; un pedido real
desde el celular aparece en el panel; un reinicio de revisión y el dato persiste. **Dejarlo
corriendo un turno de servicio completo antes del Paso 5.** El único escenario que duele de
verdad es "reglas cerradas + store roto"; un día con reglas abiertas lo descarta.

#### Paso 5 — Cerrar `firestore.rules`. Solo esto, nada más en el commit.

```
rules_version = '2';

// El backend llega a Firestore con el Admin SDK (src/lib/firebase-admin.ts), que se autentica
// por IAM y NO evalúa estas reglas — ver ADR-006. Ningún cliente (browser incluido) toca
// Firestore directo: el frontend habla solo con /api/*. Por lo tanto la respuesta correcta
// para todo acceso evaluado por reglas es denegar.
// Catch-all a propósito: una colección nueva queda cerrada por default y no hay que acordarse
// de agregarle una regla (que es lo que pasó con tableCloses).
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

`firebase deploy --only firestore:rules`. Revertir es `git revert` + el mismo comando.

**Qué se rompe:** nada, si el Paso 4 quedó verde. Y si rompe algo, el diagnóstico es único:
**quedó un SDK cliente vivo en alguna parte**. Por eso el Paso 3 saca la dependencia de
`package.json`: para que eso sea imposible y no haya que adivinar.

**Verificación positiva** (que la app sigue): recorrido completo comensal + panel, y
`/api/health/details` con sesión de admin en `9/9` con `writePath: 'ok'`.

**Verificación negativa** (que el agujero se cerró) — es la que importa y casi nadie hace.
Antes de desplegar las reglas nuevas, correr contra la REST API con los valores públicos del
`firebase-applet-config.json`:

```bash
PID=$(node -p "require('./firebase-applet-config.json').projectId")
DB=$(node -p "require('./firebase-applet-config.json').firestoreDatabaseId")
KEY=$(node -p "require('./firebase-applet-config.json').apiKey")
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://firestore.googleapis.com/v1/projects/$PID/databases/$DB/documents/menuItems?key=$KEY"
```

Hoy tiene que devolver `200` con los documentos. Después del deploy tiene que devolver `403`
(`PERMISSION_DENIED`). Guardar las dos salidas: es la evidencia de que el hallazgo está
cerrado, no una impresión. Si el `200` de hoy no se reproduce por ese camino, reproducirlo con
un script mínimo de SDK cliente antes de cerrar — hay que ver el agujero abierto para poder
demostrar que se cerró.

#### Paso 6 — Limpieza y auditoría de datos.

- `CLAUDE.md`: stack pasa a Admin SDK; deuda conocida #1 y #4 cerradas; **borrar la regla 5**
  ("si agregás una colección, agregá su regla") — ya no aplica y ahora es un consejo equivocado.
- `firestore.rules`: el comentario de `cashCloses` cita `SECURITY_BACKLOG.md`, que no existe, y
  describe una decisión que dejó de ser cierta. Se va con el catch-all.
- `.env.example`: borrar `FIREBASE_SERVICE_ACCOUNT`, documentar
  `GOOGLE_APPLICATION_CREDENTIALS` y aclarar que en Cloud Run va sin definir (ADC).
- **Auditoría de datos.** La base fue escribible por cualquiera durante semanas y el store hace
  `d.data() as Order` sin validar, así que un documento adulterado entra a la proyección sin
  pasar por zod y puede reventar un getter. Listar documentos cuyo `establishmentId` no sea
  `bodegon-palermo` ni `cafe-speakeasy`, y revisar los `price` de `menuItems` contra
  `src/db/seedData.ts`. Es la única forma de saber si alguien ya escribió.
- Rotar/borrar la key de service account local (`firebase-service-account.json`) si el trabajo
  ya no la necesita. Es una credencial de larga vida en disco; no está en git, pero está.

**Costo total:** ~150–200 líneas modificadas de 1350. Un día de código concentrado (Pasos 1–3),
más 2–3 días de calendario por el gate de observación del Paso 4.

---

## Consecuencias

### Positivas

- La base deja de ser escribible por internet. Express pasa a ser la frontera de seguridad
  real, no defensa en profundidad, y el corolario de `CLAUDE.md` ("no concluyas que está
  cubierto porque un endpoint valida bien") deja de aplicar.
- El bug de `tableCloses` se arregla como efecto colateral en el Paso 2, y la clase entera de
  bug ("colección nueva sin regla → write que falla en silencio") desaparece con el catch-all.
- Se van dos piezas de código muerto (`getAuth`, `src/lib/firebase.ts`) y una dependencia
  (`firebase`, ~muchos MB). Un `import` accidental desde un componente se vuelve imposible.
- `.env.example` y el comentario de `server.ts:1-4` pasan de describir un diseño imaginario a
  describir el código.
- `/api/health` empieza a reportar algo verificable en lugar de un `ok` constante.

### Negativas y costos aceptados

- **El modo de falla se mueve, no desaparece.** Hoy un write que falla es rutina (y silenciosa).
  Post-migración los writes fallan raro, pero un problema de credencial o IAM tumba los 9
  listeners de una y la app sirve datos seed con cara de sana. Se mitiga con el probe de boot y
  el health de listeners, no se elimina.
- **Los `catch { console.error }` del store siguen ahí.** Doce sitios actualizan memoria después
  de un write que puede haber fallado; solo `openCashRegister` reporta el error hacia arriba.
  Es deuda preexistente y **se deja explícitamente fuera de esta migración** para que el diff
  siga siendo mecánico. Queda como el próximo trabajo obvio sobre `store.ts`.
- **El fallback a `firebase-applet-config.json` mantiene un archivo commiteado como dependencia
  de runtime.** Feo, pero es la alternativa a que el server no arranque si AI Studio no propaga
  una variable. El log de boot que dice de dónde salió cada valor es lo que hace que el fallback
  sea aceptable y no un misterio.
- **Los helpers de C mezclan refactor y migración en el bloque de listeners.** El diff de esas
  92 líneas es una reescritura, no un swap revisable línea por línea. Consciente: se cambia
  revisabilidad del diff por eliminar 9 copias de lo mismo, y se cubre con la verificación de
  editar un doc a mano.
- **Sin tests, la red de seguridad son las checklists de arriba.** No es lo mismo. Es lo que
  hay, y es la razón por la que los pasos están cortados para que cada uno tenga una
  verificación manual barata en vez de haber uno grande.
- Cerrar las reglas también cierra cualquier acceso futuro desde el browser. Si algún día se
  quiere realtime directo Firestore→cliente (en lugar del SSE actual), habrá que escribir
  reglas de verdad y Firebase Auth. Este ADR asume que no, y el SSE ya cubre el caso.

### Mitigaciones intermedias: la respuesta honesta es que no hay ninguna en la capa de reglas

Se evaluaron y se descartan:

- **Borrar `firebase-applet-config.json` del repo.** Inútil. Está en el historial público desde
  los commits `21b1eb0` y `7fb0bf7`; borrarlo del HEAD no lo saca del historial, de los forks,
  ni de los caches. Y un `apiKey` web de Firebase no es un secreto: no autoriza nada por sí
  mismo. Lo que autoriza son las reglas.
- **Rotar el `apiKey`.** No aporta. Las restricciones de API key (referrer HTTP, etc.) no son lo
  que gobierna el acceso a Firestore, y `projectId` + `databaseId` quedan en el historial igual.
- **Cerrar las reglas parcialmente.** No existe. `allow write: if false` rompe todos los writes
  del server. `allow write: if request.auth != null` también, porque el backend usa el SDK
  cliente **sin autenticar**. Las reglas no tienen ningún predicado que distinga "nuestro
  Express" de "un atacante": los dos son tráfico de SDK cliente no autenticado desde una IP
  cualquiera. Esa es la razón de fondo por la que las reglas y el SDK del backend son una sola
  decisión.
- **Loguear el server con Firebase Auth (usuario de servicio / custom token) y gatear las
  reglas por ese uid.** Técnicamente cierra, pero emitir el custom token requiere el Admin SDK,
  o sea que hacés todo el trabajo de credenciales **sin** cobrar la simplicidad del Admin SDK,
  y terminás con reglas que confían en un uid mágico. Estrictamente peor que migrar. Se
  descarta.
- **Validación de campos en las reglas** (por ejemplo, denegar writes que cambien `price`). Ni
  frena el borrado ni la lectura de toda la base, y obliga a mantener las reglas espejando los
  schemas zod. Peor que no hacer nada: da sensación de cobertura.
- **Endurecer Express (rate limit, validación, headers).** Irrelevante para esto: el atacante
  no pasa por Express.

Lo que **sí** conviene hacer hoy mismo, entendiendo que reduce el radio de daño y la
probabilidad de descubrimiento, **no la vulnerabilidad**:

1. **Export de la base a un bucket** (Paso 0.4). Es lo único que te devuelve los datos si
   alguien los borra mañana.
2. **Pasar el repo de GitHub a privado**, si el pipeline de AI Studio lo permite (verificar).
   No cierra nada — quien ya tiene el config lo sigue teniendo, y la base sigue abierta al
   mundo — pero deja de exponerla a los scanners automáticos que barren repos públicos
   buscando exactamente este archivo. Costo ~cero.
3. **Hacer la migración esta semana.** Es la mitigación real y es un día de trabajo. Cualquier
   esfuerzo puesto en mitigaciones parciales está mejor puesto acá.
