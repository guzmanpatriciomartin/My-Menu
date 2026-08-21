# ADR-007 — La cookie de sesión se queda en `SameSite=Lax`: el preview embebido de AI Studio no es un entorno soportado

- **Estado:** **superado por [ADR-008](ADR-008-csrf-por-origin-y-cookie-particionada.md)**
  (2026-08-21). Este ADR asumió que el preview embebido era un artefacto de desarrollo y no el
  entorno de trabajo real; esa premisa era falsa. ADR-008 habilita `SameSite=None` después de
  implementar la verificación de `Origin` que este documento identificó como prerrequisito.
  El análisis de abajo sigue siendo válido y vale leerlo: enumera los tres POST alcanzables por
  CSRF y explica por qué `Authorization: Bearer` no es una opción.
- **Fecha:** 2026-08-20
- **Afecta:** `server.ts` (`SESSION_COOKIE_OPTIONS`), `src/server/auth.ts` (comentario de F-5),
  `src/components/LoginPage.tsx` (chequeo post-login)
- **Relacionado:** ADR-006 (Express es la única frontera de seguridad). F-5 (el token nunca
  vuelve al browser) se re-evalúa acá y se mantiene, con la justificación corregida.

---

## Contexto

### El síntoma, medido

`SESSION_COOKIE_OPTIONS` en `server.ts` define la cookie de sesión como
`httpOnly + SameSite=Lax + Secure(solo en producción) + path=/`.

Dentro de la **vista previa embebida de Google AI Studio** —un iframe cuyo top-level document es
`aistudio.google.com` y cuyo contenido es el dev server— el login responde 200 con `Set-Cookie`
presente, pero la cookie no se guarda ni se reenvía: el documento del iframe está en **contexto
third-party** respecto del sitio de nivel superior, y `SameSite=Lax` no se envía ahí.
Consecuencia: `GET /api/auth/me` devuelve 401 inmediatamente después de un login exitoso.

El backend está sano. Se verificó contra el backend real que el login de la cuenta responde 200,
que el usuario existe en Firestore con su `establishmentId`, y que el `Set-Cookie` sale. El fallo
es exclusivamente de **transporte de la cookie**, no de autenticación ni de datos.

Detalle que importa para el diagnóstico: el fetch **no** es cross-origin. El documento del iframe
y la API comparten origen, así que no hay nada que arreglar con CORS. Lo que gobierna acá es el
*contexto* (third-party por el top-level `aistudio.google.com`), no el origen de la request.

### Lo que se verificó en el código (no asumido)

1. **`SameSite=Lax` es la única defensa CSRF del proyecto.** No hay tokens CSRF, no hay
   double-submit, y no hay verificación de `Origin`/`Referer` en ninguna mutación. El único
   middleware relevante es `helmet` (con CSP desactivada) y el rate limiter.
2. **Hay tres POST autenticados que no leen body**, es decir, alcanzables por un `<form>`
   cross-site (que va como `application/x-www-form-urlencoded`, no dispara preflight, y llega
   al handler porque `express.json()` simplemente no lo parsea):
   - `POST /api/tables/:id/close` (`requireAuth`) — cierra la sesión de mesa y emite el recibo.
   - `POST /api/tables/:id/rotate-token` (`admin`) — invalida el token del QR de una mesa.
   - `POST /api/seed` (`admin`, además env-gated en producción).
   El resto de las mutaciones exige JSON válido contra un schema zod `.strict()`, así que un
   form cross-site les llega con body vacío y muere en 400. **La superficie CSRF real es esa
   lista de tres, y hoy está tapada por `Lax`.**
3. **El SSE del panel usa `new EventSource('/api/realtime')`** (`src/components/AdminView.tsx`).
   `EventSource` no puede setear headers: cualquier esquema de `Authorization: Bearer` deja este
   stream sin forma de autenticarse, salvo mandando el token por query string o reescribiendo el
   consumo del stream sobre `fetch`.
4. **La premisa de F-5 ya está parcialmente erosionada.** `src/components/LoginPage.tsx` hace
   `signInWithEmailAndPassword` con el SDK cliente de Firebase y cambia el ID token por nuestra
   cookie en `POST /api/auth/firebase-login`. O sea: el browser **ya** guarda un ID token y un
   **refresh token** de Firebase en IndexedDB, legibles por JS. Un XSS en ese origen no necesita
   robar nuestro JWT: puede pedir un ID token fresco y acuñar sesiones nuevas, o directamente
   hacer fetches same-origin con `credentials:'include'`. El comentario de `src/server/auth.ts`
   que atribuye a F-5 la protección contra "XSS token-theft" **sobre-declara lo que compra**.
