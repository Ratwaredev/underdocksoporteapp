# RustDesk portable

Para el MVP, UnderDock busca el binario remoto en estos lugares:

1. `tools/rustdesk/rustdesk.exe` junto al ejecutable de UnderDock.
2. `rustdesk.exe` junto al ejecutable de UnderDock.
3. `C:\Program Files\RustDesk\RustDesk.exe`.
4. `C:\Program Files (x86)\RustDesk\RustDesk.exe`.

No incluyo el `.exe` adentro del repo para evitar redistribución accidental y para que vos controles qué versión usás.

Flujo deseado:
- Cliente toca `Pedir soporte`.
- UnderDock crea ticket y código.
- UnderDock abre RustDesk.
- Admin recibe solicitud y conecta.

Más adelante podés compilar/forkear RustDesk con branding o usar RustDesk Pro/self-host.
