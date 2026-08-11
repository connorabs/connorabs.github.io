// Game Configuration (Dynamic)
let CANVAS_WIDTH = 400;
let CANVAS_HEIGHT = 800;
const NUM_LANES = 4;
let LANE_WIDTH = 100;
let HIT_LINE_Y = CANVAS_HEIGHT - 55; // Default assumption based on NOTE_RADIUS 38 + 17
let isUpscroll = false;
let SCROLL_SPEED = 1000; 
let NOTE_RADIUS = 38; 
let COLOR_CIRCLE = '#ffffff';
let COLOR_LN_BODY = '#ffffff';
let COLOR_LN_BORDER = '#ffffff';
let KEYBINDS = ['KeyA', 'KeyS', 'KeyK', 'KeyL'];
let KEY_MAP = { 'KeyA': 0, 'KeyS': 1, 'KeyK': 2, 'KeyL': 3 };
let COLOR_UR_CENTER = '#ffffff';
let COLOR_UR_INNER = '#33ccff';
let COLOR_UR_OUTER = '#ffcc00';

function updateKeyMap() {
    KEY_MAP = {};
    KEYBINDS.forEach((key, index) => {
        KEY_MAP[key] = index;
    });
}

const LEAD_IN = 3000;
let GLOBAL_OFFSET = 0; // ms, positive = hit later, negative = hit earlier

  // Hit windows (ms)
  let WINDOW_320 = 16.1;
  let WINDOW_300 = 40;
  let WINDOW_200 = 73;
  let WINDOW_100 = 103;
  let WINDOW_50 = 127;
  let MISS_WINDOW = 164;
  
  function updateHitWindows(od = 8) {
      WINDOW_320 = od <= 5 ? 22.4 - 0.6 * od : 24.9 - 1.1 * od;
      WINDOW_300 = 64 - 3 * od;
      WINDOW_200 = 97 - 3 * od;
      WINDOW_100 = 127 - 3 * od;
      WINDOW_50 = 151 - 3 * od;
      MISS_WINDOW = 188 - 3 * od;
  }
  updateHitWindows(8); // default to OD 8

// Colors
const COLORS = {
    laneBg: 'rgba(255, 255, 255, 0.03)',
    laneBorder: 'transparent', // removed stage lines
    hitLine: '#ffffff', // simple white line
    note: '#ffffff', // pure white circles
    lnBody: 'rgba(255, 255, 255, 0.4)', // white LN bodies
    receptor: '#111', // canvas background color so it hides the hit line!
    receptorActive: 'rgba(255, 255, 255, 0.2)' // slight white glow when pressed
};

// ---------------------------------------------------------------------------
// Pattern library is now loaded from window.GAME_PATTERNS in patterns.js
// ---------------------------------------------------------------------------

const MAX_DIFFICULTY = window.GAME_PATTERNS.reduce((max, p) => Math.max(max, p.difficulty), 1);

// State
let score = 0;
let bonus = 100;
let totalHitObjects = 1;
let combo = 0;
let maxCombo = 0;
let totalHits = 0;
let totalNotesPassed = 0;
let totalNotesHit = 0;

const hitBonusValue = { 320: 32, 300: 32, 200: 16, 100: 8, 50: 4, 0: 0 };
const hitBonusChange = { 320: 2, 300: 1, 200: -8, 100: -24, 50: -44, 0: -100 };

function applyHitScore(pts) {
    const change = hitBonusChange[pts] !== undefined ? hitBonusChange[pts] : -100;
    bonus = Math.max(0, Math.min(100, bonus + change));
    
    const baseScore = ((1000000 / 2 / totalHitObjects) * pts) / 320;
    const bonusVal = hitBonusValue[pts] || 0;
    const bonusScore = ((1000000 / 2 / totalHitObjects) * bonusVal * Math.sqrt(bonus)) / 320;
    
    score += Math.round(baseScore + bonusScore);
}

function getAccuracy() {
    const totalJudgments = judgmentCounts[320] + judgmentCounts[300] + judgmentCounts[200] + judgmentCounts[100] + judgmentCounts[50] + judgmentCounts.miss;
    if (totalJudgments === 0) return 100.0;
    const weightedHits = (305 * judgmentCounts[320]) + (300 * judgmentCounts[300]) + (200 * judgmentCounts[200]) + (100 * judgmentCounts[100]) + (50 * judgmentCounts[50]);
    const maxPossibleHits = 305 * totalJudgments;
    return (weightedHits / maxPossibleHits) * 100;
}
let gameTime = 0;
let isPlaying = false;
let lastTime = 0;
let fpsFrames = 0;
let lastFpsTime = 0;
let accumulator = 0;
let isUIUpdateScheduled = false;
let lastScore = -1;
let lastCombo = -1;
let lastAccText = '';
let lastHp = -1;
let lastKps = -1;
let hasAudio = false;
let hp = 100;
let isFailed = false;
let isPaused = false;
let isResultsScreen = false;
let customMapData = null; // Holds validated map JSON

// Judgment counters for results screen
let judgmentCounts = { 320: 0, 300: 0, 200: 0, 100: 0, 50: 0, miss: 0 };

// Audio Context for Hit Sounds
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let synthHitSoundBuffer = null;

function initSynthHitSound() {
    try {
        const sampleRate = audioCtx.sampleRate;
        const duration = 0.06;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate;
            const freq = 800 * Math.exp(-30 * t);
            const amp = 0.1 * Math.exp(-50 * t);
            data[i] = Math.sign(Math.sin(2 * Math.PI * freq * t)) * amp;
        }
        synthHitSoundBuffer = buffer;
    } catch (e) {
        console.error("Failed to generate synth hitsound buffer:", e);
    }
}
initSynthHitSound();

// Notes array { lane: 0..3, time: seconds, hit: boolean, active: boolean }
let notes = [];
let currentTimingPoints = [];
let mapDuration = 0;
let activeHits = [0, 0, 0, 0]; // hit-glow animation timers
let activeKeys = [false, false, false, false]; // held-key states
let activeHolds = [null, null, null, null]; // currently held Long Notes
let hitErrors = []; // tracks recent hit timings {diff: float, alpha: 1.0}
let currentNoteIndex = 0;

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const scoreEl = document.getElementById('hud-score');
const comboEl = document.getElementById('combo');
const accuracyEl = document.getElementById('hud-accuracy');
const accuracyTextEl = document.getElementById('accuracy-text');
const kpsEl = document.getElementById('hud-kps');
const fpsEl = document.getElementById('hud-fps');
const judgementEl = document.getElementById('judgement');
const progressPie = document.getElementById('progress-pie');
const pieCtx = progressPie ? progressPie.getContext('2d') : null;

// Offscreen Canvases for Optimization
const preNoteCanvas = document.createElement('canvas');
const preNoteCtx = preNoteCanvas.getContext('2d');
const preStageLightCanvas = document.createElement('canvas');
const preStageLightCtx = preStageLightCanvas.getContext('2d');
const preLNBodyCanvas = document.createElement('canvas');
const preLNBodyCtx = preLNBodyCanvas.getContext('2d');
const preLNTailCanvas = document.createElement('canvas');
const preLNTailCtx = preLNTailCanvas.getContext('2d');

// New HUD elements
const hudHpFill = document.getElementById('hp-bar-fill');
let hudState = {
    score: {x: 0, y: 0, scale: 1},
    accuracy: {x: 0, y: 0, scale: 1},
    pie: {x: 0, y: 0, scale: 1},
    kps: {x: 0, y: 0, scale: 1},
    fps: {x: 0, y: 0, scale: 1},
    hp: {x: 0, y: 0, scale: 1},
    judgment: {x: 0, y: 0, scale: 1},
    urBar: {x: 0, y: 0, scale: 1}
};

