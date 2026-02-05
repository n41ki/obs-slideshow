/**
 * IRL-Overlays Script (P2P Version)
 * Sincronización en tiempo real sin servidor usando PeerJS.
 */

const STORAGE_KEY = 'obs_slideshow_data';
let peer = null;
let connections = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const isControlPanel = document.getElementById('image-slots') !== null;
    if (isControlPanel) {
        initControlPanel();
    } else {
        initOverlay();
    }

    // Sincronización Local Fallback (Mismo PC/Navegador)
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && !isControlPanel) {
            try {
                const data = JSON.parse(e.newValue);
                if (window.renderSlideshowData) {
                    window.renderSlideshowData(data);
                }
            } catch (err) {
                console.error('Error parseando datos de storage:', err);
            }
        }
    });
});

// Generar un ID único para esta sesión de pestaña
const SESSION_ID = 'obs-' + Math.random().toString(36).substr(2, 6);

const PEER_CONFIG = {
    debug: 2,
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
        ],
        'sdpSemantics': 'unified-plan'
    }
};

// --- SHARED DATA UTILS ---
function broadcast(data) {
    connections = connections.filter(conn => conn.open);
    connections.forEach(conn => conn.send(data));
}

function getStorageData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {
            images: [null, null, null, null, null],
            interval: 5,
            active: false
        };
    } catch (e) {
        return { images: [null, null, null, null, null], interval: 5, active: false };
    }
}

function saveData(data) {
    try {
        // Adjuntar el SESSION_ID del panel para que el Overlay sepa de quién viene
        data.peerId = SESSION_ID;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        broadcast(data);
        return true;
    } catch (e) {
        alert('Error: Imágenes demasiado pesadas. Intenta con archivos inferiores a 1MB.');
        return false;
    }
}

