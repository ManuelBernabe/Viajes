# Plan 1 — Viajes y reservas, listos sin conexión (versión recortada al viaje del 1 de octubre)

**Goal:** Que Manuel pueda usar la app en un viaje real **antes del jueves 1 de octubre de 2026**: crear el viaje, añadir sus reservas con los adjuntos (PDF, fotos), ver el QR de la tarjeta de embarque a un toque y tenerlo todo **disponible sin conexión** en el iPhone.

**Architecture:** Sobre el Plan 0. El servidor guarda hogar, viajes, reservas y adjuntos en SQLite con una `version` por fila que sale de un contador global (interceptor de `SaveChanges`); toda escritura es un *upsert* idempotente por UUID generado en el cliente. El cliente guarda una copia completa en IndexedDB, aplica cada cambio en local al instante, lo encola y lo envía cuando hay red; baja los cambios con `GET /api/sync?since=`. Los adjuntos se suben aparte y se descargan al móvil para los viajes marcados o próximos.

**Tech Stack:** Lo del Plan 0 más, en el cliente, `react-router-dom` (rutas), `jsqr` (leer QR de imágenes y de páginas de PDF), `qrcode` (redibujar el QR nítido) y `pdfjs-dist` (mostrar PDF sin depender del visor de iOS y leer su QR).

**Spec:** `docs/superpowers/specs/2026-09-26-app-viajes-design.md`, revisión 2, secciones 5, 8, 9 y 10. **Este plan adelanta la parte de «sin conexión» del Plan 3** (sincronización, cola y descarga de adjuntos) porque sin ella la app no cumple su objetivo en el aeropuerto, y **deja para después**: invitaciones y permisos (Plan 2), caja fuerte (Plan 4), Gmail (Plan 5), Litestream y el sistema de diseño completo.

## Decisiones de recorte (acordadas el 26/09/2026)

| Decisión | Motivo |
|---|---|
| **Un hogar por usuario, creado solo al registrarse**; sin invitaciones | La pareja usa la misma cuenta durante este viaje. Las tablas ya son las de la spec para no rehacer nada en el Plan 2 |
| **Se leen QR también dentro de los PDF** (primeras 3 páginas) | Las tarjetas de embarque suelen llegar en PDF; con `pdfjs-dist` ya renderizado, leerlo cuesta poco. La spec lo dejaba fuera de v1, pero es lo que más valor da en el aeropuerto |
| **Copia de seguridad manual** de `viajes.db` antes del viaje (`railway ssh` + `sqlite3 .backup` o copia del fichero) | Litestream se monta después; el volumen de Railway no se ha perdido nunca en el Plan 0 |
| Diseño **sencillo y legible** con variables CSS, modo oscuro, márgenes seguros y pestañas abajo | El sistema de diseño completo se pule cuando la app funcione |
| Zona horaria: **selector con la zona del móvil por defecto** y las 30 más comunes arriba | Elegir entre 400 zonas en un formulario móvil es lento |

## Global Constraints

- Las del Plan 0 (iPhone instalado, un servicio, cookie, `DATA_DIR`, 20 MB, textos en español, identificadores en inglés, nunca «claude», secretos solo en Railway).
- **Regla de oro** (spec §8): **toda** escritura asigna `version` nueva, en un único sitio (interceptor de `SaveChanges`), probada **desde filas antiguas**.
- **Toda autorización en `AccessService`**: ninguna consulta devuelve filas sin pasar por él.
- Los ids los genera el cliente (`crypto.randomUUID()`); el servidor los acepta como vienen y **reenviar no duplica**.
- Instantes en milisegundos UTC (`*_ms`); horas de reservas como texto local + zona IANA; `start_utc_ms` derivado en el servidor **y** en el cliente (para ordenar sin red).
- Tests: servidor contra SQLite real; cliente con Vitest y `fake-indexeddb`.
- Commits: los hace Manuel o Claude con su permiso, en inglés, sin `Co-Authored-By`.

## Calendario