let draggingHudId = null;

document.querySelectorAll('.draggable-hud').forEach(el => {
    el.addEventListener('mousedown', (e) => {
        draggingHudId = el.dataset.hud;
    });
});

window.addEventListener('mousemove', (e) => {
    if (draggingHudId) {
        const state = hudState[draggingHudId];
        state.x += e.movementX;
        state.y += e.movementY;
        applyHudState(draggingHudId);
    }
});

window.addEventListener('mouseup', () => {
    if (draggingHudId) {
        draggingHudId = null;
        saveSettings();
    }
});

function applyHudState(id) {
    const el = document.querySelector(`[data-hud="${id}"]`);
    if (el) {
        const state = hudState[id];
        el.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    }
}

let keyPressTimes = [];
const statusMessage = document.getElementById('status-message');
const startBtn = document.getElementById('start-btn');
const bpmInput = document.getElementById('bpm-input');
const speedSlider = document.getElementById('speed-slider');
const densitySlider = document.getElementById('density-slider');
const practiceDurationInput = document.getElementById('practice-duration-input');
const patternSelections = document.getElementById('pattern-selections');
const mapUpload = document.getElementById('map-upload');
const oszUpload = document.getElementById('osz-upload');
const audioUpload = document.getElementById('audio-upload');
const bgm = document.getElementById('bgm');
const noFailCheckbox = document.getElementById('no-fail-checkbox');
const keybindInputs = document.querySelectorAll('.keybind-input');
const tabGame = document.getElementById('tab-game');
const tabCustom = document.getElementById('tab-custom');
const sectionGame = document.getElementById('section-game');
const sectionCustom = document.getElementById('section-custom');
const laneWidthSlider = document.getElementById('lane-width-slider');
const stageHeightSlider = document.getElementById('stage-height-slider');
const noteSizeSlider = document.getElementById('note-size-slider');
const judgementSizeSlider = document.getElementById('judgement-size-slider');
const circleColorPicker = document.getElementById('circle-color-picker');
const lnBodyColorPicker = document.getElementById('ln-body-color-picker');
const lnBorderColorPicker = document.getElementById('ln-border-color-picker');
const upscrollToggle = document.getElementById('upscroll-toggle');
const fpsLimitSelect = document.getElementById('fps-limit-select');
const stageLightToggle = document.getElementById('stage-light-toggle');
const stageLightOpacitySlider = document.getElementById('stage-light-opacity-slider');
const stageLightOpacityGroup = document.getElementById('stage-light-opacity-group');
const hitSoundToggle = document.getElementById('hit-sound-toggle');
const hitSoundUploadGroup = document.getElementById('hit-sound-upload-group');
const hitSoundUpload = document.getElementById('hit-sound-upload');

const hpColorHigh = document.getElementById('hp-color-high');
const hitErrorBar = document.getElementById('hit-error-bar');

const htCheckbox = document.getElementById('half-time');
const dtCheckbox = document.getElementById('double-time');

function getPlaybackRate() {
    if (dtCheckbox && dtCheckbox.checked) return 1.5;
    if (htCheckbox && htCheckbox.checked) return 0.75;
    return 1.0;
}

const hpColorMid = document.getElementById('hp-color-mid');
const hpColorLow = document.getElementById('hp-color-low');
const fpsColorPicker = document.getElementById('fps-color-picker');
const kpsColorPicker = document.getElementById('kps-color-picker');

const scaleSliders = {
    score: document.getElementById('scale-score'),
    accuracy: document.getElementById('scale-accuracy'),
    kps: document.getElementById('scale-kps'),
    fps: document.getElementById('scale-fps'),
    pie: document.getElementById('scale-pie'),
    hp: document.getElementById('scale-hp'),
    judgment: document.getElementById('scale-judgment'),
    urBar: document.getElementById('scale-ur-bar-size')
};

const urCenterColorPicker = document.getElementById('ur-center-color-picker');
const urInnerColorPicker = document.getElementById('ur-inner-color-picker');
const urOuterColorPicker = document.getElementById('ur-outer-color-picker');

// ---------------------------------------------------------------------------
// LocalStorage Saving & Loading
// ---------------------------------------------------------------------------

// Tab logic
tabGame.addEventListener('click', () => {
    tabGame.classList.add('active');
    tabCustom.classList.remove('active');
    sectionGame.style.display = 'flex';
    sectionCustom.style.display = 'none';
});

tabCustom.addEventListener('click', () => {
    tabCustom.classList.add('active');
    tabGame.classList.remove('active');
    sectionCustom.style.display = 'flex';
    sectionGame.style.display = 'none';
});

// Setup pattern checkboxes
window.GAME_PATTERNS.forEach(pattern => {
    const label = document.createElement('label');
    label.className = 'pattern-checkbox-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.pattern = pattern.name;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(pattern.name));
    patternSelections.appendChild(label);
});

