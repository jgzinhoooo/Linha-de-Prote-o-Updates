// === INTEGRAÇÃO CAPACITOR (TELA CHEIA MOBILE) ===
import { StatusBar } from '@capacitor/status-bar';

window.addEventListener('DOMContentLoaded', async () => {
    try {
        await StatusBar.hide();
    } catch (e) {
        console.log("Executando no PC/Electron - StatusBar ignorada.");
    }
});

// === SISTEMA DE LOCAL STORAGE ===
function loadSetting(key, defaultVal) { return localStorage.getItem('linhaProtecao_' + key) || defaultVal; }
function saveSetting(key, value) { localStorage.setItem('linhaProtecao_' + key, value); }

let globalVolume = parseFloat(loadSetting('volume', 0.5));
let graphicsQuality = loadSetting('graphics', 'ultra'); 
let speedVal = loadSetting('speed', 'sync');
let speedMultiplier = speedVal === "144" ? 2.4 : (speedVal === "240" ? 4.0 : 1.0);

window.onload = function() {
    if (!localStorage.getItem('linhaProtecao_termsAccepted')) {
        document.getElementById('terms-modal').classList.remove('hidden');
    }
    
    document.getElementById('volume-slider').value = globalVolume;
    document.getElementById('graphics-select').value = graphicsQuality;
    document.getElementById('speed-select').value = speedVal;

    if (graphicsQuality === "low") { 
        document.getElementById('game-container').classList.remove('chromatic-glitch'); 
        document.getElementById('fear-vignette').style.display = 'none'; 
    }
};

function acceptTerms() {
    localStorage.setItem('linhaProtecao_termsAccepted', 'true');
    document.getElementById('terms-modal').classList.add('hidden');
    playClickSound();
}

// === CONTROLE DE MENUS E FETCH DO GITHUB ===
window.toggleOptions = function(show) {
    playClickSound();
    const modal = document.getElementById('options-modal');
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

window.toggleLogs = async function(show) {
    playClickSound();
    const modal = document.getElementById('logs-modal');
    if (show) {
        modal.classList.remove('hidden');
        const logsContainer = document.getElementById('logs-content-box');
        
        logsContainer.innerHTML = `
            <div class="spinner-container">
                <div class="spinner"></div>
                <p style="color: #aaa; font-size: 0.9rem; margin: 0;">Buscando atualizações no GitHub...</p>
            </div>
        `;
        
        try {
            const urlBypassCache = `https://raw.githubusercontent.com/jgzinhoooo/Linha-de-Prote-o-Updates/refs/heads/main/Logs?t=${Date.now()}`;
            const response = await fetch(urlBypassCache);
            if (!response.ok) throw new Error("Erro de conexão");
            
            const text = await response.text();
            let htmlContent = text.split('\n').map(line => {
                if (line.trim() === "") return "";
                let formattedLine = line.replace(/(v\d+(\.\d+)*(\.\d+)?(-[A-Z\s]+)?):/g, '<b style="color:#ff2d3f;">$1:</b>');
                return `<p style="margin-bottom: 10px;">${formattedLine}</p>`;
            }).join('');
            
            logsContainer.innerHTML = htmlContent;
        } catch (error) {
            logsContainer.innerHTML = `
                <p style="color: #ff4444;">Modo offline: Não foi possível conectar ao GitHub.</p>
                <p><b>v3.3.1:</b> Nova cinemática de descida do elevador adicionada, com delay perfeito antes do diálogo.</p>
            `;
        }
    } else {
        modal.classList.add('hidden');
    }
}

// === ENGINE DO JOGO ===
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let gameState = "menu"; 
let whiteBall = { x: 150, y: 540, radius: 24, speed: 540 }; 
let redBall = { x: 960, y: 60, radius: 24, speed: 312 }; 
let redAnimX = -50; 
let exExiting = false;
let exExitX = 800;
let keys = {}; let chaseTimerInterval; let timeLeft = 15; let isInfiniteMode = false;
let elevatorCalled = false; let elevatorOpening = false; let doorOffset = 0; 
let isEasterEgg = false; let lockedDoorIndex = Math.floor(Math.random() * 3); let lastDoorEntered = 0;
let isTouchActive = false; let joy = { active: false, x: 0, y: 0 }; let actionPressed = false;
let currentFloor = 5; let descentInterval;

let particles = []; let sparks = []; let dustParticles = []; let shadows = []; let lightSources = []; 
let screenShakeIntensity = 0; let chromaticAberration = 0; let lastTime = performance.now();

let globalLighting = { ambient: 0.7, flashlight: { x: 0, y: 0, radius: 220, intensity: 0.9, active: false }, neonLights: [], shadows: true }; 

for(let i=0; i<30; i++) particles.push({ x: Math.random() * 1920, y: Math.random() * 1080, size: Math.random() * 3.5 + 0.8, speedY: Math.random() * 42 + 18, alpha: Math.random() * 0.7 + 0.3 });
for(let i=0; i<60; i++) dustParticles.push({ x: Math.random() * 1920, y: Math.random() * 1080, size: Math.random() * 2 + 0.5, speedX: Math.random() * 20 - 10, speedY: Math.random() * 30 + 10, alpha: Math.random() * 0.4 + 0.1, rotation: Math.random() * Math.PI * 2, rotSpeed: Math.random() * 0.02 - 0.01 });

globalLighting.neonLights = [ { x: 400, y: 300, color: '#ff4444', intensity: 0.6, pulsing: true }, { x: 900, y: 300, color: '#4488ff', intensity: 0.6, pulsing: false }, { x: 1300, y: 300, color: '#ff4444', intensity: 0.6, pulsing: true } ];
const cars = [ {x: 200, y: 150, w: 350, h: 180}, {x: 600, y: 150, w: 350, h: 180}, {x: 1000, y: 150, w: 350, h: 180}, {x: 1400, y: 150, w: 350, h: 180}, {x: 200, y: 500, w: 350, h: 180}, {x: 600, y: 500, w: 350, h: 180}, {x: 1000, y: 500, w: 350, h: 180}, {x: 1400, y: 500, w: 350, h: 180} ];

window.updateVolume = function(val) { globalVolume = parseFloat(val); saveSetting('volume', val); }
window.updateGraphics = function(val) { 
    graphicsQuality = val; saveSetting('graphics', val);
    if (val === "low") { document.getElementById('game-container').classList.remove('chromatic-glitch'); document.getElementById('fear-vignette').style.display = 'none'; }
}

window.updateSpeedMode = function(val) {
    if (val === "sync") speedMultiplier = 1.0; else if (val === "144") speedMultiplier = 2.4; else if (val === "240") speedMultiplier = 4.0;
    saveSetting('speed', val);
}

window.toggleFullscreen = function() { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => {}); else document.exitFullscreen(); }

