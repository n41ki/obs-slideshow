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
            console.log('Sincronización local detectada');
            const data = JSON.parse(e.newValue);
            if (window.renderSlideshowData) {
                window.renderSlideshowData(data);
            }
        }
    });
});

// Generar un ID único para esta sesión de pestaña
const SESSION_ID = 'obs-' + Math.random().toString(36).substr(2, 6);

const PEER_CONFIG = {
    debug: 2, // Más info para diagnosticar
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
        broadcast(data);
        return true;
    } catch (e) {
        alert('Error: Imágenes demasiado pesadas. Intenta con archivos inferiores a 1MB.');
        return false;
    }
}

// --- CONTROL PANEL LOGIC ---
function initControlPanel() {
    localStorage.removeItem(STORAGE_KEY); // Reset on refresh

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
        container.innerHTML = '<div style="color:white;text-align:center;padding:20px;">Falta ID de Sesión.</div>';
        return;
    }

    function connect() {
        container.innerHTML = '<div style="color:white;text-align:center;padding:20px;"><div class="spinner"></div><p style="margin-top:10px;">Buscando panel...</p></div>';

        if (peer) peer.destroy();
        peer = new Peer(PEER_CONFIG);

        peer.on('open', () => {
            const conn = peer.connect(targetId, { reliable: true });

            const timeout = setTimeout(() => {
                if (!conn.open) {
                    conn.close();
                    setTimeout(connect, 3000);
                }
            }, 10000);

            conn.on('open', () => {
                clearTimeout(timeout);
                container.innerHTML = '<div style="color:white;text-align:center;padding:20px;"><p style="color:#00ff87;">✓ Conectado</p></div>';
            });

            conn.on('data', (data) => window.renderSlideshowData(data));

            conn.on('close', () => setTimeout(connect, 4000));

            conn.on('error', (err) => {
                console.error('Conn Error:', err);
                if (err.type === 'peer-unavailable') {
                    container.innerHTML = '<div style="color:white;text-align:center;padding:20px;"><p style="color:#ff4757;">Panel no encontrado</p></div>';
                    setTimeout(connect, 5000);
                }
            });
        });

        peer.on('error', (err) => {
            console.error('Peer Error:', err.type);
            if (err.type === 'network') {
                container.innerHTML = '<div style="color:white;text-align:center;padding:20px;">Error de red. Reintentando...</div>';
                setTimeout(connect, 5000);
            }
        });
    }

    connect();

    // Exportar función de renderizado para el fallback local
    window.renderSlideshowData = function (data) {
        container.innerHTML = '';
        const valid = data.images.filter(img => img !== null);

        if (!data.active || valid.length === 0) {
            if (timer) clearInterval(timer);
            container.innerHTML = '<div style="color:white;text-align:center;padding:20px;">Slideshow detenido.</div>';
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
            }, data.interval * 1000);
        }
    };
}