// ---------------------------------------------------------------------------
// LocalStorage Saving & Loading
// ---------------------------------------------------------------------------
function saveSettings() {
    const settings = {
        keybinds: KEYBINDS,
        noFail: noFailCheckbox.checked,
        bpm: bpmInput.value,
        speed: speedSlider.value,
        density: densitySlider.value,
        practiceDuration: practiceDurationInput.value,
        laneWidth: laneWidthSlider.value,
        stageHeight: stageHeightSlider.value,
        noteSize: noteSizeSlider.value,
        judgementSize: judgementSizeSlider.value,
        circleColor: circleColorPicker.value,
        lnBodyColor: lnBodyColorPicker.value,
        lnBorderColor: lnBorderColorPicker.value,
        upscroll: upscrollToggle.checked,
        fpsLimit: fpsLimitSelect.value,
        stageLights: stageLightToggle.checked,
        stageLightOpacity: stageLightOpacitySlider.value,
        hitSounds: hitSoundToggle.checked,
        hpColorHigh: hpColorHigh.value,
        hpColorMid: hpColorMid.value,
        hpColorLow: hpColorLow.value,
        fpsColor: fpsColorPicker.value,
        kpsColor: kpsColorPicker.value,
        urCenterColor: urCenterColorPicker.value,
        urInnerColor: urInnerColorPicker.value,
        urOuterColor: urOuterColorPicker.value,
        offset: GLOBAL_OFFSET,
        hudState: hudState,
        patterns: Array.from(patternSelections.querySelectorAll('input')).map(cb => ({ name: cb.dataset.pattern, checked: cb.checked }))
    };
    localStorage.setItem('osuManiaSimSettings', JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem('osuManiaSimSettings');
    if (!saved) return;
    try {
        const settings = JSON.parse(saved);
        
        if (settings.keybinds) {
            KEYBINDS = settings.keybinds;
            updateKeyMap();
            keybindInputs.forEach((input, i) => input.value = KEYBINDS[i].replace('Key', '').replace('Arrow', ''));
        }
        if (settings.noFail !== undefined) noFailCheckbox.checked = settings.noFail;
        if (settings.bpm) bpmInput.value = settings.bpm;
        if (settings.speed) {
            speedSlider.value = settings.speed;
            SCROLL_SPEED = 20000 / parseInt(settings.speed);
        }
        if (settings.density) densitySlider.value = settings.density;
        if (settings.practiceDuration) practiceDurationInput.value = settings.practiceDuration;
        
        if (settings.laneWidth) laneWidthSlider.value = settings.laneWidth;
        if (settings.stageHeight) stageHeightSlider.value = settings.stageHeight;
        if (settings.noteSize) noteSizeSlider.value = settings.noteSize;
        if (settings.judgementSize) judgementSizeSlider.value = settings.judgementSize;
        if (settings.circleColor) circleColorPicker.value = settings.circleColor;
        if (settings.lnBodyColor) lnBodyColorPicker.value = settings.lnBodyColor;
        if (settings.lnBorderColor) lnBorderColorPicker.value = settings.lnBorderColor;
        
        if (settings.upscroll !== undefined) upscrollToggle.checked = settings.upscroll;
        if (settings.fpsLimit !== undefined) fpsLimitSelect.value = settings.fpsLimit;
        if (settings.stageLights !== undefined) stageLightToggle.checked = settings.stageLights;
        if (settings.stageLightOpacity !== undefined) stageLightOpacitySlider.value = settings.stageLightOpacity;
        if (settings.hitSounds !== undefined) hitSoundToggle.checked = settings.hitSounds;
        
        if (settings.hpColorHigh) hpColorHigh.value = settings.hpColorHigh;
        if (settings.hpColorMid) hpColorMid.value = settings.hpColorMid;
        if (settings.hpColorLow) hpColorLow.value = settings.hpColorLow;
        if (settings.fpsColor) fpsColorPicker.value = settings.fpsColor;
        if (settings.kpsColor) kpsColorPicker.value = settings.kpsColor;
        if (settings.urCenterColor) urCenterColorPicker.value = settings.urCenterColor;
        if (settings.urInnerColor) urInnerColorPicker.value = settings.urInnerColor;
        if (settings.urOuterColor) urOuterColorPicker.value = settings.urOuterColor;
        if (settings.offset !== undefined) {
            GLOBAL_OFFSET = settings.offset;
            const offsetSlider = document.getElementById('offset-slider');
            const offsetValue = document.getElementById('offset-value');
            if (offsetSlider) offsetSlider.value = GLOBAL_OFFSET;
            if (offsetValue) offsetValue.textContent = GLOBAL_OFFSET + 'ms';
        }
        
        if (settings.hudState !== undefined) {
            hudState = { ...hudState, ...settings.hudState };
            Object.keys(hudState).forEach(key => {
                if (scaleSliders[key]) {
                    scaleSliders[key].value = hudState[key].scale;
                }
                applyHudState(key);
            });
        }
        
        if (settings.patterns) {
            const inputs = patternSelections.querySelectorAll('input');
            inputs.forEach(cb => {
                const savedPat = settings.patterns.find(p => p.name === cb.dataset.pattern);
                if (savedPat) cb.checked = savedPat.checked;
            });
        }
        
        applyDynamicSettings();

        // Update UI states based on loaded toggles
        if (typeof updateStageLightUI === 'function') updateStageLightUI();
        if (typeof updateHitSoundUI === 'function') updateHitSoundUI();
    } catch (e) {
        console.error("Failed to load settings", e);
    }
}

// Visibility of opacity slider
function updateStageLightUI() {
    stageLightOpacityGroup.style.display = stageLightToggle.checked ? 'flex' : 'none';
}
stageLightToggle.addEventListener('change', updateStageLightUI);
updateStageLightUI();

function updateHitSoundUI() {
    hitSoundUploadGroup.style.display = hitSoundToggle.checked ? 'flex' : 'none';
}
hitSoundToggle.addEventListener('change', updateHitSoundUI);
updateHitSoundUI();

function applyDynamicSettings() {
    LANE_WIDTH = parseInt(laneWidthSlider.value);
    NOTE_RADIUS = parseInt(noteSizeSlider.value);
    const jSize = parseInt(judgementSizeSlider.value);
    judgementEl.style.fontSize = jSize + 'px';
    COLOR_CIRCLE = circleColorPicker.value;
    COLOR_LN_BODY = lnBodyColorPicker.value;
    COLOR_LN_BORDER = lnBorderColorPicker.value;
    COLOR_UR_CENTER = urCenterColorPicker.value;
    COLOR_UR_INNER = urInnerColorPicker.value;
    COLOR_UR_OUTER = urOuterColorPicker.value;
    isUpscroll = upscrollToggle.checked;
    
    if (fpsEl) fpsEl.style.color = fpsColorPicker.value;
    if (kpsEl) kpsEl.style.color = kpsColorPicker.value;
    
    // IMPORTANT: Update canvas dimensions BEFORE calculating HIT_LINE_Y
    CANVAS_WIDTH = LANE_WIDTH * NUM_LANES;
    canvas.width = CANVAS_WIDTH;
    document.getElementById('game-container').style.width = CANVAS_WIDTH + 'px';
    
    CANVAS_HEIGHT = parseInt(stageHeightSlider.value);
    canvas.height = CANVAS_HEIGHT;
    document.getElementById('game-container').style.height = CANVAS_HEIGHT + 'px';
    
    HIT_LINE_Y = isUpscroll ? NOTE_RADIUS + 15 : CANVAS_HEIGHT - NOTE_RADIUS - 15;
    
    // Prerender assets
    prerenderAssets();
    
    // Refresh HP Bar colors
    updateUI();
}

function prerenderAssets() {
    const d = NOTE_RADIUS * 2;
    
    // Render Note Circle
    preNoteCanvas.width = d + 4;
    preNoteCanvas.height = d + 4;
    preNoteCtx.clearRect(0, 0, preNoteCanvas.width, preNoteCanvas.height);
    preNoteCtx.fillStyle = COLOR_CIRCLE;
    preNoteCtx.beginPath();
    preNoteCtx.arc(d/2 + 2, d/2 + 2, NOTE_RADIUS, 0, Math.PI * 2);
    preNoteCtx.fill();

    // Render Stage Light Gradient
    preStageLightCanvas.width = LANE_WIDTH;
    preStageLightCanvas.height = 400; 
    preStageLightCtx.clearRect(0, 0, LANE_WIDTH, 400);
    
    const opacity = stageLightOpacitySlider.value;
    // Stage light fades relative to the hitline
    const grad = preStageLightCtx.createLinearGradient(0, 0, 0, 400);
    if (isUpscroll) {
        grad.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    } else {
        grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(1, `rgba(255, 255, 255, ${opacity})`);
    }
    preStageLightCtx.fillStyle = grad;
    preStageLightCtx.fillRect(0, 0, LANE_WIDTH, 400);
    
    // Render LN Body
    preLNBodyCanvas.width = LANE_WIDTH;
    preLNBodyCanvas.height = 100; // Stretchable 1px height is enough, but 100 is safer for roundRect rendering
    preLNBodyCtx.clearRect(0, 0, LANE_WIDTH, 100);
    preLNBodyCtx.globalAlpha = 0.5;
    preLNBodyCtx.fillStyle = COLOR_LN_BODY;
    preLNBodyCtx.fillRect(2, 0, LANE_WIDTH - 4, 100);
    preLNBodyCtx.globalAlpha = 1.0;
    preLNBodyCtx.fillStyle = '#ffffff';
    preLNBodyCtx.fillRect(2, 0, 4, 100);
    preLNBodyCtx.fillRect(LANE_WIDTH - 6, 0, 4, 100);

    // Render LN Tail
    preLNTailCanvas.width = LANE_WIDTH;
    preLNTailCanvas.height = LANE_WIDTH / 2;
    preLNTailCtx.clearRect(0, 0, preLNTailCanvas.width, preLNTailCanvas.height);
    preLNTailCtx.globalAlpha = 0.5;
    preLNTailCtx.fillStyle = COLOR_LN_BODY;
    preLNTailCtx.beginPath();
    preLNTailCtx.arc(preLNTailCanvas.width / 2, preLNTailCanvas.height, preLNTailCanvas.width / 2 - 2, Math.PI, 0);
    preLNTailCtx.fill();
    preLNTailCtx.globalAlpha = 1.0;
    preLNTailCtx.strokeStyle = '#ffffff';
    preLNTailCtx.lineWidth = 4;
    preLNTailCtx.beginPath();
    preLNTailCtx.arc(preLNTailCanvas.width / 2, preLNTailCanvas.height, preLNTailCanvas.width / 2 - 2, Math.PI, 0);
    preLNTailCtx.stroke();
}

// Hook all inputs to save on change
[noFailCheckbox, bpmInput, speedSlider, densitySlider, practiceDurationInput, laneWidthSlider, stageHeightSlider, noteSizeSlider, judgementSizeSlider, circleColorPicker, lnBodyColorPicker, lnBorderColorPicker, upscrollToggle, fpsLimitSelect, stageLightToggle, stageLightOpacitySlider, hitSoundToggle, hpColorHigh, hpColorMid, hpColorLow, fpsColorPicker, kpsColorPicker, urCenterColorPicker, urInnerColorPicker, urOuterColorPicker].forEach(el => {
    el.addEventListener('input', () => {
        if (el === speedSlider) SCROLL_SPEED = 20000 / parseInt(el.value);
        if (el === laneWidthSlider || el === stageHeightSlider || el === noteSizeSlider || el === judgementSizeSlider || el === circleColorPicker || el === lnBodyColorPicker || el === lnBorderColorPicker || el === upscrollToggle || el === hpColorHigh || el === hpColorMid || el === hpColorLow || el === fpsColorPicker || el === kpsColorPicker || el === urCenterColorPicker || el === urInnerColorPicker || el === urOuterColorPicker) applyDynamicSettings();
        saveSettings();
    });
});
Object.keys(scaleSliders).forEach(key => {
    scaleSliders[key].addEventListener('input', () => {
        hudState[key].scale = parseFloat(scaleSliders[key].value);
        applyHudState(key);
        saveSettings();
    });
});
patternSelections.addEventListener('change', saveSettings);

// Keybind setup
keybindInputs.forEach((input, index) => {
    input.addEventListener('keydown', (e) => {
        e.preventDefault();
        if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') return;
        
        KEYBINDS[index] = e.code;
        updateKeyMap();
        input.value = e.code.replace('Key', '').replace('Arrow', '');
        input.blur();
        saveSettings();
    });
});

// Initial load
loadSettings();

// Offset slider hookup
const offsetSlider = document.getElementById('offset-slider');
const offsetValue = document.getElementById('offset-value');
if (offsetSlider) {
    offsetSlider.addEventListener('input', () => {
        GLOBAL_OFFSET = parseInt(offsetSlider.value);
        if (offsetValue) offsetValue.textContent = GLOBAL_OFFSET + 'ms';
        saveSettings();
    });
}

audioUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) {
        hasAudio = false;
        return;
    }
    bgm.src = URL.createObjectURL(file);
    bgm.load();
    bgm.onloadedmetadata = () => {
        hasAudio = true;
        statusMessage.textContent = `Audio loaded (${Math.round(bgm.duration)}s). Adjust settings and click Start.`;
    };
});