let audioCtx, sirenOsc, sirenGain, sirenInterval, menuMusicInterval, elevatorMusicInterval;
let noteIndex = 0; const muzakNotes = [261.63, 329.63, 392.00, 493.88, 392.00, 329.63]; 

function initAudio() { if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }

let menuMusicStarted = false;
window.startMenuMusicOnce = function() {
    if (menuMusicStarted) return; initAudio(); menuMusicStarted = true;
    menuMusicInterval = setInterval(() => {
        if (gameState !== "menu" || !audioCtx) return;
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.value = muzakNotes[noteIndex]; noteIndex = (noteIndex + 1) % muzakNotes.length;
        osc.connect(gain); gain.connect(audioCtx.destination); let vol = globalVolume * 0.08;
        gain.gain.setValueAtTime(0, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime + 0.2); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.35);
        osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.35);
    }, 500);
}

function playClickSound() {
    if (!audioCtx) return; const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.08);
    osc.connect(gain); gain.connect(audioCtx.destination); let vol = globalVolume * 0.1; gain.gain.setValueAtTime(vol, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.08);
    osc.start(); osc.stop(audioCtx.currentTime + 0.08);
}

function playDoorSound(opening) {
    if (!audioCtx) return; const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.connect(gain); gain.connect(audioCtx.destination);
    let startFreq = opening ? 40 : 120; let endFreq = opening ? 120 : 40;
    osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + 0.8);
    let vol = globalVolume * 0.1; gain.gain.setValueAtTime(vol, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
    osc.start(); osc.stop(audioCtx.currentTime + 0.8);
}

function startElevatorMusic() {
    if (!audioCtx) return;
    elevatorMusicInterval = setInterval(() => {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.type = 'sine'; osc.frequency.value = muzakNotes[noteIndex]; noteIndex = (noteIndex + 1) % muzakNotes.length;
        osc.connect(gain); gain.connect(audioCtx.destination); let vol = globalVolume * 0.06; gain.gain.setValueAtTime(0, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime + 0.2); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.35); osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.35);
    }, 400);
}
function stopElevatorMusic() { if (elevatorMusicInterval) { clearInterval(elevatorMusicInterval); elevatorMusicInterval = null; } }

function startSirenAudio() {
    if (!audioCtx) return; sirenOsc = audioCtx.createOscillator(); sirenGain = audioCtx.createGain();
    sirenOsc.type = 'sine'; sirenGain.gain.value = globalVolume * 0.15; sirenOsc.connect(sirenGain); sirenGain.connect(audioCtx.destination); sirenOsc.start();
    let isHigh = true; sirenInterval = setInterval(() => { if (sirenOsc) { sirenOsc.frequency.setTargetAtTime(isHigh ? 750 : 500, audioCtx.currentTime, 0.2); isHigh = !isHigh; } }, 600);
}
function stopSiren() { if (sirenOsc) { sirenOsc.stop(); sirenOsc.disconnect(); sirenOsc = null; } if (sirenInterval) clearInterval(sirenInterval); }

function playVictorySound() {
    if (!audioCtx) return; const notes = [{freq:440, t:0, d:0.15}, {freq:554.37, t:0.15, d:0.15}, {freq:659.25, t:0.3, d:0.15}, {freq:880, t:0.45, d:0.6}];
    notes.forEach(note => { const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.type = 'square'; osc.frequency.value = note.freq; osc.connect(gain); gain.connect(audioCtx.destination); let vol = globalVolume * 0.1; gain.gain.setValueAtTime(0, audioCtx.currentTime + note.t); gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + note.t + 0.05); gain.gain.setValueAtTime(vol, audioCtx.currentTime + note.t + note.d - 0.05); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + note.t + note.d); osc.start(audioCtx.currentTime + note.t); osc.stop(audioCtx.currentTime + note.t + note.d); });
}

function playGameOverSound() {
    if (!audioCtx) return; const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.type = 'sawtooth'; osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(300, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 1); let vol = globalVolume * 0.15; gain.gain.setValueAtTime(vol, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1); osc.start(); osc.stop(audioCtx.currentTime + 1);
}

window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase())) e.preventDefault(); });
window.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);
window.addEventListener('touchstart', function enableTouch() { isTouchActive = true; }, { once: true });

