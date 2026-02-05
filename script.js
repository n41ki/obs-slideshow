/**
 * IRL-Overlays Script (P2P Version)
 * Sincronización en tiempo real sin servidor usando PeerJS + LocalStorage Fallback.
 */

const STORAGE_PREFIX = 'irl_obs_data_';
let peer = null;
let connections = [];

/**
 * --- UTILS ---
 */
function getKeys(id) {
    return STORAGE_PREFIX + id;
}

// Generar un ID único para esta pestaña (Panel)
const SESSION_ID = 'obs-' + Math.random().toString(36).substr(2, 6);

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const isControlPanel = document.getElementById('image-slots') !== null;
    if (isControlPanel) {
        initControlPanel();
    } else {
        initOverlay();
    }
});

const PEER_CONFIG = {
    debug: 1,
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
        ],
        'sdpSemantics': 'unified-plan'
    }
};

/**
 * --- SHARED DATA UTILS ---
 */
function broadcast(data) {
    connections = connections.filter(conn => conn.open);
    connections.forEach(conn => conn.send(data));
}

function getStoredData(id) {
    try {
        const raw = localStorage.getItem(getKeys(id));
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function saveData(data, id) {
    try {
        localStorage.setItem(getKeys(id), JSON.stringify(data));
        broadcast(data);
        return true;
    } catch (e) {
        alert('Error: Imágenes demasiado pesadas. Usa archivos < 1MB.');
        return false;
    }
}

/**
 * --- CONTROL PANEL LOGIC ---
 */
function initControlPanel() {
    // Limpieza de sesiones antiguas al azar para no llenar el storage
    Object.keys(localStorage).forEach(k => {
        if (k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k);
    });

    const imageSlots = document.getElementById('image-slots');
    const intervalInput = document.getElementById('interval');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const copyBtn = document.getElementById('copy-btn');
    const obsLinkElement = document.getElementById('obs-link');
    const syncIdLabel = document.getElementById('sync-id');

    // Estado inicial
    let state = {
        images: [null, null, null, null, null],
        interval: 5,
        active: false,
        peerId: SESSION_ID
    };

    // UI Link
    const fullObsUrl = `https://n41ki.github.io/obs-slideshow/overlay.html?id=${SESSION_ID}`;
    if (obsLinkElement) {
        obsLinkElement.textContent = fullObsUrl;
        obsLinkElement.dataset.url = fullObsUrl;
    }
    if (syncIdLabel) syncIdLabel.textContent = SESSION_ID;

    function startPeer() {
        if (peer) peer.destroy();
        peer = new Peer(SESSION_ID, PEER_CONFIG);

        peer.on('connection', (conn) => {
            connections.push(conn);
            conn.on('open', () => conn.send(state));
            conn.on('close', () => {
                connections = connections.filter(c => c.peer !== conn.peer);
                updateUI();
            });
        });

        peer.on('error', (err) => {
            if (err.type === 'network' || err.type === 'server-error') setTimeout(startPeer, 5000);
        });
    }

    startPeer();

    // Eventos UI
    intervalInput.addEventListener('change', () => {
        state.interval = parseInt(intervalInput.value) || 5;
        saveData(state, SESSION_ID);
    });

    startBtn.addEventListener('click', () => {
        if (!state.images.some(img => img !== null)) return alert('Sube imágenes primero.');
        state.active = true;
        saveData(state, SESSION_ID);
        updateUI();
    });

    stopBtn.addEventListener('click', () => {
        state.active = false;
        saveData(state, SESSION_ID);
        updateUI();
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(obsLinkElement.dataset.url);
        const original = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => copyBtn.innerHTML = original, 2000);
    });

    function updateUI() {
        startBtn.style.opacity = state.active ? '0.5' : '1';
        startBtn.innerHTML = state.active ? '<i class="fas fa-spinner fa-spin"></i> Ejecutando...' : '<i class="fas fa-play"></i> Iniciar';
        startBtn.style.pointerEvents = state.active ? 'none' : 'auto';

        const dot = document.querySelector('.status-indicator .dot');
        if (dot) {
            const connected = connections.some(c => c.open);
            dot.style.backgroundColor = connected ? '#00ff87' : '#94a3b8';
            dot.style.boxShadow = connected ? '0 0 10px #00ff87' : 'none';
        }
    }

    function refreshSlots() {
        imageSlots.innerHTML = '';
        state.images.forEach((img, i) => {
            const slot = document.createElement('div');
            slot.className = 'image-slot';
            slot.innerHTML = img
                ? `<img src="${img}"><div class="remove-btn"><i class="fas fa-times"></i></div>`
                : `<span class="slot-label"><i class="fas fa-plus"></i></span><input type="file" accept="image/*">`;

            imageSlots.appendChild(slot);
            const input = slot.querySelector('input');
            if (input) {
                input.addEventListener('change', (e) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        state.images[i] = ev.target.result;
                        if (saveData(state, SESSION_ID)) refreshSlots();
                    };
                    reader.readAsDataURL(e.target.files[0]);
                });
            }
            const rm = slot.querySelector('.remove-btn');
            if (rm) {
                rm.addEventListener('click', () => {
                    state.images[i] = null;
                    saveData(state, SESSION_ID);
                    refreshSlots();
                });
            }
        });
    }

    refreshSlots();
    updateUI();
}

/**
 * --- OVERLAY LOGIC ---
 */
function initOverlay() {
    const container = document.getElementById('slideshow-container');
    let timer = null;
    let currentIndex = 0;
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');

    if (!targetId) {
        container.innerHTML = '<div style="color:white;text-align:center;padding:20px;">Error: Falta ID de Sesión.</div>';
        return;
    }

    // LISTENER DE STORAGE (Sincronización instantánea en mismo PC)
    window.addEventListener('storage', (e) => {
        if (e.key === getKeys(targetId)) {
            console.log('Update local detectado para ID:', targetId);
            render(JSON.parse(e.newValue));
        }
    });

    function render(data) {
        if (!data || data.peerId !== targetId) return;

        container.innerHTML = '';
        const valid = data.images.filter(img => img !== null);

        if (!data.active || valid.length === 0) {
            if (timer) clearInterval(timer);
            container.innerHTML = '<div style="color:white;text-align:center;padding:20px;font-family:sans-serif;">' +
                '<div class="spinner"></div><p style="margin-top:10px;">Esperando imágenes...</p></div>';
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
    }

    // Intento de carga inicial
    const initial = getStoredData(targetId);
    if (initial) render(initial);
    else {
        container.innerHTML = '<div style="color:white;text-align:center;padding:20px;font-family:sans-serif;">' +
            '<div class="spinner"></div><p style="margin-top:10px;">Enlazando con el panel...</p></div>';
    }

    // Conexión PeerJS (Control remoto)
    function connect() {
        if (peer) peer.destroy();
        peer = new Peer(PEER_CONFIG);
        peer.on('open', () => {
            const conn = peer.connect(targetId, { reliable: true });
            conn.on('data', (data) => render(data));
            conn.on('close', () => setTimeout(connect, 5000));
            conn.on('error', () => setTimeout(connect, 5000));
        });
        peer.on('error', () => setTimeout(connect, 10000));
    }

    connect();
}