let customHitSoundBuffer = null;

if (hitSoundUpload) {
    hitSoundUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const arrayBuffer = event.target.result;
                customHitSoundBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                alert("Custom hit sound loaded!");
            };
            reader.readAsArrayBuffer(file);
        }
        e.target.value = '';
    });
}

mapUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (Array.isArray(data.notes)) {
                customMapData = data;
                statusMessage.textContent = "Custom map loaded successfully.";
            } else {
                throw new Error("Invalid format");
            }
        } catch (err) {
            statusMessage.textContent = "Error loading map: " + err.message;
            alert("Error parsing map JSON");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

let oszMapData = null;
if (oszUpload) {
    oszUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const data = await parseOsz(file);
            oszMapData = { notes: data.mapNotes, timingPoints: data.timingPoints };
            updateHitWindows(data.od || 8);
            
            if (data.audioBufferData) {
                const blob = new Blob([data.audioBufferData]);
                bgm.src = URL.createObjectURL(blob);
                bgm.load();
                bgm.onloadedmetadata = () => {
                    hasAudio = true;
                    statusMessage.textContent = `Audio loaded (${Math.round(bgm.duration)}s). Adjust settings and click Start.`;
                };
            }
            
            alert(`Successfully loaded ${data.songName}`);
        } catch (err) {
            console.error(err);
            alert(err.message);
        }
        
        e.target.value = '';
    });
}

startBtn.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    score = 0;
    bonus = 100;
    combo = 0;
    maxCombo = 0;
    totalHits = 0;
    totalNotesPassed = 0;
    totalNotesHit = 0;
    hp = 100;
    isFailed = false;
    isPaused = false;
    isResultsScreen = false;
    judgmentCounts = { 320: 0, 300: 0, 200: 0, 100: 0, 50: 0, miss: 0 };
    fpsFrames = 0;
    lastFpsTime = performance.now();
    
    updateUI();
    statusMessage.textContent = 'Get ready!';
    gameTime = -LEAD_IN; 
    lastTime = performance.now();        
    isPlaying = true;
    activeKeys.fill(false);
    activeHits = [0, 0, 0, 0];
    activeHolds = [null, null, null, null];
    hitErrors = [];
    keyPressTimes = [];
    accumulator = 0;

    if (customMapData) {
        notes = [];
        customMapData.notes.forEach(n => {
            n.lanes.forEach(laneIdx => {
                notes.push({
                    lane: laneIdx,
                    time: n.time,
                    endTime: n.time + (n.duration || 0),
                    hit: false,
                    active: true,
                    isBeingHeld: false
                });
            });
        });
        notes.sort((a, b) => a.time - b.time);
    } else if (oszMapData) {
        currentTimingPoints = oszMapData.timingPoints || [];
        notes = [];
        oszMapData.notes.forEach(n => {
            n.lanes.forEach(laneIdx => {
                notes.push({ 
                    lane: laneIdx, 
                    time: n.time, 
                    endTime: n.duration ? n.time + n.duration : n.time, 
                    hit: false, 
                    active: true, 
                    isBeingHeld: false,
                    type: n.type 
                });
            });
        });
        notes.sort((a, b) => a.time - b.time);
    }
        
    if (!customMapData && !oszMapData) {
        const success = generateChart();
        if (!success) return;
    }

    // Calculate total hit objects (1 for normal notes, 2 for LNs: head + tail)
    totalHitObjects = notes.reduce((count, n) => count + (n.endTime && n.endTime > n.time ? 2 : 1), 0);
    if (totalHitObjects <= 0) totalHitObjects = 1;
    
    currentNoteIndex = 0;
    
    if (hasAudio && bgm.duration) {
        mapDuration = bgm.duration * 1000;
    } else if (notes.length > 0) {
        mapDuration = notes[notes.length - 1].endTime || notes[notes.length - 1].time;
    } else {
        mapDuration = userDuration * 1000;
    }

    // Pre-calculate scroll positions for SV support
    notes.forEach(note => {
        note.baseY = getScrollPosition(note.time);
        if (note.endTime !== undefined) {
            note.endBaseY = getScrollPosition(note.endTime);
        }
    });

    if (hasAudio) {
        bgm.pause();
        bgm.currentTime = 0;
    }
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        if (isPlaying) {
            isPlaying = false;
            isPaused = true;
            if (hasAudio) bgm.pause();
        } else if (isPaused) {
            isPlaying = true;
            isPaused = false;
            lastTime = performance.now();
            accumulator = 0;
            if (hasAudio && gameTime >= 0) bgm.play();
        }
        return;
    }

    if (!isPlaying) return;
    const lane = KEY_MAP[e.code];
    if (lane === undefined || activeKeys[lane]) return;

    activeKeys[lane] = true;
    keyPressTimes.push(e.timeStamp);
    
    // Use e.timeStamp (OS-level event time) instead of performance.now() (JS handler time)
    // This eliminates ~1-8ms of browser event queue latency from hit timing
    const currentExactGameTime = gameTime + (e.timeStamp - lastTime) * getPlaybackRate() + GLOBAL_OFFSET;

    let earliestNote = null;
      for (let i = currentNoteIndex; i < notes.length; i++) {
          const n = notes[i];
          if (n.active && n.lane === lane && !n.hit && !n.headMissed) {
              earliestNote = n;
              break;
          }
      }

      if (earliestNote) {
          const diff = earliestNote.time - currentExactGameTime;
          if (Math.abs(diff) <= MISS_WINDOW) {
              hitNote(earliestNote, diff);
              activeHits[lane] = 0.15;
              
              if (earliestNote.endTime > earliestNote.time) {
                  earliestNote.isBeingHeld = true;
                  earliestNote.headHit = true;
                  activeHolds[lane] = earliestNote;
              }
          }
      }
});