const joyBase = document.getElementById("joystick-base"); const joyStick = document.getElementById("joystick-stick");
function updateJoy(touch) { const rect = joyBase.getBoundingClientRect(); const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2; let dx = touch.clientX - centerX; let dy = touch.clientY - centerY; const maxDist = rect.width / 2.5; const dist = Math.sqrt(dx*dx + dy*dy); if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; } joy.x = dx / maxDist; joy.y = dy / maxDist; joyStick.style.transform = `translate(${dx}px, ${dy}px)`; }
joyBase.addEventListener("touchstart", (e) => { joy.active = true; updateJoy(e.touches[0]); }); joyBase.addEventListener("touchmove", (e) => { e.preventDefault(); if (joy.active) updateJoy(e.touches[0]); }, {passive: false}); joyBase.addEventListener("touchend", (e) => { joy.active = false; joy.x = 0; joy.y = 0; joyStick.style.transform = `translate(0px, 0px)`; });

const actionBtn = document.getElementById("action-btn"); actionBtn.addEventListener("touchstart", (e) => { e.preventDefault(); actionPressed = true; }); actionBtn.addEventListener("touchend", (e) => { e.preventDefault(); actionPressed = false; });

function isColliding(x, y, radius, rects) {
    for(let i=0; i<rects.length; i++) { let rect = rects[i]; let testX = x; let testY = y; if (x < rect.x) testX = rect.x; else if (x > rect.x + rect.w) testX = rect.x + rect.w; if (y < rect.y) testY = rect.y; else if (y > rect.y + rect.h) testY = rect.y + rect.h; let distX = x - testX; let distY = y - testY; if (Math.sqrt((distX*distX) + (distY*distY)) <= radius) return true; }
    return false;
}

window.checkDoorCode = function() {
    let code = document.getElementById("door-code").value; playClickSound(); isEasterEgg = (code === "1810"); document.getElementById("keypad-modal").classList.add("hidden"); document.getElementById("door-code").value = "";
    gameState = "room"; whiteBall.x = canvas.width / 2; whiteBall.y = canvas.height - 150; if (isTouchActive) document.getElementById('touch-controls').style.display = 'block'; 
}
window.closeKeypad = function() {
    playClickSound(); document.getElementById("keypad-modal").classList.add("hidden"); document.getElementById("door-code").value = ""; gameState = "corridor"; if (isTouchActive) document.getElementById('touch-controls').style.display = 'block';
}
window.callPolice = function() {
    let code = document.getElementById("phone-code").value; if(code === "180" || code === "190") { playClickSound(); document.getElementById("phone-modal").classList.add("hidden"); document.getElementById("phone-code").value = ""; isInfiniteMode = false; if(isTouchActive) document.getElementById("touch-controls").style.display = "block"; startChase(); } else { document.getElementById("phone-code").value = ""; }
}
window.startInfiniteEscape = function() {
    playClickSound(); document.getElementById("phone-modal").classList.add("hidden"); document.getElementById("phone-code").value = ""; isInfiniteMode = true; if(isTouchActive) document.getElementById("touch-controls").style.display = "block"; startChase();
}

window.initGame = function() {
    if (menuMusicInterval) { clearInterval(menuMusicInterval); menuMusicInterval = null; }
    initAudio(); playClickSound(); document.getElementById("screen-instructions").classList.add("hidden"); document.getElementById("screen-game").classList.remove("hidden");
    whiteBall.x = 150; whiteBall.y = 540; gameState = "corridor"; lastTime = performance.now(); if (isTouchActive) document.getElementById('touch-controls').style.display = 'block';
    requestAnimationFrame(loop);
}

// === LÓGICA DE DESCIDA DO ELEVADOR ===
function startElevatorDescent() {
    gameState = "elevator_descending";
    startElevatorMusic();
    currentFloor = 5;
    descentInterval = setInterval(() => {
        currentFloor--;
        if (currentFloor <= 0) {
            clearInterval(descentInterval);
            playDoorSound(true); 
            setTimeout(() => {
                startElevatorDialogue();
            }, 800); 
        }
    }, 1000); 
}

