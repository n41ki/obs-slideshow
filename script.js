/**
 * OBS Slideshow Overlay Script (P2P Version)
 * Permite sincronizar el Panel (Navegador) con el Overlay (OBS) en tiempo real sin servidor.
 */

const STORAGE_KEY = 'obs_slideshow_data';
let peer = null;
let connections = []; // Soporte para múltiples conexiones (múltiples OBS o refrescos)

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const isControlPanel = document.getElementById('image-slots') !== null;
    if (isControlPanel) {
        initControlPanel();
    } else {
        initOverlay();
    }
});

// Generar un ID único para esta sesión de pestaña
const SESSION_ID = 'obs-' + Math.random().toString(36).substr(2, 6);

// --- SHARED DATA UTILS ---
function broadcast(data) {
    connections = connections.filter(conn => conn.open);
    connections.forEach(conn => conn.send(data));
}

function getStorageData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const baseData = raw ? JSON.parse(raw) : {
            images: [null, null, null, null, null],
            interval: 5,
            active: false
        };
        return { ...baseData, peerId: SESSION_ID };
    } catch (e) {
        return { images: [null, null, null, null, null], interval: 5, active: false, peerId: SESSION_ID };
    }
}

function saveData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        broadcast(data); // Enviar a todos los overlays conectados
        return true;
    } catch (e) {
        alert('Error: Imágenes demasiado pesadas. Intenta con archivos inferiores a 1MB.');
        return false;
    }
}

// --- CONTROL PANEL LOGIC ---
function initControlPanel() {
    const data = getStorageData();
    const imageSlots = document.getElementById('image-slots');
    const intervalInput = document.getElementById('interval');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const copyBtn = document.getElementById('copy-btn');
    const obsLinkElement = document.getElementById('obs-link');
    const syncIdLabel = document.getElementById('sync-id');

    // Generar y mostrar link INMEDIATAMENTE
    const fullObsUrl = `https://n41ki.github.io/obs-slideshow/overlay.html?id=${SESSION_ID}`;
    if (obsLinkElement) {
        obsLinkElement.textContent = fullObsUrl;
        obsLinkElement.dataset.url = fullObsUrl;
    }
    if (syncIdLabel) syncIdLabel.textContent = SESSION_ID;

    // Inicializar Peer (Panel es el Host)
    peer = new Peer(SESSION_ID);

    peer.on('open', (id) => {
        console.log('ID de Panel listo:', id);
    });

    peer.on('connection', (conn) => {
        connections.push(conn);
        console.log('Nuevo overlay conectado:', conn.peer);

        conn.on('open', () => {
            conn.send(getStorageData());
            updateStatus(getStorageData().active);
        });

        conn.on('close', () => {
            connections = connections.filter(c => c.peer !== conn.peer);
            console.log('Overlay desconectado');
        });
    });

    peer.on('error', (err) => {
        console.error('Error PeerJS:', err);
        if (err.type === 'unavailable-id') {
            alert('Error: El ID ya está en uso. Refresca la página para generar uno nuevo.');
        }
    });

    // UI Setup
    intervalInput.value = data.interval;
    refreshSlots();
    updateStatus(data.active);

    intervalInput.addEventListener('change', () => {
        const d = getStorageData();
        d.interval = parseInt(intervalInput.value) || 5;
        saveData(d);
    });

    startBtn.addEventListener('click', () => {
        const d = getStorageData();
        if (!d.images.some(img => img !== null)) return alert('Inserta imágenes primero.');
        d.active = true;
        saveData(d);
        updateStatus(true);
    });

    stopBtn.addEventListener('click', () => {
        const d = getStorageData();
        d.active = false;
        saveData(d);
        updateStatus(false);
    });

    copyBtn.addEventListener('click', () => {
        const linkElement = document.getElementById('obs-link');
        const urlToCopy = linkElement ? linkElement.dataset.url : '';
        if (urlToCopy) {
            navigator.clipboard.writeText(urlToCopy);
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => copyBtn.innerHTML = originalText, 2000);
        }
    });

    function updateStatus(active) {
        if (!startBtn) return;
        startBtn.style.opacity = active ? '0.5' : '1';
        startBtn.innerHTML = active
            ? '<i class="fas fa-spinner fa-spin"></i> Ejecutando...'
            : '<i class="fas fa-play"></i> Iniciar';
        startBtn.style.pointerEvents = active ? 'none' : 'auto';

        const dot = document.querySelector('.status-indicator .dot');
        if (dot) {
            const hasConnections = connections.some(c => c.open);
            dot.style.backgroundColor = hasConnections ? '#00ff87' : '#94a3b8';
            dot.style.boxShadow = hasConnections ? '0 0 10px #00ff87' : 'none';
        }
    }

    function createSlot(index, existingImage) {
        const slot = document.createElement('div');
        slot.className = 'image-slot';
        slot.innerHTML = existingImage
            ? `<img src="${existingImage}"><div class="remove-btn" data-index="${index}"><i class="fas fa-times"></i></div>`
            : `<span class="slot-label"><i class="fas fa-plus"></i></span><input type="file" accept="image/*" data-index="${index}">`;

        return slot;
    }

    function refreshSlots() {
        imageSlots.innerHTML = '';
        const d = getStorageData();
        d.images.forEach((img, i) => {
            const slot = createSlot(i, img);
            imageSlots.appendChild(slot);

            const input = slot.querySelector('input');
            if (input) input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const d2 = getStorageData();
                    d2.images[i] = ev.target.result;
                    if (saveData(d2)) refreshSlots();
                };
                reader.readAsDataURL(file);
            });

            const rm = slot.querySelector('.remove-btn');
            if (rm) rm.addEventListener('click', () => {
                const d2 = getStorageData();
                d2.images[i] = null;
                saveData(d2);
                refreshSlots();
            });
        });
    }
}