window.addEventListener('keyup', (e) => {
    if (!isPlaying) return;
    const lane = KEY_MAP[e.code];
    if (lane === undefined) return;

    activeKeys[lane] = false;
    
    // Use e.timeStamp for OS-level timing on release too
    const currentExactGameTime = gameTime + (e.timeStamp - lastTime) * getPlaybackRate() + GLOBAL_OFFSET;
    const holdNote = activeHolds[lane];
    if (holdNote) {
        const diff = holdNote.endTime - currentExactGameTime;
          if (Math.abs(diff) <= MISS_WINDOW) {
              hitNoteRelease(holdNote, diff);
          } else {
              breakHoldNote(holdNote);
          }
        activeHolds[lane] = null;
    }
});

window.addEventListener('blur', () => {
    activeKeys.fill(false);
});

// ---------------------------------------------------------------------------
// Chart generation
// ---------------------------------------------------------------------------
function generateChart() {
    const generated = [];
    let t = 2; 
    
    const bpm = parseInt(bpmInput.value) || 120;
    const secondsPerBeat = 60 / bpm;
    const PATTERN_GAP_BEATS = 0.0; 
    
    const userDuration = parseInt(practiceDurationInput.value) || 120;
    const targetDuration = (hasAudio && bgm.duration) ? bgm.duration : userDuration;

    const enabledNames = Array.from(patternSelections.querySelectorAll('input:checked')).map(cb => cb.dataset.pattern);
    const enabledPatterns = window.GAME_PATTERNS.filter(p => enabledNames.includes(p.name));

    if (enabledPatterns.length === 0) {
        statusMessage.textContent = "Error: Enable at least one pattern!";
        return false;
    }
    
    currentTimingPoints = []; // No SV for generated charts yet

    while (t < targetDuration) {
        const pattern = enabledPatterns[Math.floor(Math.random() * enabledPatterns.length)];
        const multiplier = parseFloat(densitySlider.value);
        
        const count = Math.max(1, Math.round(pattern.sequence.length * multiplier));
        const rotation = Math.floor(Math.random() * NUM_LANES);

        for (let i = 0; i < count; i++) {
            const seq = pattern.sequence[i % pattern.sequence.length];
            const noteTime = t + (i * pattern.beatSnap * secondsPerBeat);
            
            if (noteTime > targetDuration) break;
            
            seq.lanes.forEach(l => {
                const lane = (l + rotation) % NUM_LANES;
                const duration = (seq.holdBeats || 0) * secondsPerBeat;
                
                let overlap = false;
                for (const n of generated) {
                    if (n.lane === lane) {
                        if (noteTime < n.endTime && n.time < noteTime + duration) {
                            overlap = true;
                            break;
                        }
                    }
                }
                
                if (!overlap) {
                    generated.push({
                        lane,
                        time: Math.round(noteTime * 1000),
                        endTime: Math.round((noteTime + duration) * 1000),
                        hit: false,
                        active: true,
                        isBeingHeld: false
                    });
                }
            });
        }

        const patternDuration = count * pattern.beatSnap * secondsPerBeat;
        t += patternDuration + (PATTERN_GAP_BEATS * secondsPerBeat);
    }

    generated.sort((a, b) => a.time - b.time);
    notes = generated;
    return true;
}

// Gameplay Mechanics
function updateJudgement(text, color) {
    judgementEl.textContent = text;
    judgementEl.style.color = color;

    judgementEl.classList.remove('judgement-show');
    requestAnimationFrame(() => {
        judgementEl.classList.add('judgement-show');
    });
}

function getJudgement(absDiff) {
    if (absDiff < WINDOW_320) return { pts: 320, label: '320', color: 'var(--judgement-perfect)' };
    if (absDiff < WINDOW_300) return { pts: 300, label: '300', color: 'var(--judgement-great)' };
    if (absDiff < WINDOW_200) return { pts: 200, label: '200', color: 'var(--judgement-good)' };
    if (absDiff < WINDOW_100) return { pts: 100, label: '100', color: 'var(--judgement-ok)' };
    if (absDiff < WINDOW_50) return { pts: 50, label: '50', color: 'var(--judgement-meh)' };
    return { pts: 0, label: 'Miss', color: 'var(--judgement-miss)' };
}

function getHealthIncreaseFor(pts, isHold) {
    const mapHp = oszMapData && oszMapData.hp ? oszMapData.hp : 8;
    switch (pts) {
        case 0: return isHold ? -(mapHp + 1) * 0.375 : -(mapHp + 1) * 0.75;
        case 50: return -(mapHp + 1) * 0.16;
        case 100: return 0;
        case 200: return 0.4 - mapHp * 0.04;
        case 300: return 0.5 - mapHp * 0.05;
        case 320: return 0.55 - mapHp * 0.05;
    }
    return 0;
}

function hitNote(note, diff) {
    note.hit = true;
    hitErrors.push(diff);
    if (hitErrors.length > 40) hitErrors.shift();
    
    const j = getJudgement(Math.abs(diff));
    updateJudgement(j.label, j.color);
    
    hp += getHealthIncreaseFor(j.pts, false);
    hp = Math.max(0, Math.min(100, hp));
    
    if (hp <= 0 && !noFailCheckbox.checked) {
        triggerFail();
        return;
    }

    applyHitScore(j.pts);
    if (j.pts > 0) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        totalHits += j.pts;
        judgmentCounts[j.pts]++;
    } else {
        combo = 0;
        judgmentCounts.miss++;
    }
    totalNotesPassed++;
    totalNotesHit++;

    updateUI();
}

function hitNoteRelease(note, diff) {
    note.active = false; 
    hitErrors.push(diff);
    if (hitErrors.length > 40) hitErrors.shift();
    
    playHitSound();

    const j = getJudgement(Math.abs(diff));
    updateJudgement(j.label, j.color);

    hp += getHealthIncreaseFor(j.pts, true);
    hp = Math.max(0, Math.min(100, hp));
    
    if (hp <= 0 && !noFailCheckbox.checked) {
        triggerFail();
        return;
    }

    applyHitScore(j.pts);
    if (j.pts > 0) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        totalHits += j.pts;
        judgmentCounts[j.pts]++;
    } else {
        combo = 0;
        judgmentCounts.miss++;
    }
    totalNotesPassed++;
    totalNotesHit++;

    updateUI();
}

function breakHoldNote(note) {
    note.active = false;
    note.isHeld = false;
    activeHolds[note.lane] = null;
    
    updateJudgement('Miss', 'var(--judgement-miss)');
    hp += getHealthIncreaseFor(0, true);
    hp = Math.max(0, Math.min(100, hp));
    
    applyHitScore(0);
    combo = 0;
    totalNotesPassed++;
    judgmentCounts.miss++;
    updateUI();
}

