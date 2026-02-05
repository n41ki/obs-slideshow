# OBS Slideshow Overlay (P2P Sync)

Aplicación simple para OBS Studio que permite gestionar un carrusel de imágenes en tiempo real desde cualquier navegador.

## 🚀 Cómo usar con GitHub Pages (Para tener URL HTTPS)

1. **Sube el código**: Sube esta carpeta (`obs-slideshow-overlay`) a un nuevo repositorio en tu cuenta de GitHub.
2. **Activa GitHub Pages**:
   - Ve a **Settings** > **Pages**.
   - En "Branch", elige `main` y guarda.
3. **Usa el Link**: GitHub te dará una URL (ej: `https://tu-usuario.github.io/tu-repo/`).

## ⚙️ Configuración

### 1. Panel de Control
Abre la URL de tu repositorio en tu navegador normal (Chrome, Edge, etc.):
`https://tu-usuario.github.io/tu-repo/index.html`
- Inserta tus imágenes.
- Configura los segundos.
- Haz clic en **"Iniciar Slideshow"**.
- Copia el **ID de Sesión**.

### 2. En OBS Studio
Añade una fuente de **Navegador** con la URL del overlay:
`https://tu-usuario.github.io/tu-repo/overlay.html?id=TU_ID_AQUÍ`
*(Sustituye `TU_ID_AQUÍ` por el ID que copiaste en el panel)*

## 🛠️ Tecnologías
- HTML / CSS / JS Puro.
- [PeerJS](https://peerjs.com/) para sincronización P2P sin servidor.
