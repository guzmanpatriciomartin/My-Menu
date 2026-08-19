# Agentes — Mi Menú

Setup de subagentes de Claude Code para este proyecto. Cuatro roles especializados, más el
contexto compartido que todos heredan.

## Cómo está armado

| Pieza | Archivo | Qué hace |
|---|---|---|
| Contexto del proyecto | `CLAUDE.md` (raíz) | Stack, modelo de datos, patrón del store, convenciones, deuda conocida. **Se carga solo en cada sesión.** |
| Developer | `.claude/agents/developer.md` | Implementa, corrige, refactoriza |
| Security Reviewer | `.claude/agents/security-reviewer.md` | Audita. Solo lectura, sin Edit ni Write |
| QA / Tester | `.claude/agents/qa-tester.md` | Diseña y escribe tests |
| Architect | `.claude/agents/architect.md` | Decisiones de diseño y ADRs |

La pieza que hace que esto funcione es `CLAUDE.md`. Se carga automáticamente en toda sesión y
todos los subagentes lo heredan, así que **el stack real está siempre presente sin que lo
pegues**. Ese era el problema original: un agente sin contexto asume Next.js + MongoDB y te
escribe schemas de Mongoose para un proyecto que usa Firestore.

**Corolario práctico: no repitas el stack, la estructura ni el modelo de datos cuando invocás
un agente.** Ya lo tienen. Pedí la tarea directo.

## Cómo los invocás

Por nombre, en lenguaje natural:

```
Usá el agente security-reviewer para auditar el cierre de mesa
```

O dejá que Claude delegue solo: el campo `description` de cada agente define cuándo aplica, así
que "revisá esto antes de mergear, toca el cierre de caja" suele bastar para que elija el
correcto.

Lo que ya **no** hace falta:

- Abrir una conversación separada por rol. Cada invocación arranca con contexto propio y limpio.
- Pegar archivos. Los agentes leen el repo ellos mismos con Read, Grep y Glob.
- Mantener el historial vivo para acumular contexto. `CLAUDE.md` cumple esa función, y no se
  degrada.

### Corren en paralelo

La ventaja concreta sobre el modelo de una-pestaña-por-rol: podés lanzar varios sobre el mismo
cambio a la vez.

```
Lanzá security-reviewer y qa-tester en paralelo sobre el diff de TablePOS
```

Los dos leen el mismo diff sin pisarse, porque ninguno de los dos escribe código de producción.
Lo que **no** conviene paralelizar es dos agentes que editen los mismos archivos.

## Cuándo usar cada uno

### `developer`
Features, bugs, refactors, componentes, endpoints. Hereda todas las herramientas: edita
archivos y corre `npm run lint`.

Sabe que un cambio típico atraviesa cinco archivos a la vez —`src/types.ts`,
`src/server/schemas.ts`, `src/server/store.ts`, `server.ts` y el componente— y que la
inconsistencia entre ellos es el bug más común del proyecto.

### `security-reviewer`
**Solo lectura, a propósito** (`tools: Read, Grep, Glob, Bash`). Audita sin poder tocar nada, lo
que elimina el riesgo de que "arregle" algo de paso y te mezcle el fix con el hallazgo.

Corré este agente antes de mergear cuando el cambio toque:

- Endpoints públicos del comensal (menú, pedidos por QR, llamados de mesa, SSE)
- `requireAuth` / `requireRole`, o de dónde sale el `establishmentId`
- Cierre de caja, cierre de mesa, métricas — cualquier cosa con plata
- `firestore.rules`
- La segmentación de SSE (`shouldDeliver`)

Tiene instruido no reportar el hallazgo de `firestore.rules` abierto en cada corrida (ya es
conocido y aceptado), y **bajar la severidad de lo que no pueda explicar cómo se explota**. Eso
es deliberado: un reporte con quince hallazgos plausibles se ignora entero.

### `qa-tester`
El proyecto no tiene infraestructura de testing, así que la primera corrida propone el setup
—Vitest por defecto, el toolchain de Vite ya está— en lugar de escribir tests que no pueden
correr.

Sabe qué es testeable hoy sin mocks (`src/server/metrics.ts` y `src/server/time.ts` son
funciones puras) y qué requiere mockear Firestore o inyectar la dependencia, porque
`src/server/store.ts` importa `db` a nivel de módulo y es un singleton con estado mutable.

### `architect`
Antes de features grandes, para modelar datos nuevos, evaluar deuda, o planear la migración al
Admin SDK. Escribe ADRs en `docs/adr/`.

Tiene instruido responder "lo que hay alcanza, no hagas nada" cuando corresponda, y nombrar el
**camino** de migración —el orden de los pasos y qué se rompe en cada uno— no solo el estado
final.

## Checklist por feature

### Desarrollo
- [ ] Los cinco archivos habituales quedaron consistentes
- [ ] `npm run lint` (`tsc --noEmit`) pasa
- [ ] Colección nueva de Firestore → su regla en `firestore.rules`
- [ ] Env var nueva → documentada en `.env.example`
- [ ] Probado a mano en el navegador, en las dos vistas que toca (admin y comensal)

### Seguridad — obligatorio si el cambio toca la lista de `security-reviewer`
- [ ] Auditado antes de mergear
- [ ] Los hallazgos CRÍTICO y ALTO, resueltos o aceptados explícitamente

### Cierre
- [ ] Sin secrets: `git grep -iE "apikey|secret|password|token"` antes del commit
- [ ] `git status` antes de `git add` — que no se cuele un cookie jar, un `db_temp.json` ni una
      service-account key
- [ ] Decisión arquitectónica → ADR en `docs/adr/`

## Mantener el setup

`CLAUDE.md` es la fuente de verdad. Cuando cambie el proyecto, actualizalo ahí primero: los
cuatro agentes lo heredan, así que no hay que propagar a mano.

Los cuerpos de los agentes solo tienen **rol, prioridades y formato de salida**. Si te encontrás
copiando datos del stack a un agente, va en `CLAUDE.md`.

Qué actualizar cuando cambien las cosas:

| Si pasa esto | Actualizá |
|---|---|
| Se integran pagos | `security-reviewer`: firma del webhook, monto server-side, idempotencia |
| El backend migra al Admin SDK | `CLAUDE.md`: cambia cuál es la frontera de seguridad real |
| Se activa `strict` en TypeScript | `developer`: pasarían a poder usarse uniones discriminadas |
| Se instala un framework de tests | `qa-tester`: saca la advertencia de setup, poné las convenciones |
| Los usuarios dejan de estar hardcodeados | `CLAUDE.md` y `security-reviewer`: cambia el modelo de auth |

## Notas sobre el formato

Los agentes usan cuatro campos de frontmatter: `name`, `description`, `tools`, `model`.

`tools` omitido significa heredar todas — así está `developer`. Cuando está presente es para
**restringir**, como en `security-reviewer`.

Hay más campos disponibles (`permissionMode`, `disallowedTools`, `memory`, `maxTurns`,
`isolation`), pero este setup no los usa. En particular `permissionMode` no está seteado a
propósito: valores como `bypassPermissions` o `auto` relajarían el flujo de aprobación de
herramientas, y acá conviene que las ediciones y los comandos pasen por la aprobación normal.

Referencia: [subagentes](https://code.claude.com/docs/en/sub-agents) ·
[CLAUDE.md y memoria](https://code.claude.com/docs/en/memory)
