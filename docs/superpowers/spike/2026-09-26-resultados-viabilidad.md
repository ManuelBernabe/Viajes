# Resultados de la prueba de viabilidad en iPhone

- iPhone: 
- Versión de iOS: 
- URL: https://viajes-production-82cb.up.railway.app
- Fecha de instalación: 26/09/2026
- Almacenamiento de ficheros: volumen local (`FILE_STORE=local`; no se ha comprobado si Railway ofrece buckets)

| # | Comprobación | Criterio de éxito | Resultado | Observaciones |
|---|---|---|---|---|
| 0a | Modo instalado | «✅ instalada en la pantalla de inicio» | ✅ | 26/09/2026 13:43. Primero se probó por error dentro de Safari («⚠️ dentro de Safari, sin instalar»); esas pruebas se descartaron |
| 0b | Almacenamiento persistente | «✅ concedido» (si sale «denegado», anotar: no bloquea) | ✅ | «concedido» en modo instalado; en Safari salía «denegado» |
| 1 | Sesión | Se inicia sesión dentro de la app y **sigue iniciada** al cerrarla del todo y reabrirla | ✅ | Cerrada del todo y reabierta desde el icono: sigue iniciada |
| 1b | Sesión a +1 día | Sigue iniciada al día siguiente | | |
| 1c | Sesión a +8 días | Sigue iniciada a los 8 días (condición del Plan 3) | | |
| 2 | Cambios sin conexión | En modo avión, «Añadir marca» deja la marca **en cola**; al volver la red se envía sola y aparece en el servidor **una sola vez** | ✅ | Con modo avión y wifi apagada: la marca quedó en cola (1); al volver la red se envió sola y el servidor pasó de 3 a 4 marcas. Un primer intento con la wifi encendida dentro del modo avión no valía: iOS mantenía la conexión |
| 3 | Fichero en el móvil | Sigue «✅ íntegro» al día siguiente | | |
| 3b | Fichero a +8 días | Sigue «✅ íntegro» a los 8 días (condición del Plan 3) | | |
| 4 | Adjuntar y subir | El selector ofrece **cámara, Fotos y Archivos**; un PDF de varios MB se sube y se descarga con el mismo tamaño | ✅ | `billetes.pdf` de 0,7 MB: íntegro en el móvil, subido y descargado con el mismo tamaño. Con un PDF de 24 KB la página mostraba «0.0 MB» por redondeo, no era un fallo |
| 5 | Pantalla encendida | «activo», y la pantalla no se apaga en 2 minutos sin tocarla | ✅ | «activo», no se apagó en 2 minutos |
| 6 | Cifrado | ✅ y **menos de 2.000 ms** | ✅ | 134 ms en modo instalado (129 ms en Safari) |
| R1 | Abre sin red | En modo avión, abrir desde el icono carga la app, no un error de Safari | ✅ | Con modo avión y wifi apagada, abrir desde el icono carga la app y muestra «Red: sin conexión» |
| R3 | Sesión de Safari no compartida | Con sesión iniciada en Safari, la app instalada pide iniciar sesión sin quedarse colgada | ✅ | Con sesión iniciada en Safari, la app instalada pidió iniciar sesión y entró sin problema |
| R4 | Despliegue nuevo | Tras redesplegar: al reabrir la app aparece la **versión nueva** y la sesión **sigue iniciada** | pendiente | Primer redespliegue (`railway up` 14:00): la sesión siguió iniciada, pero la «Versión» no cambió porque la caché de capas de Docker reutilizó el build de la web al no haber cambiado su código. Se corrige pasando el commit como argumento de construcción y se repite con el siguiente despliegue |
| R5 | IP real tras el proxy | Abrir `<URL>/api/diag/network` desde el iPhone con **datos móviles** y desde el ordenador con otra red: `scheme` es `https` y `remoteIp` es **distinta en cada caso** y es la IP pública de cada red, no la del proxy de Railway. Si saliera la misma, el límite de intentos compartiría un solo contador para todos | 🔴 → corregido, pendiente de verificar | Desde el portátil (IP 79.117.253.45) `remoteIp` era 95.173.199.193/194, el borde de Railway, y `forwardedFor` la del cliente: Railway pone dos saltos y ASP.NET solo confiaba en uno. Arreglo: `ForwardLimit = 2`, con tests. Railway descarta las cabeceras `X-Forwarded-*` que envía el cliente |

## Conclusión

- [ ] Todas superadas (salvo las de +8 días, que se anotan cuando toque) → se escribe el Plan 1.
- [ ] Alguna falla → se revisa la especificación antes de seguir.
