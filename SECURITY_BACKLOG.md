# Security Backlog — deuda técnica pendiente

Estado al **2026-08-12**. Todos los hallazgos **CRÍTICO / ALTO / MEDIO** del historial
de auditoría están **cerrados** (auth server-side, aislamiento multi-tenant real,
precios server-side, SSE segmentado, validación, rate-limit, hardening).

Lo que queda son observaciones **de bajo riesgo / escalado**, ninguna explotable en el
despliegue single-instance actual. Se documentan acá para no perderlas.

---

## Abiertas

### O-2 · `GET /api/establishments/:id` público sin acotar campos — BAJO
- **Dónde:** `server.ts` (endpoint público del flujo QR del comensal).
- **Qué:** devuelve el `Establishment` completo por `id` arbitrario. Permite enumerar
  la existencia de tenants por id.
- **Por qué es aceptable hoy:** los campos son de baja sensibilidad (nombre, descripción,
  color de acento, logo) y el comensal necesita leerlos al escanear el QR.
- **Cuándo accionar:** si se agregan campos sensibles al modelo `Establishment`
  (datos de facturación, contacto privado, tokens de integración, etc.), acotar la
  proyección a los campos públicos.

### O-3 · Rate-limit en memoria, no compartido entre instancias — BAJO
- **Dónde:** `server.ts` (`apiLimiter` global + `loginLimiter` de login, `express-rate-limit`
  con store en memoria).
- **Qué:** los contadores viven en el proceso. Con múltiples instancias (Cloud Run
  scale-out) no se comparten, y el `loginLimiter` sería evadible rotando de instancia.
  También se resetean al reiniciar.
- **Por qué es aceptable hoy:** correcto para despliegue single-instance.
- **Cuándo accionar:** al escalar horizontalmente, migrar el store del rate-limit a
  uno compartido (Redis, o la colección de Mongo cuando exista).

---

## Informativa (no es un hallazgo de seguridad)

### `strictNullChecks` está OFF en `tsconfig.json`
- Reduce las garantías del compilador sobre null-safety. El código lo compensa con
  chequeos explícitos (p. ej. `CreateOrderResult` en `store.ts` usa una interface con
  campos opcionales en vez de una union discriminada, porque el narrowing por booleano
  no funciona con la flag apagada).
- **Recomendación:** activar `strictNullChecks` a futuro y resolver los tipos que
  emerjan; permitiría modelar resultados con unions discriminadas más seguras.

---

## Referencia — cerrado en el historial de auditoría

| Sev. | Hallazgo | Cerrado en |
|---|---|---|
| CRÍTICO | Sin auth backend real (login cosmético en cliente) | auth server-side (JWT httpOnly) |
| CRÍTICO | IDOR horizontal en mutaciones (sin scope de tenant) | scope desde sesión + ownership |
| ALTO | Secret JWT por defecto no falla en producción (O-1) | `throw` en `NODE_ENV=production` |
| ALTO | Exposición del token de sesión al browser (R-1/R-2) | revert a solo-cookie httpOnly |
| ALTO | Lectura cross-tenant de órdenes | endpoint público eliminado + lookup scopeado |
| ALTO | Precios confiados al cliente | recomputo server-side desde catálogo |
| ALTO | SSE broadcast global | segmentación por tenant + mesa |
| MEDIO | Mass-assignment / validación | zod `.strict()` en todos los bodies |
| MEDIO | Enumeración de usuarios por timing en login | dummy hash en el mismo code path |
| MEDIO | Sin rate limiting | `express-rate-limit` global + login |
| MEDIO | Fuga de `e.message` en 500 | error handler central genérico |
| MEDIO | Race conditions del file store | estado en memoria + persist atómico |
| BAJO | Hardening (helmet, body limit, clearCookie) | aplicado |
| BAJO | Salt reusado entre usuarios seed (R-4) | salt único por usuario |
| BAJO | `db_temp.json` versionado | `.gitignore` |