5. **Nadie más consume el preview embebido.** El producto es un panel que el dueño del bar abre
   en su propio navegador o celular. El iframe de AI Studio aparece solo durante el desarrollo.

---

## Opciones consideradas

### A. No cambiar nada. Trabajar en pestaña propia

Costo: cero código. El preview embebido sigue sin servir para loguearse; se usa el botón de abrir
en pestaña nueva. El chequeo post-login ya existente convierte el rebote silencioso en un mensaje
que dice exactamente qué hacer.

### B. `SameSite=None; Secure` en producción

Habilita el iframe y **quita la única defensa CSRF que hay**. Los tres POST sin body del punto 2
pasan a ser explotables desde cualquier página que el dueño del bar visite mientras está logueado:
un `<form method="post">` a `/api/tables/<id>/close` cierra mesas ajenas y emite recibos, y
`rotate-token` rompe QRs impresos. Requiere id de mesa, pero los ids son enumerables desde el
panel y adivinables por fuerza bruta dentro del rate limit de 600/min.

Además paga ese costo por una funcionalidad que **no es confiable**: Safari bloquea cookies
third-party desde 2020 y Chrome sigue restringiéndolas. Se compra un agujero permanente por un
comportamiento que depende del browser y va degradándose.

Y un detalle operativo: `SameSite=None` exige `Secure`, y `Secure` obliga a HTTPS. Hoy
`secure` es `false` fuera de producción precisamente porque el desarrollo pasa por HTTP.
Forzarlo global rompe la prueba desde el celular contra `http://192.168.x.x:3000`
(un origen HTTP no-localhost no almacena cookies `Secure`). O sea: el arreglo para un entorno de
desarrollo rompe otro entorno de desarrollo que sí se usa.

### C. Migrar el frontend a `Authorization: Bearer`

`verifySession` ya soporta el header, así que parece gratis. No lo es:

- **Rompe el SSE del panel.** `EventSource` no manda headers. Las salidas son token por query
  string —que termina en los request logs de Cloud Run, o sea, credenciales en logs— o
  reescribir el consumo del stream sobre `fetch` + `ReadableStream`, incluyendo reconexión
  manual, que hoy `EventSource` da gratis. Código nuevo, sin tests, en el camino del realtime.
- **Cambia una cookie httpOnly de 8h por un bearer legible por JS**, exfiltrable a un servidor
  del atacante con un solo `fetch`.
- **El beneficio que promete es el que ya se tiene.** Bearer no arregla el iframe "mejor": el
  iframe funciona porque no depende de cookies, pero el estado de sesión pasa a vivir en
  `localStorage`/memoria del JS, que es exactamente lo que F-5 quería evitar.

El matiz honesto (punto 4 arriba): F-5 ya no protege contra robo de sesión bajo XSS, porque el
refresh token de Firebase en IndexedDB es un credencial *mejor* para el atacante que nuestro JWT
de 8h. Pero de ahí no se sigue "abandoná F-5": se sigue "el comentario está mal escrito". Sacar
la cookie httpOnly **agrega** un credencial exfiltrable sin quitar el que ya está, y encima rompe
el SSE. Es estrictamente peor.

### D. `SameSite=None; Secure; Partitioned` (CHIPS)

Es la opción que no estaba en la lista y es la mejor de las tres que habilitan el iframe, pero
tampoco alcanza. `cookie@0.7.2` ya soporta el atributo, así que técnicamente sale.

Lo que compra: la cookie queda particionada por sitio de nivel superior, así que una request
subrecurso desde `evil.com` (fetch, img, iframe) cae en la partición de `evil.com`, donde no hay
cookie.

Lo que **no** compra: el CSRF que importa acá es un **form POST top-level**, y una navegación
top-level hacia nuestro sitio es first-party — usa la partición propia y lleva la cookie. Los
tres endpoints del punto 2 quedan igual de expuestos que en la opción B. Sumale que Safari no lo
soporta, que la sesión del iframe y la de la pestaña propia serían dos cookies distintas
(loguearse en una no loguea la otra, con lo confuso que eso es a las 2 AM), y que hay que
espejar el atributo en `clearCookie` o el logout deja de borrar. Complejidad nueva y permanente
por un problema de desarrollo.

### E. Verificar `Origin` en las mutaciones y recién entonces habilitar `None`

La única forma *aceptable* de habilitar el iframe: ~15 líneas de middleware que rechazan toda
request mutante cuyo `Origin` no coincida con el host propio. `Origin` viaja en todo POST
cross-site, form incluido, así que cubre la superficie del punto 2 y además deja una defensa CSRF
real e independiente de `SameSite`.