| Día | Entrega |
|---|---|
| Viernes 26 | Plan escrito. Tareas 1 y 2 (servidor) con tests. Empezar Tarea 3 |
| Sábado 27 | Tareas 3 y 4: la app crea viajes y reservas con adjuntos y las enseña. **Primera prueba en el iPhone** |
| Domingo 28 – lunes 29 | Tarea 5: QR, PDF, sin conexión, indicador. Tarea 6: ajustes y pulido |
| Martes 30 | Versión completa desplegada. Copia de seguridad. Manuel carga su viaje |
| Miércoles 1 | Margen para arreglar lo que salga |

---

### Task 1: Modelo de datos, contador de versiones y acceso

**Files:**
- Create: `server/Viajes.Api/Data/Household.cs`, `HouseholdMember.cs`, `Trip.cs`, `Booking.cs`, `Attachment.cs`, `ChangeCounter.cs`, `VersionInterceptor.cs`, `server/Viajes.Api/Access/AccessService.cs`, `server/Viajes.Api/Data/Migrations/*_Trips.cs`
- Modify: `AppDbContext.cs`, `DataSetup.cs`, `Auth/AuthEndpoints.cs` (crear el hogar al registrarse)
- Tests: `server/Viajes.Tests/VersionTests…` → `ChangeVersionTests.cs`, `AccessTests.cs`

**Modelo** (spec §5, sin las tablas de invitaciones ni caja fuerte todavía):

```
households         Id, Name, AdminUserId, Version, DeletedAtMs
household_members  HouseholdId, UserId, Role, Version, DeletedAtMs
trips              Id, HouseholdId, Title, Destination, StartDate, EndDate, CreatedBy, Version, DeletedAtMs
bookings           Id, TripId, Type, Title, StartLocal, StartTz, StartPlace, EndLocal, EndTz, EndPlace,
                   StartUtcMs, Reference, Address, Notes, CreatedBy, Version, DeletedAtMs
attachments        Id, BookingId, FileKey, Name, Mime, Size, QrText, Uploaded, CreatedBy, Version, DeletedAtMs
change_counter     Id (=1), Value
```

- `IVersioned { long Version; long? DeletedAtMs; }`. El interceptor, en `SavingChanges`, para cada entidad `IVersioned` añadida o modificada, hace `UPDATE change_counter SET Value = Value + 1 RETURNING Value` **en la misma transacción** y se lo asigna. Un borrado es `DeletedAtMs = ahora` (modificación → versión nueva).
- `AccessService.HouseholdOf(userId)` → hogar del miembro (o null); `CanSeeTrip(userId, tripId)`; `TripOf(bookingId)`; `BookingOf(attachmentId)`. Todo en consultas que ya filtran por hogar.
- Al registrarse: hogar «Casa» con el usuario como `admin`. Al iniciar sesión un usuario sin hogar (cuentas del Plan 0): se le crea igual (`EnsureHousehold`).

**Tests que fallan primero:**
- `Deleting_an_old_row_gives_it_a_newer_version_than_everything_else`: se crea un viaje, después otras diez filas, se borra el primero → su `Version` es la mayor.
- `Every_saved_change_bumps_the_global_counter`: alta, edición, borrado → tres valores consecutivos.
- `A_user_only_sees_trips_of_their_household`, `A_new_account_gets_a_household`.

### Task 2: API de viajes, reservas, adjuntos y sincronización

**Files:**
- Create: `server/Viajes.Api/Trips/TripEndpoints.cs`, `BookingEndpoints.cs`, `AttachmentEndpoints.cs`, `SyncEndpoints.cs`, `Trips/LocalTime.cs` (hora local + zona → ms UTC)
- Modify: `Storage/IFileStore.cs` (+`DeleteAsync`), `LocalFileStore.cs`, `S3FileStore.cs`, `Program.cs`
- Tests: `TripApiTests.cs`, `BookingApiTests.cs`, `AttachmentApiTests.cs`, `SyncTests.cs`, `LocalTimeTests.cs`

**Rutas** (todas con sesión; escrituras con `Origin` comprobado, ya lo hace el middleware):

