# Security Backlog

Estado al **2026-08-13** (commit `12fbfaa`).

---

## ⚠️ RIESGO ACEPTADO — Firestore abierto a Internet

**Severidad: CRÍTICA. Aceptado conscientemente mientras el proyecto sea una demo.**

### Qué pasa

`firestore.rules` permite `allow read, write: if true` en las cinco colecciones
(`establishments`, `categories`, `menuItems`, `tables`, `orders`). La configuración de
Firebase (`firebase-applet-config.json`) es pública por diseño y está en el repo.

La combinación significa que **cualquier persona en Internet puede leer y escribir la
base de datos directamente**, usando el SDK o la API REST de Firestore, **sin pasar por
el servidor Express**. Toda la seguridad de la capa `/api` (sesión, aislamiento por
tenant, precios server-side) queda esquivable: no está rota, simplemente se la puede
saltear.

### Por qué está así

El backend usa el **SDK cliente** de Firebase (`src/lib/firebase.ts`), no `firebase-admin`.
El SDK cliente está sujeto a las reglas, así que **si las reglas se cierran, el servidor
deja de poder escribir**. Las dos cosas van atadas.

El intento de usar `firebase-admin` (que ignora las reglas legítimamente y permitiría
cerrarlas) fue revertido en `a6cf0bb` porque requiere credenciales de service account /
ADC que no están disponibles en el runtime de AI Studio. Es una restricción real de la
plataforma de deploy, no un descuido.

### Condiciones bajo las que este riesgo es aceptable

Este riesgo **solo** es tolerable mientras se cumplan TODAS estas condiciones:

- [ ] La aplicación es una **demo**, sin usuarios finales reales.
- [ ] **No se cargan datos reales de clientes**: nombres, teléfonos, direcciones,
      comentarios reales de comensales, ni nada personal identificable.
- [ ] **No hay cobros ni integración de pagos** (MercadoPago u otra). Los precios se
      pueden reescribir desde afuera, así que cualquier cobro sería fraudulento.
- [ ] Los datos son descartables: si alguien borra o corrompe la base, no se pierde nada
      de valor.

### Cuándo deja de ser aceptable (disparadores)

Cerrar el agujero **antes** de cualquiera de estas cosas:

1. Que entre **un solo bar real** con datos reales.
2. Que se conecte **cualquier medio de pago**.
3. Que se publique la URL fuera de un círculo de confianza.

### Cómo cerrarlo cuando llegue el momento

1. **Firebase Auth + reglas por usuario** (la opción compatible con AI Studio): el
   servidor se autentica contra Firestore y las reglas validan `request.auth`, en vez de
   `if true`. Permite cerrar el acceso anónimo sin dejar de usar el SDK cliente.
2. **Volver a `firebase-admin`** donde sí hay credenciales (Cloud Run con ADC), con
   reglas `allow read, write: if false`. Requiere detectar el entorno o cambiar de
   plataforma de deploy. La implementación de referencia existe: ver el commit `3027517`
   (`src/lib/firebase-admin.ts`), revertido en `a6cf0bb`.

---

## Lo que SÍ está protegido (capa `/api`)

Todo esto sigue vigente y verificado en runtime. Protege el acceso **a través del
servidor**; no protege contra el acceso directo a Firestore descrito arriba.

| Control | Estado |
|---|---|
| Auth server-side (JWT en cookie httpOnly, scrypt) | ✅ |
| Token de sesión nunca expuesto al JavaScript | ✅ |
| Aislamiento multi-tenant: `establishmentId` sale de la sesión, nunca del cliente | ✅ |
| Ownership check en todas las mutaciones (IDOR → 404) | ✅ |
| Guard de rol (`waiter` no toca el catálogo → 403) | ✅ |
| Precios recomputados server-side desde el catálogo | ✅ |
| Lookup de pedidos del comensal scopeado por tenant + mesa | ✅ |
| SSE segmentado por tenant y mesa | ✅ |
| Validación zod `.strict()` (sin mass-assignment) | ✅ |
| Rate limiting (global + login estricto) | ✅ |
| Error handler central (sin fuga de `e.message`) | ✅ |
| `helmet`, body limit 100kb, `clearCookie` con atributos | ✅ |
| `/api/seed` admin-only + bloqueado en producción | ✅ |
| `AUTH_SECRET`: el server aborta el arranque si falta en producción | ✅ |

---

## Observaciones menores abiertas

### O-2 · `GET /api/establishments/:id` público sin acotar campos — BAJO
Devuelve el establecimiento completo por id arbitrario. Los campos son de baja
sensibilidad (nombre, descripción, color, logo) y el comensal los necesita al escanear el
QR. **Accionar si** se agregan campos sensibles al modelo `Establishment`.

### O-3 · Rate limit en memoria, no compartido entre instancias — BAJO
Los contadores viven en el proceso. Con varias instancias (scale-out) el limitador de
login sería evadible rotando de instancia. **Accionar al** escalar horizontalmente:
mover el store a Redis.

### O-1 · Dependencia `firebase-admin` huérfana en `package.json` — LIMPIEZA
Quedó declarada tras el revert a SDK cliente, pero ya no se importa. Sin impacto de
seguridad; conviene removerla para reducir superficie de supply-chain.

### `strictNullChecks` apagado en `tsconfig.json` — INFORMATIVO
Reduce las garantías del compilador sobre null-safety; el código lo compensa con chequeos
explícitos. Recomendable activarlo a futuro.

---

## Requisitos de entorno

- `AUTH_SECRET` — obligatorio en producción (el server no arranca sin él).
- `.env` y las claves de service account están cubiertas por `.gitignore`. **Nunca**
  committear una private key.
