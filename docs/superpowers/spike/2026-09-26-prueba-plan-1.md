# Prueba del Plan 1 en el iPhone

- iPhone: iPhone 13 Pro Max · iOS 26.6.1
- URL: https://viajes-production-82cb.up.railway.app
- Versión de la app probada: 

Se hace con la app **instalada** (sin la barra de Safari). Al abrirla debe salir el aviso de versión nueva; tras
actualizar, la página de diagnóstico deja de ser la portada y aparece «Viajes» con las pestañas Inicio · Ajustes.

| # | Comprobación | Criterio de éxito | Resultado | Observaciones |
|---|---|---|---|---|
| 1 | Sesión | La app abre directamente en Inicio sin pedir contraseña (la sesión del Plan 0 sigue valiendo) | | |
| 2 | Crear viaje | «+ Viaje» → título, destino, fechas → aparece en Inicio en «Próximos» | | |
| 3 | Reserva con PDF | En el viaje, «+ Añadir reserva»: vuelo con fecha, hora, zona, lugar y localizador; adjuntar un PDF de tarjeta de embarque desde Archivos. Al guardar, la miniatura del PDF lleva la etiqueta «QR» si el PDF tiene un código QR | | |
| 4 | Reserva con foto | Otra reserva adjuntando una foto de la cámara y otra de Fotos | | |
| 5 | QR a un toque | En Inicio, «Lo siguiente» muestra la próxima reserva con el botón «Ver QR»; el QR sale grande sobre fondo blanco y la pantalla no se apaga | | |
| 6 | Original | Desde el QR, «Ver original» muestra el PDF entero (todas las páginas) o la foto | | |
| 7 | Sin conexión | Modo avión con wifi apagada, cerrar la app del todo y abrir desde el icono: Inicio carga, el viaje dice «✅ Listo sin conexión», el QR se ve y el PDF original se abre | | |
| 8 | Cambios sin red | Sin red, editar una reserva y añadir otra. En Inicio aparece «N cambios pendientes». Al volver la red desaparecen y, tras «Sincronizar ahora» en Ajustes, siguen igual (no duplicadas) | | |
| 9 | Zona horaria | Un vuelo con salida en Madrid y llegada en Tokio se ordena bien en la línea de tiempo y muestra «hora de Tokio» | | |
| 10 | Borrar | Borrar una reserva y un viaje: desaparecen y no vuelven tras sincronizar | | |
| 11 | Despliegue nuevo | Tras el siguiente despliegue: aviso de versión nueva, actualizar, sesión y datos intactos | | |

## Conclusión

- [ ] Todo bien → cargar el viaje real y hacer copia de seguridad de la base (martes 30).
- [ ] Algo falla → anotar y corregir.