// === ENGINE DE RENDERIZAÇÃO BLINDADA ===
function loop(currentTime) {
    if (gameState === "menu" || gameState === "ended") return;
    let actualDelta = (currentTime - lastTime) / 1000; lastTime = currentTime;
    
    let deltaTime = actualDelta; 
    if (!deltaTime || deltaTime > 0.05) deltaTime = 0.01666; 
    deltaTime *= speedMultiplier;

    let moveX = 0; let moveY = 0;
    if (keys["arrowleft"] || keys["a"]) moveX = -1; if (keys["arrowright"] || keys["d"]) moveX = 1; if (keys["arrowup"] || keys["w"]) moveY = -1; if (keys["arrowdown"] || keys["s"]) moveY = 1;
    if (joy.active) { moveX = joy.x; moveY = joy.y; }

    if (gameState.includes("parking")) {
        updateParticles(deltaTime);
    }
    updateLighting(); 
    applyScreenEffects();
    
    ctx.globalAlpha = 1.0; 
    
    // PASSO 1: DESENHA O CENÁRIO DE FUNDO
    if (gameState.includes("parking") || gameState === "police_arrives") {
        let timeFactor = Date.now(); let isRedLight = (gameState === "parking_chase") && Math.floor(timeFactor / 400) % 2 === 0; 
        ctx.fillStyle = isRedLight ? "#1c0606" : "#07070c"; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = "rgba(255, 204, 0, 0.4)"; ctx.lineWidth = 4; ctx.setLineDash([20, 20]);
        for(let car of cars) { ctx.beginPath(); ctx.moveTo(car.x - 20, car.y - 20); ctx.lineTo(car.x + car.w + 20, car.y - 20); ctx.stroke(); ctx.beginPath(); ctx.moveTo(car.x - 20, car.y + car.h + 20); ctx.lineTo(car.x + car.w + 20, car.y + car.h + 20); ctx.stroke(); }
        ctx.setLineDash([]);
        for(let car of cars) { ctx.fillStyle = "#12121a"; ctx.fillRect(car.x, car.y, car.w, car.h); ctx.fillStyle = "#1a1a26"; ctx.fillRect(car.x + 30, car.y + 30, car.w - 60, car.h - 60); ctx.fillStyle = "rgba(255, 0, 0, 0.5)"; if(graphicsQuality==="high"){ctx.shadowColor="red"; ctx.shadowBlur=12;} ctx.fillRect(car.x + 10, car.y + car.h - 15, 30, 10); ctx.fillRect(car.x + car.w - 40, car.y + car.h - 15, 30, 10); ctx.shadowBlur=0; }
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (gameState === "corridor" || gameState === "keypad") {
            let wallGrad = ctx.createLinearGradient(0, 0, 0, 360); wallGrad.addColorStop(0, "#05050a"); wallGrad.addColorStop(1, "#181828"); ctx.fillStyle = wallGrad; ctx.fillRect(0, 0, canvas.width, 360); 
            ctx.fillStyle = "#0d0d14"; ctx.fillRect(0, 360, canvas.width, canvas.height - 360); ctx.strokeStyle = "#151522"; ctx.lineWidth = 2;
            for(let i = 0; i < canvas.width; i+= 150) { ctx.beginPath(); ctx.moveTo(i, 360); ctx.lineTo(i - 400, canvas.height); ctx.stroke(); }
            let doorPositions = [400, 900, 1300];
            for (let index = 0; index < doorPositions.length; index++) {
                let dX = doorPositions[index]; ctx.fillStyle = "#1e1410"; ctx.fillRect(dX, 180, 140, 180); ctx.strokeStyle = "#3d2417"; ctx.lineWidth = 4; ctx.strokeRect(dX, 180, 140, 180); ctx.fillStyle = "#d4af37"; ctx.fillRect(dX + 15, 270, 8, 20);
                if (graphicsQuality === "high") { ctx.shadowColor = (index === lockedDoorIndex) ? "#ff3333" : "#3388ff"; ctx.shadowBlur = 18; }
                ctx.fillStyle = (index === lockedDoorIndex) ? "#ff4444" : "#4488ff"; ctx.fillRect(dX + 55, 155, 30, 6); ctx.shadowBlur = 0;
            }
            let elevX = 1680; let elevY = 280;
            let targetOffset = elevatorOpening ? 90 : 0; doorOffset += (targetOffset - doorOffset) * (5 * deltaTime); 
            ctx.fillStyle = "#0c0c12"; ctx.fillRect(elevX, elevY, 180, 520); ctx.fillStyle = "#444"; ctx.fillRect(elevX, elevY, 90 - doorOffset, 520); ctx.fillRect(elevX + 90 + doorOffset, elevY, 90 - doorOffset, 520);
        } else if (gameState === "room") {
            ctx.fillStyle = "#12121a"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#0a0a0f"; ctx.fillRect(0, 0, canvas.width, 180); 
            ctx.fillStyle = "#251a2e"; ctx.fillRect(250, 220, 380, 300); ctx.fillStyle = "#3b284d"; ctx.fillRect(270, 240, 340, 80); 
            ctx.fillStyle = "#1f1f2b"; ctx.fillRect(1200, 220, 450, 220); if(graphicsQuality==="high"){ctx.shadowColor="#00ffff"; ctx.shadowBlur=20;}
            ctx.fillStyle = "#002b36"; ctx.fillRect(1350, 250, 150, 90); ctx.shadowBlur=0; ctx.fillStyle = "#111"; ctx.fillRect(1400, 340, 50, 20); 
            ctx.fillStyle = "#1a1a26"; ctx.beginPath(); ctx.ellipse(960, 650, 250, 100, 0, 0, Math.PI*2); ctx.fill();
            if (isEasterEgg) { if(graphicsQuality==="high") { ctx.shadowColor = "#0f0"; ctx.shadowBlur = 40; } ctx.fillStyle = "#031203"; ctx.fillRect(1250, 480, 350, 220); ctx.shadowBlur = 0; ctx.fillStyle = "#0f0"; ctx.font = "bold 40px monospace"; ctx.fillText("jgzin.dev", 1300, 560); ctx.font = "20px monospace"; ctx.fillText("> ACESSO AO SISTEMA", 1280, 610); ctx.fillText("> Easter Egg Liberado!", 1280, 650); }
        } else if (gameState === "elevator_closing" || gameState === "elevator_descending" || gameState === "elevator_dialogue") {
            ctx.fillStyle = "#08080f"; ctx.fillRect(0, 0, canvas.width, canvas.height); 
            ctx.fillStyle = "#181822"; ctx.fillRect(400, 350, 60, 380); ctx.fillStyle = "#222"; ctx.fillRect(410, 370, 40, 340);
            ctx.fillStyle = "#ff5555"; ctx.beginPath(); ctx.arc(430, 400, 8, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(430, 440, 8, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(430, 480, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#151824"; ctx.fillRect(600, 300, 720, 480); ctx.strokeStyle = "#333"; ctx.lineWidth = 6; ctx.strokeRect(600, 300, 720, 480); 
            ctx.fillStyle = "#555"; ctx.fillRect(460, 520, 140, 12); ctx.fillRect(1320, 520, 140, 12);
        }
    }

    // PASSO 2: ATUALIZAÇÃO E DESENHO DE PERSONAGENS E EFEITOS
    if (graphicsQuality === "ultra") drawShadows();
    
    if (gameState === "corridor") {
        let nextX = whiteBall.x + (moveX * whiteBall.speed * deltaTime); let nextY = whiteBall.y + (moveY * whiteBall.speed * deltaTime);
        if (nextX > 40 && nextX < 1880) { if (nextX > 1650 && doorOffset < 70) whiteBall.x = 1650; else whiteBall.x = nextX; }
        if (nextY > 400 && nextY < 680) whiteBall.y = nextY;
        
        if (whiteBall.x >= 1740 && whiteBall.y >= 320 && whiteBall.y <= 720) { 
            whiteBall.x = 1740; 
            gameState = "elevator_closing"; 
            redAnimX = -50; 
            playDoorSound(false); 
            createSparks(whiteBall.x, whiteBall.y, 20); 
            setTimeout(() => { startElevatorDescent(); }, 1000); 
        }
    } else if (gameState === "room") {
        let nextX = whiteBall.x + (moveX * whiteBall.speed * deltaTime); let nextY = whiteBall.y + (moveY * whiteBall.speed * deltaTime);
        if (nextX > 40 && nextX < canvas.width - 40) whiteBall.x = nextX; if (nextY > 180 && nextY < canvas.height + 40) whiteBall.y = nextY; 
        if (whiteBall.y > canvas.height + 20) { gameState = "corridor"; whiteBall.y = 450; isEasterEgg = false; if (lastDoorEntered === 0) whiteBall.x = 460; else if (lastDoorEntered === 1) whiteBall.x = 960; else if (lastDoorEntered === 2) whiteBall.x = 1360; }
    } else if (gameState === "parking_delay" || gameState === "parking_chase") {
        let nextX = whiteBall.x + (moveX * whiteBall.speed * deltaTime);  let nextY = whiteBall.y + (moveY * whiteBall.speed * deltaTime);
        if (nextX > 40 && nextX < canvas.width - 40 && !isColliding(nextX, whiteBall.y, whiteBall.radius, cars)) whiteBall.x = nextX;
        if (nextY > 40 && nextY < canvas.height - 40 && !isColliding(whiteBall.x, nextY, whiteBall.radius, cars)) whiteBall.y = nextY;
    }

    if (gameState === "parking_chase") {
        let speed = redBall.speed; 
        let dx = whiteBall.x - redBall.x; 
        let dy = whiteBall.y - redBall.y; 
        
        let targetX = redBall.x + Math.sign(dx) * speed * deltaTime;
        if (!isColliding(targetX, redBall.y, redBall.radius, cars)) {
            redBall.x = targetX;
        } else {
            redBall.y += (dy > 0 ? 1 : -1) * speed * 0.8 * deltaTime;
        }

        let targetY = redBall.y + Math.sign(dy) * speed * deltaTime;
        if (!isColliding(redBall.x, targetY, redBall.radius, cars)) {
            redBall.y = targetY;
        } else {
            redBall.x += (dx > 0 ? 1 : -1) * speed * 0.8 * deltaTime;
        }

        if (redBall.x < redBall.radius) redBall.x = redBall.radius; 
        if (redBall.y < redBall.radius) redBall.y = redBall.radius;
        if (redBall.x > canvas.width - redBall.radius) redBall.x = canvas.width - redBall.radius; 
        if (redBall.y > canvas.height - redBall.radius) redBall.y = canvas.height - redBall.radius;
        
        let collisionDist = Math.sqrt((whiteBall.x - redBall.x) ** 2 + (whiteBall.y - redBall.y) ** 2);
        if (collisionDist < (whiteBall.radius + redBall.radius)) { 
            createSparks(whiteBall.x, whiteBall.y, 30); 
            triggerBadEnding(); 
        }
        if (Math.random() > 0.95) createSparks(redBall.x + Math.random() * 40 - 20, redBall.y + Math.random() * 40 - 20, 3);
    }
    
    if (gameState !== "elevator_dialogue" && gameState !== "elevator_closing" && gameState !== "elevator_descending") {
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(whiteBall.x, whiteBall.y, whiteBall.radius, 0, Math.PI * 2); ctx.fill();
    }
    
    if (gameState === "parking_delay" || gameState === "parking_chase" || gameState === "police_arrives") { 
        ctx.fillStyle = "#ff2d3f"; ctx.beginPath(); ctx.arc(redBall.x, redBall.y, redBall.radius, 0, Math.PI * 2); ctx.fill(); 
    } 
    else if (gameState === "elevator_closing" || gameState === "elevator_descending" || gameState === "elevator_dialogue") {
        
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(800, 540, 24, 0, Math.PI * 2); ctx.fill(); 
        
        if (gameState === "elevator_descending") {
            ctx.fillStyle = "#ff2d3f"; ctx.font = "bold 40px monospace";
            ctx.fillText(currentFloor > 0 ? `ANDAR: 0${currentFloor}` : "TÉRREO", 900, 380);
        }

        if (gameState === "elevator_dialogue") {
            if (redAnimX < 960) redAnimX += 420 * deltaTime; 
            ctx.fillStyle = "#ff2d3f"; if(graphicsQuality==="high"){ctx.shadowColor="#ff2d3f"; ctx.shadowBlur=15;} 
            ctx.beginPath(); ctx.arc(redAnimX, 540, 30, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        }
    }
    
    if (gameState === "police_arrives") {
        let p1_x = redBall.x - 120; let p1_y = redBall.y; let p2_x = redBall.x + 120; let p2_y = redBall.y;
        ctx.fillStyle = "#8a2be2"; ctx.beginPath(); ctx.arc(p1_x, p1_y, 24, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(p2_x, p2_y, 24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#000"; ctx.fillRect(p1_x + 15, p1_y - 6, 45, 12); ctx.fillRect(p2_x - 60, p2_y - 6, 45, 12); 
    }

    // PASSO 3: DESENHA AS LUZES E PARTICULAS
    if (gameState.includes("parking") && (graphicsQuality === "ultra" || graphicsQuality === "high")) { 
        drawParticles(); 
        if (graphicsQuality === "ultra") drawAdvancedEffects(); 
    }

    // PASSO 4: TEXTOS DA UI
    ctx.globalAlpha = 1.0; 
    actionBtn.style.display = "none";
    
    if (gameState === "corridor") {
        let elevX = 1680; let distToElevator = elevX - whiteBall.x; let inElevatorRange = distToElevator < 300; let activeDoor = -1;
        if (whiteBall.y < 420) { if (whiteBall.x > 380 && whiteBall.x < 540) activeDoor = 0; else if (whiteBall.x > 880 && whiteBall.x < 1040) activeDoor = 1; else if (whiteBall.x > 1280 && whiteBall.x < 1440) activeDoor = 2; }
        
        let canInteract = (inElevatorRange && !elevatorCalled) || (activeDoor !== -1);
        if (canInteract) {
            ctx.fillStyle = "#fff"; ctx.font = "bold 28px Inter";
            if (activeDoor !== -1) ctx.fillText("Pressione [E] ou E (Botão mobile) para explorar", whiteBall.x - 220, 200); else ctx.fillText("Pressione [E] ou E (Botão mobile) para chamar o elevador", 950, 260);
            if (isTouchActive) actionBtn.style.display = "flex";
            if (keys["e"] || actionPressed) {
                playClickSound(); actionPressed = false; keys["e"] = false; createSparks(whiteBall.x, whiteBall.y, 5); 
                if (activeDoor !== -1) {
                    lastDoorEntered = activeDoor; 
                    if (activeDoor === lockedDoorIndex) { gameState = "keypad"; document.getElementById("keypad-modal").classList.remove("hidden"); document.getElementById("touch-controls").style.display = "none"; setTimeout(() => document.getElementById("door-code").focus(), 100); } 
                    else { isEasterEgg = false; gameState = "room"; whiteBall.x = canvas.width / 2; whiteBall.y = canvas.height - 150; }
                } else if (inElevatorRange) { elevatorCalled = true; actionBtn.style.display = "none"; let delayMs = Math.floor(Math.random() * 3000) + 2000; setTimeout(() => { elevatorOpening = true; playDoorSound(true); createSparks(1740, 500, 15); }, delayMs); }
            }
        }
        if (elevatorCalled && !elevatorOpening && doorOffset === 0) { ctx.fillStyle = "#ff2d3f"; ctx.font = "bold 28px Inter"; ctx.fillText("Elevador descendo... Aguarde.", 1280, 260); ctx.fillStyle = "#ff2d3f"; if(graphicsQuality==="high"){ctx.shadowColor = "#ff2d3f"; ctx.shadowBlur = 10;} ctx.fillRect(1650, 480, 10, 20); ctx.shadowBlur = 0; }
    }
    else if (gameState === "room") {
        ctx.fillStyle = "#fff"; ctx.font = "bold 26px Inter"; ctx.fillText("Desça até o fundo para sair da sala", canvas.width/2 - 250, canvas.height - 50);
    }
    else if (gameState === "parking_delay") {
        ctx.fillStyle = "#ffaa00"; ctx.font = "bold 36px Inter"; ctx.fillText("ATENÇÃO: Ele está chegando na garagem...", 960, 100);
    }
    else if (gameState === "parking_chase") {
        let timeFactor = Date.now(); let isRedLight = Math.floor(timeFactor / 400) % 2 === 0;
        ctx.fillStyle = (timeLeft <= 5) ? "#ff2d3f" : "#fff"; ctx.font = "bold 48px Inter"; 
        if (isInfiniteMode) ctx.fillText("MODO HARDCORE (Fuga Infinita)", 960, 80); else ctx.fillText(`Sobreviva: ${timeLeft}s`, 960, 80);
        ctx.font = "24px Inter"; ctx.fillStyle = isRedLight ? "#ff4444" : "#4444ff"; ctx.fillText(isInfiniteMode ? "NINGUÉM VEM TE AJUDAR!" : "A POLÍCIA ESTÁ CHEGANDO!", 960, 130);
    }
    else if (gameState === "police_arrives") {
        ctx.fillStyle = "#fff"; ctx.font = "bold 60px Inter"; ctx.fillText("POLÍCIA! MÃO NA CABEÇA!", 960, 120);
    }

    if (gameState !== "ended") requestAnimationFrame(loop);
}

function startElevatorDialogue() {
    gameState = "elevator_dialogue"; document.getElementById("touch-controls").style.display = "none";
    let checkEntry = setInterval(() => { if (redAnimX >= 960) { clearInterval(checkEntry); document.getElementById("dialogue-box").classList.remove("hidden"); showDialogueStep(1); } }, 50);
}

function showDialogueStep(step) {
    const speaker = document.getElementById("dialogue-speaker"); const text = document.getElementById("dialogue-text"); const choices = document.getElementById("dialogue-choices"); choices.innerHTML = ""; 
    if (step === 1) { speaker.style.color = "#ff2d3f"; speaker.textContent = "Ex-Namorado"; text.textContent = "Achou que bloqueando meu número eu não ia te achar? A gente tem muita coisa pra resolver."; addChoice("Não temos nada pra resolver. Sai daqui.", () => showDialogueStep(2)); addChoice("Como você descobriu meu endereço?!", () => showDialogueStep(2)); } 
    else if (step === 2) { speaker.style.color = "#fff"; speaker.textContent = "Mulher (Você)"; text.textContent = "Acabou. Por favor, sai da porta desse elevador agora."; addChoice("Continuar", () => showDialogueStep(3)); }
    else if (step === 3) { speaker.style.color = "#ff2d3f"; speaker.textContent = "Ex-Namorado"; text.textContent = "Você acha que essa sua vidinha nova vai apagar o que a gente tem? Você me pertence."; addChoice("Tentar manter a calma...", () => showDialogueStep(4)); addChoice("Eu vou chamar a polícia!", () => showDialogueStep(4)); }
    else if (step === 4) { speaker.style.color = "#fff"; speaker.textContent = "Mulher (Você)"; text.textContent = "(Ele apertou o botão para o subsolo... Meu Deus, o elevador tá descendo!)"; addChoice("Continuar", () => showDialogueStep(5)); }
    else if (step === 5) { speaker.style.color = "#ff2d3f"; speaker.textContent = "Ex-Namorado"; text.textContent = "Chama. Quero ver quem vai ouvir seus gritinhos na garagem vazia."; addChoice("(O elevador para e a porta abre...)", () => showDialogueStep(6)); }
    else if (step === 6) { speaker.style.color = "#fff"; speaker.textContent = "Mulher (Você)"; text.textContent = "(Ele saiu correndo na minha frente para o subsolo!)"; exExiting = true; let exitInterval = setInterval(() => { exExitX += 12; if (exExitX > 1200) { clearInterval(exitInterval); exExiting = false; showPhoneCall(); } }, 30); }
}

function addChoice(text, onClickFunction) { let btn = document.createElement("button"); btn.className = "btn"; btn.textContent = text; btn.onclick = () => { playClickSound(); onClickFunction(); }; document.getElementById("dialogue-choices").appendChild(btn); }

function showPhoneCall() {
    document.getElementById("dialogue-box").classList.add("hidden"); gameState = "parking_call"; stopElevatorMusic(); playDoorSound(true); document.getElementById("phone-modal").classList.remove("hidden");
    if(isTouchActive) document.getElementById("touch-controls").style.display = "none"; 
    whiteBall.x = 960; whiteBall.y = 800; 
}

function startChase() {
    gameState = "parking_delay"; 
    redBall.x = 960; 
    redBall.y = 60; 

    let randomDelay = Math.floor(Math.random() * 2000) + 3000; 

    setTimeout(() => {
        if (gameState === "parking_delay") {
            gameState = "parking_chase";
            setTimeout(startSirenAudio, 200); 
            
            timeLeft = 15;
            if (chaseTimerInterval) clearInterval(chaseTimerInterval);
            chaseTimerInterval = setInterval(() => { 
                if (!isInfiniteMode && gameState === "parking_chase") { 
                    timeLeft--; 
                    if (timeLeft <= 0) { 
                        clearInterval(chaseTimerInterval); 
                        triggerPoliceArrival(); 
                    } 
                } 
            }, 1000);
        }
    }, randomDelay);
}

function triggerBadEnding() {
    gameState = "ended"; stopSiren(); playGameOverSound(); document.getElementById("touch-controls").style.display = "none";
    createSparks(whiteBall.x, whiteBall.y, 50); document.getElementById('game-container').classList.add('screen-shake'); setTimeout(() => document.getElementById('game-container').classList.remove('screen-shake'), 1000);
    clearInterval(chaseTimerInterval); document.getElementById("screen-game").classList.add("hidden"); document.getElementById("screen-end-bad").classList.remove("hidden");
}

function triggerPoliceArrival() {
    gameState = "police_arrives"; stopSiren(); clearInterval(chaseTimerInterval); document.getElementById("touch-controls").style.display = "none";
    screenShakeIntensity = 0; chromaticAberration = 0; document.getElementById('tension-overlay').style.opacity = '0'; document.getElementById('game-container').classList.remove('screen-shake', 'chromatic-glitch');
    setTimeout(() => { gameState = "ended"; playVictorySound(); document.getElementById("screen-game").classList.add("hidden"); document.getElementById("screen-end-good").classList.remove("hidden"); }, 3000);
}

function updateParticles(deltaTime) {
    for(let p of particles) { p.y -= p.speedY * deltaTime; if (p.y < 0) p.y = canvas.height; }
    let speedMod = 0.2; 
    for(let d of dustParticles) { d.x += d.speedX * speedMod * deltaTime; d.y -= d.speedY * speedMod * deltaTime; d.rotation += d.rotSpeed; if (d.y < 0) { d.y = canvas.height; d.x = Math.random() * 1920; } if (d.x < 0) d.x = 1920; if (d.x > 1920) d.x = 0; }
    for(let i = sparks.length - 1; i >= 0; i--) { let spark = sparks[i]; spark.x += spark.vx * deltaTime; spark.y += spark.vy * deltaTime; spark.life -= deltaTime; spark.vy += 200 * deltaTime; if (spark.life <= 0) sparks.splice(i, 1); }
}

function updateLighting() {
    globalLighting.flashlight.x = whiteBall.x; globalLighting.flashlight.y = whiteBall.y; globalLighting.flashlight.active = (gameState.includes('parking'));
    if (globalLighting.flashlight.active) { if (Math.random() > 0.92) globalLighting.flashlight.intensity = 0.5 + Math.random() * 0.5; else globalLighting.flashlight.intensity = 0.85; }
    let time = Date.now() * 0.003; for(let light of globalLighting.neonLights) { if (light.pulsing) light.intensity = 0.4 + Math.sin(time) * 0.3; }
}

function applyScreenEffects() {
    const container = document.getElementById('game-container'); const tensionOverlay = document.getElementById('tension-overlay'); const fearVignette = document.getElementById('fear-vignette');
    if (graphicsQuality === "ultra") {
        if (gameState === "parking_chase") { screenShakeIntensity = Math.min(screenShakeIntensity + 0.02, 1.0); container.classList.add('screen-shake'); chromaticAberration = Math.min(chromaticAberration + 0.01, 0.8); if (chromaticAberration > 0.3) container.classList.add('chromatic-glitch'); tensionOverlay.style.opacity = Math.min(screenShakeIntensity * 0.6, 0.4).toString(); fearVignette.style.display = 'block'; } 
        else { container.classList.remove('screen-shake', 'chromatic-glitch'); tensionOverlay.style.opacity = '0'; fearVignette.style.display = 'none'; screenShakeIntensity *= 0.95; chromaticAberration *= 0.95; }
    }
}

function drawParticles() {
    ctx.fillStyle = "rgba(255,255,255,0.25)"; 
    for(let p of particles) { ctx.globalAlpha = p.alpha; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); }
    
    for(let d of dustParticles) { ctx.globalAlpha = d.alpha * 1.5; ctx.fillStyle = "rgba(200,200,200,0.3)"; ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rotation); ctx.fillRect(-d.size/2, -d.size/2, d.size * 1.5, d.size * 1.5); ctx.restore(); }
    
    for(let spark of sparks) { ctx.globalAlpha = spark.life; ctx.fillStyle = spark.color; ctx.beginPath(); ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI*2); ctx.fill(); }
    
    ctx.globalAlpha = 1.0; 
}

function drawAdvancedEffects() {
    ctx.globalCompositeOperation = 'multiply'; 
    ctx.fillStyle = `rgba(0,0,0,${1 - globalLighting.ambient})`; 
    ctx.fillRect(0, 0, canvas.width, canvas.height); 
    
    ctx.globalCompositeOperation = 'lighter';
    if (globalLighting.flashlight.active) { 
        let gradient = ctx.createRadialGradient(globalLighting.flashlight.x, globalLighting.flashlight.y, 0, globalLighting.flashlight.x, globalLighting.flashlight.y, globalLighting.flashlight.radius); 
        gradient.addColorStop(0, `rgba(255,255,200,${globalLighting.flashlight.intensity})`); 
        gradient.addColorStop(0.6, 'rgba(255,255,200,0.3)'); 
        gradient.addColorStop(1, 'rgba(255,255,200,0)'); 
        ctx.fillStyle = gradient; 
        ctx.fillRect(globalLighting.flashlight.x - globalLighting.flashlight.radius, globalLighting.flashlight.y - globalLighting.flashlight.radius, globalLighting.flashlight.radius * 2, globalLighting.flashlight.radius * 2); 
    }
    for(let light of globalLighting.neonLights) { 
        if (gameState === "corridor" || gameState === "keypad") { 
            let gradient = ctx.createRadialGradient(light.x + 70, light.y - 25, 0, light.x + 70, light.y - 25, 100); 
            gradient.addColorStop(0, light.color + Math.floor(light.intensity * 255).toString(16).padStart(2, '0')); 
            gradient.addColorStop(1, light.color + '00'); 
            ctx.fillStyle = gradient; 
            ctx.fillRect(light.x - 30, light.y - 125, 200, 200); 
        } 
    }
    
    ctx.globalCompositeOperation = 'source-over'; 
    drawProceduralTextures();
}

function drawProceduralTextures() {
    if (gameState === "corridor" || gameState === "keypad") { ctx.save(); ctx.globalAlpha = 0.15; ctx.fillStyle = '#333'; for(let x = 0; x < canvas.width; x += 40) { for(let y = 360; y < canvas.height; y += 40) { if (Math.random() > 0.7) ctx.fillRect(x + Math.random() * 10, y + Math.random() * 10, Math.random() * 20 + 5, Math.random() * 20 + 5); } } ctx.restore(); }
    if (gameState.includes('parking')) { ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = '#222'; for(let x = 0; x < canvas.width; x += 30) { for(let y = 0; y < canvas.height; y += 30) { if (Math.random() > 0.8) { ctx.beginPath(); ctx.arc(x + Math.random() * 30, y + Math.random() * 30, Math.random() * 3 + 1, 0, Math.PI * 2); ctx.fill(); } } } ctx.restore(); }
}

function createSparks(x, y, count = 10) { if (graphicsQuality === "ultra" || graphicsQuality === "high") { for(let i = 0; i < count; i++) { sparks.push({ x: x + Math.random() * 20 - 10, y: y + Math.random() * 20 - 10, vx: Math.random() * 200 - 100, vy: Math.random() * 200 - 100, size: Math.random() * 4 + 2, life: Math.random() * 0.8 + 0.5, color: ['#ff4444', '#ffaa00', '#ffffff'][Math.floor(Math.random() * 3)] }); } } }
function drawShadows() { if (globalLighting.shadows && (graphicsQuality === "ultra")) { ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(whiteBall.x + 5, whiteBall.y + whiteBall.radius + 3, whiteBall.radius * 0.8, whiteBall.radius * 0.3, 0, 0, Math.PI * 2); ctx.fill(); if (gameState.includes('parking')) { for(let car of cars) ctx.fillRect(car.x + 10, car.y + car.h + 2, car.w, car.h * 0.2); } ctx.restore(); } }