function handleMiss(note) {
    note.active = false;
    if (note.type === 'hold') {
        note.headMissed = true;
    }
    
    updateJudgement('Miss', 'var(--judgement-miss)');
    hp += getHealthIncreaseFor(0, false);
    hp = Math.max(0, Math.min(100, hp));
    
    applyHitScore(0);
    combo = 0;
    totalNotesPassed++;
    judgmentCounts.miss++;
    updateUI();
    
    if (hp <= 0 && !noFailCheckbox.checked) {
        triggerFail();
    }
}

function updateUI() {
    if (isUIUpdateScheduled) return;
    isUIUpdateScheduled = true;
    requestAnimationFrame(() => {
        isUIUpdateScheduled = false;
        
        // Update Stats HUD only if values changed to prevent DOM reflows
        if (score !== lastScore) {
            scoreEl.textContent = String(score).padStart(6, '0');
            lastScore = score;
        }
        if (combo !== lastCombo) {
            comboEl.textContent = combo;
            lastCombo = combo;
        }
        
        const acc = getAccuracy();
        const accText = acc.toFixed(2) + '%';
        if (accuracyTextEl && accText !== lastAccText) {
            accuracyTextEl.textContent = accText;
            lastAccText = accText;
        }
        
        // Update HP
        if (hudHpFill && hp !== lastHp) {
            hudHpFill.style.width = `${hp}%`;
            lastHp = hp;
        }
    
        const now = performance.now();
        const oneSecondAgo = now - 1000;
        let activeKps = 0;
        for (let i = 0; i < keyPressTimes.length; i++) {
            if (keyPressTimes[i] > oneSecondAgo) activeKps++;
        }
        if (keyPressTimes.length > 100) {
            keyPressTimes = keyPressTimes.filter(t => t > oneSecondAgo);
        }
        
        if (kpsEl && activeKps !== lastKps) {
            kpsEl.textContent = `${activeKps} KPS`;
            lastKps = activeKps;
        }
    });
}

function triggerFail() {
    if (noFailCheckbox.checked) return;
    isFailed = true;
    isPlaying = false;
    if (hasAudio) bgm.pause();
    statusMessage.textContent = 'Failed. Click Start Game to try again.';
}

let activeAudioSources = [];

function playHitSound() {
    if (!hitSoundToggle.checked) return;
    if (audioCtx.state !== 'running') return;
    
    const buffer = customHitSoundBuffer || synthHitSoundBuffer;
    if (!buffer) return;
    
    try {
        const now = audioCtx.currentTime;
        // Clean up finished sources
        activeAudioSources = activeAudioSources.filter(s => s.endTime > now);
        
        // Voice limiting: cap at 8 concurrent playing hitsounds to prevent thread saturation
        if (activeAudioSources.length >= 8) {
            const oldest = activeAudioSources.shift();
            try { oldest.source.stop(); } catch(e) {}
        }
        
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start();
        
        activeAudioSources.push({
            source: source,
            endTime: now + buffer.duration
        });
    } catch (e) {
        console.error("Failed to play hitsound:", e);
    }
}

function resetGame() {
    if (hasAudio) {
        bgm.pause();
        bgm.currentTime = 0;
    }
    currentNoteIndex = 0;
}

function checkMisses() {
    // Advance currentNoteIndex past notes that are completely done
    // This prevents the note loops from re-scanning thousands of dead notes
    while (currentNoteIndex < notes.length) {
        const n = notes[currentNoteIndex];
        if (n.active) break;
        // For hold notes, only advance past them if they're fully resolved
        if (n.endTime && n.endTime > gameTime - 1000) break;
        if (n.time > gameTime - 1000) break;
        currentNoteIndex++;
    }
    
    for (let i = currentNoteIndex; i < notes.length; i++) {
        const note = notes[i];
        if (!note.active) continue;
        if (note.time > gameTime + 2000) break;
        
        if (!note.hit && !note.headMissed) {
            const timeDiff = note.time - gameTime;
            if (timeDiff < -MISS_WINDOW) {
                note.headMissed = true;
                handleMiss(note);
            }
        }
    }
}

// Game Loop
function update(dt) {
    if (!isPlaying) return;

    if (hasAudio) {
        if (gameTime >= 0 && bgm.paused && !isFailed && !isPaused) {
            bgm.play();
        }
        
        if (gameTime > 0 && !isFailed && !bgm.paused) {
            gameTime += dt;
            const audioTimeMs = bgm.currentTime * 1000;
            const drift = audioTimeMs - gameTime;
            
            if (Math.abs(drift) > 200) {
                // Hard snap for large drifts (tab switch, seek, etc)
                gameTime = audioTimeMs;
            } else if (Math.abs(drift) > 2) {
                // Gentle frame-rate-independent correction
                // Converges over ~300ms regardless of FPS
                const correction = drift * Math.min(dt / 300, 1.0);
                gameTime += correction;
            }
        } else {
            gameTime += dt;
        }
    } else {
        gameTime += dt;
    }

    checkMisses();

    for (let i = 0; i < 4; i++) {
        if (activeHits[i] > 0) activeHits[i] -= dt;
    }
    
    // End-of-map detection
    if (mapDuration > 0 && gameTime > mapDuration + 2000 && !isResultsScreen) {
        // Fast O(1) check: all notes passed and no holds active
        if (currentNoteIndex >= notes.length && activeHolds.every(h => h === null)) {
            isPlaying = false;
            isResultsScreen = true;
            if (hasAudio) bgm.pause();
            statusMessage.textContent = 'Map complete! Click Start Game to play again.';
        }
    }
}

function getGrade() {
    const totalJudgments = judgmentCounts[320] + judgmentCounts[300] + judgmentCounts[200] + judgmentCounts[100] + judgmentCounts[50] + judgmentCounts.miss;
    if (totalJudgments === 0) return 'D';
    const acc = getAccuracy();
    const ratio300 = (judgmentCounts[320] + judgmentCounts[300]) / totalJudgments;
    
    if (acc === 100) return 'SS';
    if (ratio300 > 0.95 && judgmentCounts.miss === 0) return 'S';
    if (ratio300 > 0.90 || (ratio300 > 0.80 && judgmentCounts.miss === 0)) return 'A';
    if (ratio300 > 0.80 || (ratio300 > 0.70 && judgmentCounts.miss === 0)) return 'B';
    if (ratio300 > 0.60) return 'C';
    return 'D';
}

function getGradeColor(grade) {
    switch (grade) {
        case 'SS': return '#FFD700';
        case 'S': return '#FFD700';
        case 'A': return '#00CC00';
        case 'B': return '#2266FF';
        case 'C': return '#BB44BB';
        case 'D': return '#FF4444';
        default: return '#fff';
    }
}

