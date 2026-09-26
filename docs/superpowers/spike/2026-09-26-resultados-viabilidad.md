# Resultados de la prueba de viabilidad en iPhone

- iPhone: 
- Versión de iOS: 
- URL: 
- Fecha de instalación: 
- Almacenamiento de ficheros: bucket S3 de Railway / volumen local

| # | Comprobación | Criterio de éxito | Resultado | Observaciones |
|---|---|---|---|---|
| 0a | Modo instalado | «✅ instalada en la pantalla de inicio» | | |
| 0b | Almacenamiento persistente | «✅ concedido» (si sale «denegado», anotar: no bloquea) | | |
| 1 | Sesión | Se inicia sesión dentro de la app y **sigue iniciada** al cerrarla del todo y reabrirla | | |
| 1b | Sesión a +1 día | Sigue iniciada al día siguiente | | |
| 1c | Sesión a +8 días | Sigue iniciada a los 8 días (condición del Plan 3) | | |
| 2 | Cambios sin conexión | En modo avión, «Añadir marca» deja la marca **en cola**; al volver la red se envía sola y aparece en el servidor **una sola vez** | | |
| 3 | Fichero en el móvil | Sigue «✅ íntegro» al día siguiente | | |
| 3b | Fichero a +8 días | Sigue «✅ íntegro» a los 8 días (condición del Plan 3) | | |
| 4 | Adjuntar y subir | El selector ofrece **cámara, Fotos y Archivos**; un PDF de varios MB se sube y se descarga con el mismo tamaño | | |
| 5 | Pantalla encendida | «activo», y la pantalla no se apaga en 2 minutos sin tocarla | | |
| 6 | Cifrado | ✅ y **menos de 2.000 ms** | | |
| R1 | Abre sin red | En modo avión, abrir desde el icono carga la app, no un error de Safari | | |
| R3 | Sesión de Safari no compartida | Con sesión iniciada en Safari, la app instalada pide iniciar sesión sin quedarse colgada | | |
| R4 | Despliegue nuevo | Tras redesplegar: al reabrir la app aparece la **versión nueva** y la sesión **sigue iniciada** | | |
| R5 | IP real tras el proxy | Abrir `<URL>/api/diag/network` desde el iPhone con **datos móviles** y desde el ordenador con otra red: `scheme` es `https` y `remoteIp` es **distinta en cada caso** y es la IP pública de cada red, no la del proxy de Railway. Si saliera la misma, el límite de intentos compartiría un solo contador para todos | | |

## Conclusión

- [ ] Todas superadas (salvo las de +8 días, que se anotan cuando toque) → se escribe el Plan 1.
- [ ] Alguna falla → se revisa la especificación antes de seguir.