| Ruta | Qué hace |
|---|---|
| `PUT /api/trips/{id}` | Upsert. Cuerpo: title, destination, startDate, endDate. 204. Reenviar el mismo cuerpo → 204 sin fila nueva |
| `DELETE /api/trips/{id}` | Borrado lógico del viaje **y en cascada** de sus reservas y adjuntos (todos con versión nueva). 204; ya borrado → 204 |
| `PUT /api/bookings/{id}` | Upsert. Cuerpo: tripId, type, title, startLocal, startTz, startPlace, endLocal, endTz, endPlace, reference, address, notes. Calcula `StartUtcMs`. 404 si el viaje no es visible |
| `DELETE /api/bookings/{id}` | Borrado lógico en cascada con sus adjuntos |
| `PUT /api/attachments/{id}` | Upsert de metadatos: bookingId, name, mime, size, qrText. `Uploaded` no lo toca el cliente |
| `PUT /api/attachments/{id}/content` | Sube el fichero (≤ 20 MB, `Content-Length` obligatorio) a `households/{hid}/trips/{tripId}/{bookingId}/{attachmentId}`; marca `Uploaded = true` (versión nueva) |
| `GET /api/attachments/{id}/content` | Sirve el fichero con `FileResponses.Serve`; 404 si no está subido |
| `DELETE /api/attachments/{id}` | Borrado lógico; el fichero se borra del almacén |
| `GET /api/sync?since=N` | `{ version, tripIds: [...], trips: [...], bookings: [...], attachments: [...] }` con **todas** las filas visibles con `Version > N`, borradas incluidas (`deletedAtMs`) |

- Regla: editar una reserva **borrada** → 409 (el cliente la descarta). Editar un viaje ajeno → 404 (no se revela que existe).
- `LocalTime.ToUtcMs("2026-10-12T10:05", "Europe/Madrid")` con `TimeZoneInfo.FindSystemTimeZoneById` (IANA funciona en Linux y en Windows con ICU). Zona desconocida → 400.

**Tests que fallan primero:** cada ruta en positivo; idempotencia (dos PUT iguales → una fila, misma versión la segunda vez **no** hace falta, pero no duplica); borrado desde fila antigua aparece en `sync` con `deletedAtMs`; `sync?since=` devuelve solo lo nuevo y `tripIds` completo; un adjunto de 20.000.001 bytes → 413; el usuario B no ve ni el viaje ni el fichero de A (404); `LocalTime` con Madrid en verano e invierno y Tokio.

### Task 3: Cliente: base, sesión, almacén local y sincronización

**Files:**
- Create: `web/src/app/router.tsx`, `web/src/app/Layout.tsx` (pestañas Inicio · Ajustes), `web/src/app/theme.css` (variables, modo oscuro, safe areas)
- Create: `web/src/auth/LoginPage.tsx`, `web/src/auth/session.ts` (+test)
- Create: `web/src/data/db.ts` (IndexedDB: trips, bookings, attachments, blobs, outbox, meta), `web/src/data/types.ts`, `web/src/data/sync.ts` (+test), `web/src/data/outbox.ts` (+test; generaliza el del diagnóstico), `web/src/data/repo.ts` (+test; escribe local + encola), `web/src/data/localTime.ts` (+test)
- Modify: `App.tsx`, `main.tsx`; la página de diagnóstico queda en `/diag`

**Sincronización** (`sync.ts`):
1. `push()`: envía la cola en orden; `ok` → quitar; `retry` (red, 5xx, 401, 429) → parar y dejar; `drop` (404, 409, 403, 400) → quitar y avisar.
2. `pull()`: `GET /api/sync?since=meta.version`; aplica filas (las borradas se eliminan del almacén y sus blobs); purga viajes que no estén en `tripIds`; guarda `version`.
3. `uploads()`: para cada adjunto local con `uploaded=false` y blob presente: `PUT …/content`; al 204, marca `uploaded`.
4. Se ejecuta al abrir, al volver la red (`online`), al volver a primer plano y cada 2 minutos; nunca dos a la vez.

