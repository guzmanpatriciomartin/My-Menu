# ADR-008 — Verificación de `Origin` como defensa CSRF, y cookie de sesión `SameSite=None; Partitioned` sobre HTTPS

- **Estado:** aceptado
- **Fecha:** 2026-08-21
- **Afecta:** `server.ts` (`sessionCookieOptions`, `requireSameOrigin`)
- **Relacionado:** **revierte la decisión de ADR-007.** ADR-006 (Express es la única frontera
  de seguridad). F-5 (el token nunca vuelve al browser) se mantiene sin cambios.

---

## Contexto

ADR-007 decidió mantener la cookie en `SameSite=Lax` y no soportar el preview embebido de AI
Studio, con el argumento de que el preview es un artefacto de desarrollo y la app real se usa
en una pestaña propia.

**Esa premisa era incorrecta.** El desarrollo de este proyecto ocurre dentro de AI Studio: es
el entorno de trabajo, no una vista accesoria. Con `SameSite=Lax` el login es inutilizable ahí
—responde 200, la cookie se descarta, y el panel rebota al login— así que la consecuencia real
de ADR-007 no era "usá otra pestaña" sino "no podés desarrollar".

El razonamiento técnico de ADR-007 sigue siendo válido en un punto y hay que respetarlo:
`SameSite=Lax` era **la única defensa CSRF del proyecto**. Tres POST autenticados no leen body
y por lo tanto son alcanzables por un `<form>` cross-site (que viaja como
`x-www-form-urlencoded`, no dispara preflight, y llega al handler porque `express.json()`
simplemente no lo parsea):

- `POST /api/tables/:id/close` — cierra la sesión de mesa y emite el recibo
- `POST /api/tables/:id/rotate-token` — invalida el token del QR de una mesa
- `POST /api/seed`

El resto de las mutaciones exige JSON contra un schema zod `.strict()`: un form cross-site les
llega con body vacío y muere en 400.

Por eso pasar a `SameSite=None` **sin nada más** habría sido quitar la única defensa CSRF. Lo
que ADR-007 nombró como el prerrequisito para poder hacerlo —verificar `Origin`— es lo que este
ADR implementa.

## Decisión

### 1. `requireSameOrigin`, montado antes de todas las rutas

Middleware sobre `/api` que rechaza con 403 cualquier request mutante (`POST`, `PUT`, `PATCH`,
`DELETE`) cuyo header `Origin` no coincida con el origen propio ni esté en `ALLOWED_ORIGINS`.

Decisiones de diseño:

- **El origen propio se computa del `Host` de la request**, no se hardcodea. Así funciona sin
  cambios detrás del proxy de AI Studio y en Cloud Run, que tienen hostnames distintos.
- **La ausencia de `Origin` se permite.** `curl` y los clientes programáticos no lo envían, y un
  browser haciendo una escritura cross-site siempre lo envía. Es el mismo trade-off de Django y
  Rails. Un atacante no puede suprimir el header desde una página.
- **Se monta antes de las rutas**, no por endpoint, para que no se pueda agregar un endpoint
  mutante sin la verificación. Esa es la falla que hizo posible la exposición original.
- `GET`/`HEAD`/`OPTIONS` pasan sin chequeo: no mutan, y bloquearlos rompería la navegación
  normal y el SSE.

Esta defensa es **independiente de `SameSite`**, que es exactamente lo que se necesitaba.

### 2. Atributos de cookie derivados por request

`sessionCookieOptions(req)` reemplaza la constante `SESSION_COOKIE_OPTIONS`:

| Protocolo | Atributos |
|---|---|
| HTTPS (`req.secure`, vía `X-Forwarded-Proto` con `trust proxy`) | `SameSite=None; Secure; Partitioned` |
| HTTP | `SameSite=Lax` |

Por qué se deriva por request y no por `NODE_ENV`:

- `SameSite=None` **exige** `Secure`, y una cookie `Secure` se descarta en orígenes
  `http://localhost`. Una constante global rompería el desarrollo local directo o el preview,
  nunca podría servir a los dos.
- `clearCookie` solo borra la cookie cuando `path`/`sameSite`/`secure`/`partitioned` coinciden
  con los del `Set-Cookie` original. Derivar de la misma función en login y logout garantiza que
  coincidan; con dos caminos separados el logout dejaría la sesión viva.

`Partitioned` (CHIPS) va junto con `None` porque Chrome está eliminando las cookies de terceros
sin particionar; sin él esto dejaría de funcionar por su propio calendario, no por un cambio
nuestro.

## Consecuencias

### Se acepta

- **La sesión del contexto embebido y la de la pestaña propia son cookies distintas** (efecto
  de `Partitioned`). Loguearse en una no loguea en la otra. Es el costo de que el preview
  funcione y no tiene vuelta: es cómo funciona CHIPS.
- **Safari no soporta `Partitioned`.** Ahí la cookie particionada no se almacena, así que el
  preview embebido no va a funcionar en Safari. El desarrollo ocurre en Chrome; la app en una
  pestaña propia funciona igual en todos los browsers porque ese camino sigue en `Lax`.
- **La superficie CSRF ahora depende de que el proxy propague `Host` sin reescribirlo.** Si un
  intermediario reescribe `Host` a un valor distinto del que ve el browser, el origen propio
  calculado no coincide y **todas las escrituras devuelven 403**. Ese es el modo de falla a
  reconocer: "no puedo guardar nada y no sé por qué" apunta acá, y se diagnostica con el log
  `csrf_origin_rejected`, que incluye el origen recibido.

### Se gana

- CSRF cubierto para **todas** las mutaciones, no solo los tres POST sin body que `Lax` tapaba
  por accidente. Es una mejora neta de seguridad respecto del estado anterior, no un
  intercambio.
- El desarrollo dentro de AI Studio funciona.

### Qué NO cambia

- F-5 sigue en pie: el token no vuelve al browser en el body. El SSE sigue dependiendo de la
  cookie porque `EventSource` no puede setear headers, que es la razón por la que migrar a
  `Authorization: Bearer` fue descartado en ADR-007 y sigue descartado.
- El aislamiento por `establishmentId` no se toca.

## Verificación

Medido, no inferido:

| Caso | Resultado |
|---|---|
| `Set-Cookie` sobre HTTP | `HttpOnly; SameSite=Lax` |
| `Set-Cookie` con `X-Forwarded-Proto: https` | `HttpOnly; Secure; Partitioned; SameSite=None` |
| `POST /api/tables/:id/close` con `Origin: https://evil.example.com` | 403 `Origen no permitido` |
| El mismo POST con `Origin` propio | 200 |
| El mismo POST sin header `Origin` (curl) | 200 |
| `GET /api/auth/me` con `Origin` atacante | 200 (no se bloquean lecturas) |
| Login + sesión + panel en el navegador, same-origin | 200 / 200 / panel carga |

Lo que **no** se pudo verificar acá: el iframe real de AI Studio. La cadena de atributos que
requiere (`None`, `Secure`, `Partitioned`) está confirmada en la respuesta HTTP, pero que el
browser la acepte en ese contexto concreto solo se comprueba usándolo.