// --- CONTROL PANEL LOGIC ---
function initControlPanel() {
    localStorage.removeItem(STORAGE_KEY); // Limpieza al refrescar

    const data = getStorageData();
    const imageSlots = document.getElementById('image-slots');
    const intervalInput = document.getElementById('interval');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const copyBtn = document.getElementById('copy-btn');
    const obsLinkElement = document.getElementById('obs-link');
    const syncIdLabel = document.getElementById('sync-id');

    const fullObsUrl = `https://n41ki.github.io/obs-slideshow/overlay.html?id=${SESSION_ID}`;
    if (obsLinkElement) {
        obsLinkElement.textContent = fullObsUrl;
        obsLinkElement.dataset.url = fullObsUrl;
    }
    if (syncIdLabel) syncIdLabel.textContent = SESSION_ID;

    function startPeer() {
        if (peer) peer.destroy();
        peer = new Peer(SESSION_ID, PEER_CONFIG);

        peer.on('open', (id) => console.log('Panel listo:', id));

        peer.on('connection', (conn) => {
            connections.push(conn);
            conn.on('open', () => {
                conn.send(getStorageData());
                updateUIState(getStorageData().active);
            });
            conn.on('close', () => {
                connections = connections.filter(c => c.peer !== conn.peer);
                updateUIState(getStorageData().active);
            });
        });

        peer.on('error', (err) => {
            console.error('Peer Error:', err.type);
            if (err.type === 'network' || err.type === 'server-error') {
                setTimeout(startPeer, 5000);
            }
        });
    }

    startPeer();

    // UI Setup
    intervalInput.value = data.interval;
    refreshSlots();
    updateUIState(data.active);

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
        updateUIState(true);
    });

    stopBtn.addEventListener('click', () => {
        const d = getStorageData();
        d.active = false;
        saveData(d);
        updateUIState(false);
    });

    copyBtn.addEventListener('click', () => {
        const urlToCopy = obsLinkElement.dataset.url;
        if (urlToCopy) {
            navigator.clipboard.writeText(urlToCopy);
            const original = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => copyBtn.innerHTML = original, 2000);
        }
    });

    function updateUIState(active) {
        if (!startBtn) return;
        startBtn.style.opacity = active ? '0.5' : '1';
        startBtn.innerHTML = active ? '<i class="fas fa-spinner fa-spin"></i> Ejecutando...' : '<i class="fas fa-play"></i> Iniciar';
        startBtn.style.pointerEvents = active ? 'none' : 'auto';

        const dot = document.querySelector('.status-indicator .dot');
        if (dot) {
            const connected = connections.some(c => c.open);
            dot.style.backgroundColor = connected ? '#00ff87' : '#94a3b8';
            dot.style.boxShadow = connected ? '0 0 10px #00ff87' : 'none';
        }
    }

    function refreshSlots() {
        imageSlots.innerHTML = '';
        getStorageData().images.forEach((img, i) => {
            const slot = document.createElement('div');
            slot.className = 'image-slot';
            slot.innerHTML = img
                ? `<img src="${img}"><div class="remove-btn"><i class="fas fa-times"></i></div>`
                : `<span class="slot-label"><i class="fas fa-plus"></i></span><input type="file" accept="image/*">`;

            imageSlots.appendChild(slot);

            const input = slot.querySelector('input');
            if (input) input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const d = getStorageData();
                    d.images[i] = ev.target.result;
                    if (saveData(d)) refreshSlots();
                };
                reader.readAsDataURL(file);
            });

            const rm = slot.querySelector('.remove-btn');
            if (rm) rm.addEventListener('click', () => {
                const d = getStorageData();
                d.images[i] = null;
                saveData(d);
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
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');

    if (!targetId) {
        container.innerHTML = '<div style="color:white;text-align:center;padding:20px;font-family:sans-serif;">Falta ID de Sesión en la URL.</div>';
        return;
    }

    // Exportar función de renderizado para recibir datos externos
    window.renderSlideshowData = function (data) {
        // VALIDACIÓN CRÍTICA: Los datos deben ser para este ID de sesión
        if (!data || data.peerId !== targetId) {
            console.log('Ignorando datos de otra sesión');
            return;
        }

        container.innerHTML = '';
        const valid = data.images.filter(img => img !== null);

        if (!data.active || valid.length === 0) {
            if (timer) clearInterval(timer);
            container.innerHTML = '<div style="color:white;text-align:center;padding:20px;font-family:sans-serif;">Slideshow detenido o sin imágenes.</div>';
            return;
        }

        valid.forEach((src, idx) => {
            const img = document.createElement('img');
            img.src = src;
            img.className = `slide ${idx === 0 ? 'active' : ''}`;
            container.appendChild(img);
        });

        currentIndex = 0;
        if (timer) clearInterval(timer);
        if (valid.length > 1) {
            timer = setInterval(() => {
                const slides = document.querySelectorAll('.slide');
                if (!slides.length) return;
                slides[currentIndex].classList.remove('active');
                currentIndex = (currentIndex + 1) % valid.length;
                slides[currentIndex].classList.add('active');
            }, (data.interval || 5) * 1000);
        }
    };

    // 1. CARGA INICIAL (Si ya hay datos en LocalStorage para este ID)
    const initialData = getStorageData();
    if (initialData && initialData.peerId === targetId) {
        window.renderSlideshowData(initialData);
    } else {
        container.innerHTML = '<div style="color:white;text-align:center;padding:20px;font-family:sans-serif;">' +
            '<div class="spinner"></div><p style="margin-top:10px;">Iniciando sistema de sincronización...</p></div>';
    }

    // 2. CONEXIÓN P2P (Fallback para control remoto)
    function connect() {
        if (peer) peer.destroy();
        peer = new Peer(PEER_CONFIG);

        peer.on('open', () => {
            const conn = peer.connect(targetId, { reliable: true });
            conn.on('open', () => console.log('Vínculo P2P establecido'));
            conn.on('data', (data) => window.renderSlideshowData(data));
            conn.on('close', () => setTimeout(connect, 5000));
            conn.on('error', () => setTimeout(connect, 5000));
        });

        peer.on('error', (err) => {
            console.warn('Estado P2P:', err.type);
            if (err.type === 'network' || err.type === 'server-error') {
                setTimeout(connect, 10000);
            }
        });
    }

    connect();
}