function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    const gameScrollY = getScrollPosition(gameTime);
    
    // Hit line removed for new style
    // Draw Lanes
    for (let i = 0; i < NUM_LANES; i++) {
        const x = i * LANE_WIDTH;

        ctx.fillStyle = COLORS.laneBg;
        ctx.fillRect(x, 0, LANE_WIDTH, CANVAS_HEIGHT);

        // Hit glow when a key is held or was just successfully pressed
        if (activeHits[i] > 0 || activeKeys[i]) {
            if (stageLightToggle.checked) {
                // Draw pre-rendered Stage Light
                if (isUpscroll) {
                    ctx.drawImage(preStageLightCanvas, x, HIT_LINE_Y);
                } else {
                    ctx.drawImage(preStageLightCanvas, x, HIT_LINE_Y - 400);
                }
                
                // Solid tap highlight below/above the line
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                if (isUpscroll) {
                    ctx.fillRect(x, 0, LANE_WIDTH, HIT_LINE_Y);
                } else {
                    ctx.fillRect(x, HIT_LINE_Y, LANE_WIDTH, CANVAS_HEIGHT - HIT_LINE_Y);
                }
            }
        }

        ctx.strokeStyle = COLORS.laneBorder;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();

        // Target tap indicator (Receptor)
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x + LANE_WIDTH / 2, HIT_LINE_Y, NOTE_RADIUS, 0, Math.PI * 2);
        if (activeHits[i] > 0 || activeKeys[i]) {
            ctx.strokeStyle = '#ffffff';
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        }
        ctx.stroke();
        
        // Satisfying Hit Ripple Explosion
        if (activeHits[i] > 0) {
            const p = 1.0 - (activeHits[i] / 0.15); // Progress from 0.0 to 1.0
            ctx.strokeStyle = `rgba(255, 255, 255, ${1.0 - p})`;
            ctx.lineWidth = 4 * (1.0 - p);
            ctx.beginPath();
            ctx.arc(x + LANE_WIDTH / 2, HIT_LINE_Y, NOTE_RADIUS + (p * 30), 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // -------------------------------------------------------------
    // Draw Notes (OPTIMIZED BATCH RENDERING)
    // -------------------------------------------------------------
    
    // To support LNs drawing below Note Heads, we do two quick passes.
    // Pass 1: LN Bodies
    for (let i = currentNoteIndex; i < notes.length; i++) {
        const note = notes[i];
        if (!note.active || note.endTime <= note.time) continue;
        
        // Stop drawing if this LN's head is very far ahead (Optimization)
        // If the scroll speed is high, 3000ms might be visible, so use a safe upper bound
        if (note.time > gameTime + 5000) break;
        
        // Calculate Y positions using SV integration
        let headY, tailY;
        const endBaseY = note.endBaseY !== undefined ? note.endBaseY : note.baseY;
        
        if (isUpscroll) {
            headY = HIT_LINE_Y + (note.baseY - gameScrollY) * (CANVAS_HEIGHT / SCROLL_SPEED);
            tailY = HIT_LINE_Y + (endBaseY - gameScrollY) * (CANVAS_HEIGHT / SCROLL_SPEED);
        } else {
            headY = HIT_LINE_Y - (note.baseY - gameScrollY) * (CANVAS_HEIGHT / SCROLL_SPEED);
            tailY = HIT_LINE_Y - (endBaseY - gameScrollY) * (CANVAS_HEIGHT / SCROLL_SPEED);
        }

        // If any part of the LN is on screen
        if ((!isUpscroll && headY > -100 && tailY < CANVAS_HEIGHT + 100) || 
            (isUpscroll && headY < CANVAS_HEIGHT + 100 && tailY > -100)) {
            
            const x = note.lane * LANE_WIDTH + (LANE_WIDTH / 2);
            const clampedHeadY = (note.hit && note.isBeingHeld) ? HIT_LINE_Y : headY;
            
              const tailWidth = NOTE_RADIUS * 2;
              const tailHeight = tailWidth / 2;
              const rx = x - NOTE_RADIUS;
              
              let bodyStartY, bodyHeight;
              
              let bodyAlpha = 1.0;
              if (note.broken) {
                  bodyAlpha = 0.2; // Opacity decrease is extremely fast compared to ctx.filter
              }
              ctx.globalAlpha = bodyAlpha;
              
              if (!isUpscroll) {
                  // Downscroll: tail is at the top (smaller Y)
                  bodyStartY = Math.min(clampedHeadY, tailY + tailHeight);
                  bodyHeight = Math.max(0, clampedHeadY - bodyStartY);
                  
                  if (tailY < CANVAS_HEIGHT + 100) {
                      ctx.drawImage(preLNTailCanvas, rx, tailY, tailWidth, tailHeight);
                  }
              } else {
                  // Upscroll: tail is at the bottom (larger Y)
                  bodyStartY = clampedHeadY;
                  bodyHeight = Math.max(0, (tailY - tailHeight) - bodyStartY);
                  
                  if (tailY > -100) {
                      ctx.save();
                      ctx.translate(x, tailY);
                      ctx.scale(1, -1);
                      ctx.drawImage(preLNTailCanvas, -NOTE_RADIUS, 0, tailWidth, tailHeight);
                      ctx.restore();
                  }
              }
              
              if (bodyHeight > 0) {
                  ctx.drawImage(preLNBodyCanvas, rx, bodyStartY, tailWidth, bodyHeight);
              }
              
              ctx.globalAlpha = 1.0;
        }
    }
    
    // Pass 2: Note Heads & Tails
    for (let i = currentNoteIndex; i < notes.length; i++) {
        const note = notes[i];
        if (!note.active || note.hit) continue;
        
        if (note.time > gameTime + 5000) break;
        
        let headY;
        if (isUpscroll) {
            headY = HIT_LINE_Y + (note.baseY - gameScrollY) * (CANVAS_HEIGHT / SCROLL_SPEED);
        } else {
            headY = HIT_LINE_Y - (note.baseY - gameScrollY) * (CANVAS_HEIGHT / SCROLL_SPEED);
        }

        if (headY > -100 && headY < CANVAS_HEIGHT + 100) {
            const x = note.lane * LANE_WIDTH + (LANE_WIDTH / 2);
            ctx.drawImage(preNoteCanvas, x - NOTE_RADIUS - 2, headY - NOTE_RADIUS - 2);
        }
    }

    // Draw UI Overlays (like countdown or start prompt)
    if (!isPlaying) {
        if (isResultsScreen) {
            // Full results screen overlay
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            
            const centerX = CANVAS_WIDTH / 2;
            const acc = getAccuracy();
            const grade = getGrade();
            
            // Grade
            ctx.textAlign = 'center';
            ctx.fillStyle = getGradeColor(grade);
            ctx.font = '100 120px Inter';
            ctx.fillText(grade, centerX, 140);
            
            // Accuracy
            ctx.fillStyle = '#fff';
            ctx.font = '100 36px Inter';
            ctx.fillText(acc.toFixed(2) + '%', centerX, 190);
            
            // Score
            ctx.font = '200 28px Inter';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText(String(score).padStart(6, '0'), centerX, 230);
            
            // Max Combo
            ctx.font = '200 22px Inter';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText(maxCombo + 'x max combo', centerX, 265);
            
            // Judgment breakdown
            const startY = 310;
            const lineH = 32;
            ctx.textAlign = 'left';
            ctx.font = '200 20px Inter';
            const labelX = centerX - 80;
            const countX = centerX + 70;
            
            const rows = [
                { label: '320', count: judgmentCounts[320], color: 'var(--judgement-perfect)' },
                { label: '300', count: judgmentCounts[300], color: 'var(--judgement-great)' },
                { label: '200', count: judgmentCounts[200], color: 'var(--judgement-good)' },
                { label: '100', count: judgmentCounts[100], color: 'var(--judgement-ok)' },
                { label: '50',  count: judgmentCounts[50],  color: 'var(--judgement-meh)' },
                { label: 'Miss', count: judgmentCounts.miss, color: '#FF4444' }
            ];
            
            // Since CSS vars don't work in canvas, use direct colors
            const directColors = ['#88DDFF', '#FFCC22', '#88BB00', '#2288DD', '#BB8800', '#FF4444'];
            
            rows.forEach((row, i) => {
                ctx.fillStyle = directColors[i];
                ctx.textAlign = 'left';
                ctx.fillText(row.label, labelX, startY + i * lineH);
                ctx.textAlign = 'right';
                ctx.fillText(String(row.count), countX, startY + i * lineH);
            });
            
            // "Click Start to retry" prompt
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '200 16px Inter';
            ctx.fillText('Press Start Game to play again', centerX, CANVAS_HEIGHT - 30);
            
        } else if (isFailed) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.fillStyle = '#FF4444';
            ctx.font = '100 48px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('FAILED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        } else if (isPaused) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.fillStyle = 'white';
            ctx.font = '100 48px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        }
    } else if (gameTime < 0) {
        ctx.fillStyle = '#fff';
        ctx.font = '100 80px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(-gameTime / 1000), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }
    
    // Draw Progress Pie Chart safely
    try {
        if (pieCtx && !isNaN(gameTime) && mapDuration > 0) {
            let progress = Math.max(0, gameTime) / mapDuration;
            if (isNaN(progress) || !isFinite(progress)) progress = 0;
            progress = Math.max(0, Math.min(1, progress));
            
            const pw = progressPie.width;
            const ph = progressPie.height;
            const cx = pw / 2;
            const cy = ph / 2;
            const r = Math.min(cx, cy) - 2;
            
            pieCtx.clearRect(0, 0, pw, ph);
            
            // Background ring
            pieCtx.beginPath();
            pieCtx.arc(cx, cy, r, 0, 2 * Math.PI);
            pieCtx.lineWidth = 2;
            pieCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            pieCtx.stroke();
            
            // Progress arc
            if (progress > 0) {
                pieCtx.beginPath();
                pieCtx.moveTo(cx, cy);
                pieCtx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress));
                pieCtx.closePath();
                pieCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                pieCtx.fill();
            }
        }
    } catch (e) {
        // silently ignore pie errors
    }

    // Draw UR bar (Judgment Meter) on canvas dynamically aligned with Web-Osu-Mania styling & formulas
    if (isPlaying) {
        const urBarEl = document.getElementById('hud-ur-bar');
        if (urBarEl) {
            const canvasRect = canvas.getBoundingClientRect();
            const urRect = urBarEl.getBoundingClientRect();
            
            // Get position relative to the game canvas coordinate space
            const meterX = urRect.left - canvasRect.left;
            const meterY = urRect.top - canvasRect.top;
            const meterWidth = urRect.width;
            const meterHeight = urRect.height;
            const centerX = meterX + (meterWidth / 2);
            const barH = 6;
            const barY = meterY + (meterHeight / 2) - (barH / 2);
            
            // Background timing window sections matching Web-Osu-Mania
            // 50 window (Orange / Gold: #daae46) - full width
            ctx.fillStyle = '#daae46';
            ctx.fillRect(meterX, barY, meterWidth, barH);
            
            // 200/100 window (Green: #57e313)
            const w100Ratio = Math.min(1, WINDOW_100 / WINDOW_50);
            const w100Width = meterWidth * w100Ratio;
            ctx.fillStyle = '#57e313';
            ctx.fillRect(centerX - (w100Width / 2), barY, w100Width, barH);
            
            // 300 window (Blue: #32bce7)
            const w300Ratio = Math.min(1, WINDOW_300 / WINDOW_50);
            const w300Width = meterWidth * w300Ratio;
            ctx.fillStyle = '#32bce7';
            ctx.fillRect(centerX - (w300Width / 2), barY, w300Width, barH);
            
            // 320 window (Light Blue: #99eeff)
            const w320Ratio = Math.min(1, WINDOW_320 / WINDOW_50);
            const w320Width = meterWidth * w320Ratio;
            ctx.fillStyle = '#99eeff';
            ctx.fillRect(centerX - (w320Width / 2), barY, w320Width, barH);
            
            // Center tick mark (0ms line)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(centerX - 1, barY - 4, 2, barH + 8);
            
            // Draw hit error ticks mapped to WINDOW_50
            hitErrors.forEach(errDiff => {
                const tickX = (-errDiff / WINDOW_50) * (meterWidth / 2) + centerX;
                
                // Limit boundaries to the UR bar width
                if (tickX >= meterX && tickX <= meterX + meterWidth) {
                    const absDiff = Math.abs(errDiff);
                    let directColor = '#ff4444';
                    if (absDiff <= WINDOW_320) directColor = '#99eeff';
                    else if (absDiff <= WINDOW_300) directColor = '#32bce7';
                    else if (absDiff <= WINDOW_200) directColor = '#57e313';
                    else if (absDiff <= WINDOW_100) directColor = '#57e313';
                    else if (absDiff <= WINDOW_50) directColor = '#daae46';
                    
                    ctx.fillStyle = directColor;
                    ctx.fillRect(tickX - 1, barY - 3, 2, barH + 6);
                }
            });

            // Rolling Average Marker (White triangle at bottom of bar)
            if (hitErrors.length > 0) {
                const avgDiff = hitErrors.reduce((sum, e) => sum + e, 0) / hitErrors.length;
                const avgX = (-avgDiff / WINDOW_50) * (meterWidth / 2) + centerX;
                if (avgX >= meterX && avgX <= meterX + meterWidth) {
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.moveTo(avgX, barY + barH + 2);
                    ctx.lineTo(avgX - 4, barY + barH + 8);
                    ctx.lineTo(avgX + 4, barY + barH + 8);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        }
    }
}

// Main render loop — always runs via rAF for smooth visuals
function renderLoop() {
    const now = performance.now();
    if (!lastTime) lastTime = now;
    
    let elapsed = now - lastTime;
    lastTime = now;
    
    // Clamp elapsed to prevent spiral of death in background tabs
    if (elapsed > 100) elapsed = 100;
    
    if (isPlaying) {
        const rate = getPlaybackRate();
        if (bgm && hasAudio && bgm.playbackRate !== rate) {
            bgm.playbackRate = rate;
        }
        
        if (fpsLimitSelect.value === 'vsync') {
            // VSync mode: update once per frame
            fpsFrames++;
            update(elapsed * rate);
        } else {
            // Throttled high-rate simulation mode (200Hz or 1000Hz or 2000Hz uncapped)
            let targetRate = 1000;
            if (fpsLimitSelect.value === '200') targetRate = 200;
            else if (fpsLimitSelect.value === 'uncapped') targetRate = 2000;
            
            const step = 1000 / targetRate;
            accumulator += elapsed;
            
            // Limit accumulator execution step count to avoid lockup
            let stepCount = 0;
            while (accumulator >= step && stepCount < 100) {
                fpsFrames++;
                update(step * rate);
                accumulator -= step;
                stepCount++;
            }
            if (accumulator > 100) {
                // If we are lagging behind (e.g. background tab), discard remaining accumulator to avoid spiral of death
                accumulator = 0;
            }
        }
        draw();
    } else if (isResultsScreen || isFailed || isPaused) {
        // Keep rendering overlays even when not playing
        draw();
    }
    
    // FPS counter (counts actual loop iterations for unlimited, frames for capped)
    if (now - lastFpsTime >= 1000) {
        if (fpsEl) fpsEl.textContent = `${fpsFrames} FPS`;
        fpsFrames = 0;
        lastFpsTime = now;
    }
    
    requestAnimationFrame(renderLoop);
}

// Start
renderLoop();

function getScrollPosition(time) {
    if (!currentTimingPoints || currentTimingPoints.length === 0) return time;
    
    // Fast O(log N) binary search instead of O(N) linear scan
    let low = 0;
    let high = currentTimingPoints.length - 1;
    let idx = 0;
    
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (currentTimingPoints[mid].time <= time) {
            idx = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    
    const tp = currentTimingPoints[idx];
    return tp.cumulativeScroll + (time - tp.time) * tp.sv;
}