// --- OVERLAY LOGIC ---
function initOverlay() {
    const container = document.getElementById('slideshow-container');
    let timer = null;
    let currentIndex = 0;

    // Pedir ID al usuario si no está en la URL
    const urlParams = new URLSearchParams(window.location.search);
    let targetId = urlParams.get('id');

    if (!targetId) {
        container.innerHTML = '<div style="color: white; font-family: sans-serif; text-align: center; padding: 20px;">Falta ID de Sesión.</div>';
        return;
    }

    container.innerHTML = '<div style="color: white; font-family: sans-serif; text-align: center; padding: 20px;">Conectando al panel de control...</div>';

    peer = new Peer();

    peer.on('open', () => {
        const conn = peer.connect(targetId, {
            reliable: true
        });

        // Timeout si no conecta en 15 segundos
        const timeout = setTimeout(() => {
            if (!conn.open) {
                container.innerHTML = '<div style="color: white; font-family: sans-serif; text-align: center; padding: 20px;">' +
                    '<h2 style="margin-bottom: 10px;">Error de Conexión</h2>' +
                    '<p>No se pudo conectar con el Panel de Control.</p>' +
                    '<p style="font-size: 0.8rem; color: #999; margin-top: 10px;">Asegúrate de que la pestaña del Panel esté abierta y visible.</p></div>';
            }
        }, 15000);

        conn.on('open', () => {
            clearTimeout(timeout);
            container.innerHTML = '<div style="color: white; font-family: sans-serif; text-align: center; padding: 20px;">Conectado. Esperando imágenes...</div>';
        });

        conn.on('data', (data) => {
            console.log('Datos recibidos:', data);
            renderSlideshow(data);
        });

        conn.on('error', (err) => {
            console.error('Error de conexión:', err);
            container.innerHTML = `<div style="color: white; font-family: sans-serif; text-align: center; padding: 20px;">Error: ${err.type}</div>`;
        });

        conn.on('close', () => {
            container.innerHTML = '<div style="color: white; font-family: sans-serif; text-align: center; padding: 20px;">Panel desconectado.</div>';
        });
    });

    peer.on('error', (err) => {
        console.error('Error PeerJS:', err);
        container.innerHTML = `<div style="color: white; font-family: sans-serif; text-align: center; padding: 20px;">Error de Red: ${err.type}</div>`;
    });

    function renderSlideshow(data) {
        container.innerHTML = '';
        const validImages = data.images.filter(img => img !== null);

        if (!data.active || validImages.length === 0) {
            if (timer) clearInterval(timer);
            container.innerHTML = validImages.length === 0
                ? '<div style="color: white; font-family: sans-serif;">Sin imágenes.</div>'
                : '<div style="color: white; font-family: sans-serif;">Slideshow detenido.</div>';
            return;
        }

        validImages.forEach((imgSrc, idx) => {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.className = `slide ${idx === 0 ? 'active' : ''}`;
            container.appendChild(img);
        });

        currentIndex = 0;
        if (timer) clearInterval(timer);
        if (validImages.length > 1) {
            timer = setInterval(() => {
                const slides = document.querySelectorAll('.slide');
                if (slides.length === 0) return;
                slides[currentIndex].classList.remove('active');
                currentIndex = (currentIndex + 1) % validImages.length;
                slides[currentIndex].classList.add('active');
            }, data.interval * 1000);
        }
    }
}