**`localTime.ts`**: `toUtcMs(local, tz)` con `Intl.DateTimeFormat` (calcular el desfase de la zona en esa fecha, dos iteraciones para cambios de hora); `formatInZone(local, tz)`; `deviceTimeZone()`; `commonTimeZones`.

**Tests que fallan primero:** `toUtcMs('2026-10-12T10:05','Europe/Madrid') === Date.UTC(2026,9,12,8,5)`; Tokio; cola: orden, retry conserva, drop descarta, un solo vuelo; `pull` aplica borrados y purga viajes ausentes; `repo.saveBooking` calcula `startUtcMs` y encola.

### Task 4: Pantallas: inicio, viaje, reserva, formularios

**Files:** `web/src/pages/HomePage.tsx`, `TripPage.tsx`, `TripFormPage.tsx`, `BookingPage.tsx`, `BookingFormPage.tsx`, `web/src/components/*` (BookingCard, TypeIcon, DayHeader, EmptyState, Sheet)
- **Inicio**: «Lo siguiente» (primera reserva con `startUtcMs ≥ ahora − 6 h`, con botón QR si tiene uno), viajes próximos y pasados con indicador sin conexión.
- **Viaje**: línea de tiempo por días en hora del lugar, filtro por tipo, «Añadir reserva», editar/borrar viaje.
- **Reserva**: datos, adjuntos (miniatura o icono), botón «Ver QR», editar/borrar.
- **Formularios**: viaje (título, destino, fechas); reserva (tipo, título, salida y llegada con fecha, hora, zona y lugar, localizador, dirección, notas). Solo título y fecha de salida obligatorios. Adjuntar desde cámara, Fotos o Archivos (`<input type=file accept="image/*,application/pdf" multiple>`).
- Funciones puras con test: `nextBooking(bookings, now)`, `groupByDay(bookings)`, `tripStatus(trip, today)`.

### Task 5: Adjuntos, QR, PDF y sin conexión

**Files:** `web/src/attachments/attach.ts` (+test), `readQr.ts` (+test con una imagen de QR generada), `pdf.ts`, `web/src/pages/QrPage.tsx`, `AttachmentViewer.tsx`, `web/src/data/offline.ts` (+test)
- Al adjuntar: guardar blob en IndexedDB, crear metadatos (`uploaded=false`), intentar leer el QR (imagen: canvas + `jsqr`; PDF: `pdfjs-dist` páginas 1–3 a escala 2 + `jsqr`), guardar `qrText`, encolar metadatos y dejar la subida a `sync.uploads()`.
- **QR a pantalla completa**: fondo blanco, `qrcode` a canvas al máximo tamaño, Wake Lock, brillo (aviso), «Ver original».
- **Visor**: imágenes con `<img>` desde blob; PDF con `pdfjs-dist` renderizando páginas a canvas.
- **Sin conexión** (`offline.ts`): `wantedOffline(trip, now, manual)` (empieza en ≤ 7 días o interruptor); `downloadMissing(trip)` baja los blobs que faltan; `offlineStatus(trip)` → `{ready, missing, updatedAt}`; indicador en Inicio y en Viaje; interruptor en Viaje.
- Límite de 20 MB en el cliente con mensaje.

### Task 6: Ajustes, despliegue y prueba en el iPhone

- **Ajustes**: email, cerrar sesión, espacio usado (`navigator.storage.estimate()`), quitar viajes pasados del modo sin conexión, versión de la app y del servidor (ya existe), enlace a `/diag`.
- Copia de seguridad manual antes del viaje: `railway ssh -- sh -c "cp /data/viajes.db /data/backup-$(date +%F).db"` y descarga con `railway ssh` + `base64` (documentar en `docs/runbook.md`).
- Lista de comprobación en el iPhone (documento `docs/superpowers/spike/2026-09-27-prueba-plan-1.md`): crear viaje, reserva con PDF con QR y con foto, QR a un toque desde Inicio, modo avión con todo visible y QR legible, editar sin red y ver que llega, borrar, sesión tras despliegue.