Por qué no ahora: su modo de falla es "todas las escrituras devuelven 403 y no sé por qué".
Depende de que el proxy de Cloud Run propague `Host` sin reescribirlo, y de que el `Origin` del
preview coincida con lo que se espera. Para un solo desarrollador, meter un middleware que puede
tumbar todas las mutaciones a cambio de habilitar un iframe de desarrollo es una mala relación
riesgo/beneficio. Vale la pena **el día que haga falta `SameSite=None` por una razón de
producto**, no antes.

---

## Decisión

**Se mantiene `SameSite=Lax` en todos los entornos. El preview embebido de AI Studio no es un
entorno soportado.** Opción A.

Las tres cosas concretas que quedan:

1. **`SESSION_COOKIE_OPTIONS` no se toca.** Ni `None`, ni `Partitioned`, ni flag por entorno.
   Un flag que en dev pone `sameSite:'none'` obliga a `secure:true`, y eso rompe la prueba desde
   el celular por HTTP en LAN — cambiar un entorno de desarrollo roto por otro no es una mejora,
   y agrega una divergencia dev/prod en el camino de auth, que es el peor lugar para tenerla.
2. **El chequeo post-login de `src/components/LoginPage.tsx` se queda y es el entregable de esta
   decisión.** No habilita el uso embebido: convierte un 401 indistinguible de "contraseña mal"
   en una instrucción accionable. Con esto, el problema deja de costar tiempo aunque no se
   arregle.
3. **Se corrige el comentario de F-5 en `src/server/auth.ts`.** La política se mantiene; la
   justificación escrita es falsa hoy y va a hacer tomar una mala decisión a alguien en seis
   meses. Redacción propuesta, en inglés como el resto: el frontend usa solo la cookie porque
   (a) `EventSource` no puede mandar headers, así que la cookie es lo que hace funcionar
   `/api/realtime`, y (b) no agrega un credencial exfiltrable más. **No** porque proteja la
   sesión contra XSS: el SDK cliente de Firebase ya deja un refresh token en IndexedDB, y ese es
   hoy el credencial más valioso del browser.

### Cómo se verifica que la decisión quedó bien aplicada

- Abrir la app en pestaña propia (no en el iframe), loguearse, y confirmar que `/api/auth/me`
  devuelve 200 y que el panel monta. Es el camino real de producción.
- En el iframe: loguearse y confirmar que aparece **el mensaje** de cookie no guardada, no un
  rebote silencioso al login. Eso es lo que se está entregando.
- `POST /api/auth/logout` en pestaña propia y confirmar que `/api/auth/me` pasa a 401: si algún
  día alguien toca los atributos de la cookie, `clearCookie` deja de matchear y el logout se
  vuelve decorativo. Este chequeo es el canario de esa clase de cambio.

---

## Consecuencias

### Positivas

- La única defensa CSRF del proyecto (`Lax`) sigue en pie, y los tres POST sin body siguen
  tapados sin escribir código.
- Cero código nuevo en el camino de auth, que es el camino donde un bug no tiene red de
  contención (ADR-006).
- El SSE del panel sigue funcionando con `EventSource`, sin token en query string ni cliente
  SSE propio.
- Queda escrito por qué **no** hacerlo, que es el punto: el próximo impulso de "pongo
  `SameSite=None` y listo" ahora choca contra un documento que enumera los tres endpoints que
  eso abre.

### Negativas y costos aceptados

- **El preview embebido de AI Studio queda inutilizable para todo lo que requiera sesión.** Se
  acepta: hay un botón para abrir en pestaña propia. El costo es un click por sesión de trabajo.
- **La CSRF de los tres POST sin body sigue existiendo como riesgo latente**, solo mitigada por
  un atributo de cookie. Si algún día `SameSite=None` se vuelve necesario por producto (embeber
  el panel en otro sitio, por ejemplo), la opción E deja de ser opcional y pasa a ser
  prerrequisito. Queda anotado acá para no descubrirlo en ese momento.
- **El refresh token de Firebase en IndexedDB es la exposición XSS real y este ADR no la
  arregla.** Es un hallazgo aparte, de la superficie de Firebase Auth, no de la cookie de
  sesión. Lo que sí se arregla es el comentario que hacía creer que estaba cubierto.
- El diagnóstico de `LoginPage` es un parche de UX sobre una limitación del entorno: si mañana
  Chrome cambia el comportamiento en iframes, el mensaje puede quedar desactualizado. Costo
  chico y visible.
