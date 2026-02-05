/**
 * OBS Slideshow Overlay Script (P2P Version)
 * Permite sincronizar el Panel (Navegador) con el Overlay (OBS) en tiempo real sin servidor.
 */

const STORAGE_KEY = 'obs_slideshow_data';
let peer = null;
let connection = null;

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
function getStorageData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const baseData = raw ? JSON.parse(raw) : {
            images: [null, null, null, null, null],
            interval: 5,
            active: false
        };
        // Siempre usamos el ID único de esta pestaña
        return { ...baseData, peerId: SESSION_ID };
    } catch (e) {
        return { images: [null, null, null, null, null], interval: 5, active: false, peerId: SESSION_ID };
    }
}

function saveData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        if (connection && connection.open) {
            connection.send(data); // Enviar al overlay en tiempo real
        }
        return true;
    } catch (e) {
        alert('Error: Imágenes demasiado pesadas. Intenta con archivos más pequeños (menos de 2MB).');
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

    // Generar y mostrar link INMEDIATAMENTE
    const fullObsUrl = `https://n41ki.github.io/obs-slideshow/overlay.html?id=${SESSION_ID}`;
    if (obsLinkElement) {
        obsLinkElement.textContent = fullObsUrl;
        obsLinkElement.dataset.url = fullObsUrl;
    }

    // Inicializar Peer (Panel es el Host)
    peer = new Peer(SESSION_ID);

    peer.on('open', (id) => {
        console.log('ID de Panel listo:', id);
    });

    peer.on('connection', (conn) => {
        connection = conn;
        console.log('Overlay conectado');
        conn.on('open', () => {
            conn.send(getStorageData()); // Enviar datos actuales al conectar
        });
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
            copyBtn.textContent = '¡Copiado!';
            setTimeout(() => copyBtn.textContent = 'Copiar Link', 2000);
        }
    });

    function updateStatus(active) {
        startBtn.style.opacity = active ? '0.5' : '1';
        startBtn.textContent = active ? 'Ejecutando...' : 'Iniciar Slideshow';
        startBtn.style.pointerEvents = active ? 'none' : 'auto';
    }

    function refreshSlots() {
        imageSlots.innerHTML = '';
        const d = getStorageData();
        d.images.forEach((img, i) => {
            const slot = document.createElement('div');
            slot.className = 'image-slot';
            slot.innerHTML = img
                ? `<img src="${img}"><div class="remove-btn">×</div>`
                : `<span class="slot-label">+</span><input type="file" accept="image/*">`;

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
        targetId = prompt('Introduce el ID de Sesión del Panel de Control:');
    }

    if (!targetId) {
        container.innerHTML = '<div style="color: white; font-family: sans-serif;">Falta ID de Sesión.</div>';
        return;
    }

    container.innerHTML = '<div style="color: white; font-family: sans-serif;">Conectando al panel...</div>';

    peer = new Peer();

    peer.on('open', () => {
        const conn = peer.connect(targetId);
        conn.on('open', () => {
            container.innerHTML = '<div style="color: white; font-family: sans-serif;">Conectado. Esperando comando.</div>';
        });

        conn.on('data', (data) => {
            console.log('Datos recibidos:', data);
            renderSlideshow(data);
        });

        conn.on('close', () => {
            container.innerHTML = '<div style="color: white; font-family: sans-serif;">Conexión perdida.</div>';
        });
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
