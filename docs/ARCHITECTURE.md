# Arquitectura UnderDock

## Objetivo

UnderDock no compite con AnyDesk/RustDesk/TeamViewer. UnderDock es la experiencia de soporte técnico:

- diagnóstico on-demand,
- ticket simple,
- admin queue,
- reporte,
- actualización de app,
- integración con motor remoto open source.

## App única, dos modos

La misma app trae:

- **Client Mode**: pedir soporte, ejecutar diagnóstico, abrir remoto.
- **Admin Mode**: ver cola, revisar ticket, conectar, cerrar servicio.

En producción conviene separar permisos por login, pero para MVP está en una app para iterar rápido.

## Agent integrado, no persistente

El agent está dentro del backend Rust de Tauri. No queda monitoreando la PC.

Se activa solo cuando el usuario ejecuta:

- diagnóstico,
- escaneo de temporales,
- revisión de inicio,
- abrir Windows Update,
- ver Defender,
- abrir remoto.

## Backend futuro

Para que te llegue una notificación real cuando un cliente pide soporte:

1. Client crea ticket en backend.
2. Backend guarda equipo + diagnóstico.
3. Backend dispara notificación: Telegram/Discord/email.
4. Admin escucha cola en tiempo real.

Stack recomendado:

- Supabase/PostgreSQL para tickets/equipos.
- Supabase Realtime o WebSocket para admin.
- Telegram bot para notificación rápida al celular.
- RustDesk self-host para remoto.
