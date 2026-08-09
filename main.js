// Game Configuration (Dynamic)
let CANVAS_WIDTH = 400;
let CANVAS_HEIGHT = 800;
const NUM_LANES = 4;
let LANE_WIDTH = 100;
let HIT_LINE_Y = CANVAS_HEIGHT - 100;
let isUpscroll = false;
let SCROLL_SPEED = 1000; 
let NOTE_RADIUS = 38; 
let COLOR_CIRCLE = '#ffffff';
let COLOR_LN_BODY = '#ffffff';
let COLOR_LN_BORDER = '#ffffff';
let KEYBINDS = ['KeyA', 'KeyS', 'KeyK', 'KeyL'];
const LEAD_IN = 3000;

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
let combo = 0;
let maxCombo = 0;
let totalHits = 0;
let accuracyWeight = 0;
let totalNotesPassed = 0;
let totalNotesHit = 0;
let gameTime = 0;
let isPlaying = false;
let lastTime = 0;
let fpsFrames = 0;
let lastFpsTime = 0;
let hasAudio = false;
let hp = 100;
let isFailed = false;
let isPaused = false;
let customMapData = null; // Holds validated map JSON

// Audio Context for Hit Sounds
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

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
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('hud-score');
const comboEl = document.getElementById('combo');
const accuracyEl = document.getElementById('hud-accuracy');
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
const hudJudgmentTicks = document.getElementById('judgment-meter-ticks');

let hudState = {
    score: {x: 0, y: 0, scale: 1},
    accuracy: {x: 0, y: 0, scale: 1},
    kps: {x: 0, y: 0, scale: 1},
    fps: {x: 0, y: 0, scale: 1},
    pie: {x: 0, y: 0, scale: 1},
    hp: {x: 0, y: 0, scale: 1},
    judgment: {x: 0, y: 0, scale: 1}
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
const noteSizeSlider = document.getElementById('note-size-slider');
const circleColorPicker = document.getElementById('circle-color-picker');
const lnBodyColorPicker = document.getElementById('ln-body-color-picker');
const lnBorderColorPicker = document.getElementById('ln-border-color-picker');
const upscrollToggle = document.getElementById('upscroll-toggle');
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
    judgment: document.getElementById('scale-judgment')
};

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
        noteSize: noteSizeSlider.value,
        circleColor: circleColorPicker.value,
        lnBodyColor: lnBodyColorPicker.value,
        lnBorderColor: lnBorderColorPicker.value,
        upscroll: upscrollToggle.checked,
        stageLights: stageLightToggle.checked,
        stageLightOpacity: stageLightOpacitySlider.value,
        hitSounds: hitSoundToggle.checked,
        hpColorHigh: hpColorHigh.value,
        hpColorMid: hpColorMid.value,
        hpColorLow: hpColorLow.value,
        fpsColor: fpsColorPicker.value,
        kpsColor: kpsColorPicker.value,
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
        if (settings.noteSize) noteSizeSlider.value = settings.noteSize;
        if (settings.circleColor) circleColorPicker.value = settings.circleColor;
        if (settings.lnBodyColor) lnBodyColorPicker.value = settings.lnBodyColor;
        if (settings.lnBorderColor) lnBorderColorPicker.value = settings.lnBorderColor;
        
        if (settings.upscroll !== undefined) upscrollToggle.checked = settings.upscroll;
        if (settings.stageLights !== undefined) stageLightToggle.checked = settings.stageLights;
        if (settings.stageLightOpacity !== undefined) stageLightOpacitySlider.value = settings.stageLightOpacity;
        if (settings.hitSounds !== undefined) hitSoundToggle.checked = settings.hitSounds;
        
        if (settings.hpColorHigh) hpColorHigh.value = settings.hpColorHigh;
        if (settings.hpColorMid) hpColorMid.value = settings.hpColorMid;
        if (settings.hpColorLow) hpColorLow.value = settings.hpColorLow;
        if (settings.fpsColor) fpsColorPicker.value = settings.fpsColor;
        if (settings.kpsColor) kpsColorPicker.value = settings.kpsColor;
        
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
    COLOR_CIRCLE = circleColorPicker.value;
    COLOR_LN_BODY = lnBodyColorPicker.value;
    COLOR_LN_BORDER = lnBorderColorPicker.value;
    isUpscroll = upscrollToggle.checked;
    
    if (fpsEl) fpsEl.style.color = fpsColorPicker.value;
    if (kpsEl) kpsEl.style.color = kpsColorPicker.value;
    
    HIT_LINE_Y = isUpscroll ? 100 : CANVAS_HEIGHT - 100;
    
    CANVAS_WIDTH = LANE_WIDTH * NUM_LANES;
    canvas.width = CANVAS_WIDTH;
    
    // Center the container
    document.getElementById('game-container').style.width = CANVAS_WIDTH + 'px';
    
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
    preLNBodyCtx.fillStyle = "rgba(255, 255, 255, 0.5)";
    preLNBodyCtx.fillRect(2, 0, LANE_WIDTH - 4, 100);

    // Render LN Tail
    preLNTailCanvas.width = LANE_WIDTH;
    preLNTailCanvas.height = LANE_WIDTH / 2;
    preLNTailCtx.clearRect(0, 0, preLNTailCanvas.width, preLNTailCanvas.height);
    preLNTailCtx.fillStyle = "rgba(255, 255, 255, 0.5)";
    preLNTailCtx.beginPath();
    preLNTailCtx.moveTo(2, preLNTailCanvas.height);
    preLNTailCtx.lineTo(preLNTailCanvas.width - 2, preLNTailCanvas.height);
    preLNTailCtx.lineTo(preLNTailCanvas.width / 2, 0);
    preLNTailCtx.closePath();
    preLNTailCtx.fill();
}

// Hook all inputs to save on change
[noFailCheckbox, bpmInput, speedSlider, densitySlider, practiceDurationInput, laneWidthSlider, noteSizeSlider, circleColorPicker, lnBodyColorPicker, lnBorderColorPicker, upscrollToggle, stageLightToggle, stageLightOpacitySlider, hitSoundToggle, hpColorHigh, hpColorMid, hpColorLow, fpsColorPicker, kpsColorPicker].forEach(el => {
    el.addEventListener('input', () => {
        if (el === speedSlider) SCROLL_SPEED = 20000 / parseInt(el.value);
        if (el === laneWidthSlider || el === noteSizeSlider || el === circleColorPicker || el === lnBodyColorPicker || el === lnBorderColorPicker || el === upscrollToggle || el === hpColorHigh || el === hpColorMid || el === hpColorLow || el === fpsColorPicker || el === kpsColorPicker) applyDynamicSettings();
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
        input.value = e.code.replace('Key', '').replace('Arrow', '');
        input.blur();
        saveSettings();
    });
});

// Initial load
loadSettings();

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
    combo = 0;
    maxCombo = 0;
    totalHits = 0;
    totalNotesPassed = 0;
    totalNotesHit = 0;
    hp = 100;
    isFailed = false;
    isPaused = false;
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
    loopChannel.port2.postMessage(null);
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
            if (hasAudio && gameTime >= 0) bgm.play();
            loopChannel.port2.postMessage(null);
        }
        return;
    }

    if (!isPlaying) return;
    const lane = KEYBINDS.indexOf(e.code);
    if (lane === -1 || activeKeys[lane]) return;

    activeKeys[lane] = true;
    keyPressTimes.push(e.timeStamp);
    
    // Use e.timeStamp (OS-level event time) instead of performance.now() (JS handler time)
    // This eliminates ~1-8ms of browser event queue latency from hit timing
    const currentExactGameTime = gameTime + (e.timeStamp - lastTime) * getPlaybackRate();

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
    const lane = KEYBINDS.indexOf(e.code);
    if (lane === -1) return;

    activeKeys[lane] = false;
    
    // Use e.timeStamp for OS-level timing on release too
    const currentExactGameTime = gameTime + (e.timeStamp - lastTime) * getPlaybackRate();
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
    judgementEl.style.backgroundColor = color;

    judgementEl.classList.remove('judgement-show');
    requestAnimationFrame(() => {
        judgementEl.classList.add('judgement-show');
    });
}

function getJudgement(absDiff) {
    if (absDiff < WINDOW_320) return { pts: 320, label: 'PERFECT', color: 'var(--judgement-perfect)' };
    if (absDiff < WINDOW_300) return { pts: 300, label: 'GREAT', color: 'var(--judgement-great)' };
    if (absDiff < WINDOW_200) return { pts: 200, label: 'GOOD', color: 'var(--judgement-good)' };
    if (absDiff < WINDOW_100) return { pts: 100, label: 'OK', color: 'var(--judgement-ok)' };
    if (absDiff < WINDOW_50) return { pts: 50, label: 'MEH', color: 'var(--judgement-meh)' };
    return { pts: 0, label: 'MEH', color: 'var(--judgement-meh)' };
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
    hitErrors.push({ diff });
    
    const j = getJudgement(Math.abs(diff));
    updateJudgement(j.label, j.color);
    
    hp += getHealthIncreaseFor(j.pts, false);
    hp = Math.max(0, Math.min(100, hp));
    
    if (hp <= 0 && !noFailCheckbox.checked) {
        triggerFail();
        return;
    }

    if (j.pts > 0) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        score += j.pts + (combo * 10);
        totalHits += j.pts;
        accuracyWeight += j.pts === 320 ? 305 : j.pts;
    } else {
        combo = 0;
    }
    totalNotesPassed++;
    totalNotesHit++;

    updateUI();
}

function hitNoteRelease(note, diff) {
    note.active = false; 
    hitErrors.push({ diff });
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

    if (j.pts > 0) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        score += j.pts + (combo * 10);
        totalHits += j.pts;
        accuracyWeight += j.pts === 320 ? 305 : j.pts;
    } else {
        combo = 0;
    }
    totalNotesPassed++;
    totalNotesHit++;

    updateUI();
}

function breakHoldNote(note) {
    note.active = false;
    note.isHeld = false;
    activeHolds[note.lane] = null;
    
    updateJudgement('MISS', 'var(--judgement-miss)');
    hp += getHealthIncreaseFor(0, true);
    hp = Math.max(0, Math.min(100, hp));
    
    combo = 0;
    totalNotesPassed++;
}

function handleMiss(note) {
    note.active = false;
    if (note.type === 'hold') {
        note.headMissed = true;
    }
    
    updateJudgement('MISS', 'var(--judgement-miss)');
    hp += getHealthIncreaseFor(0, false);
    hp = Math.max(0, Math.min(100, hp));
    
    if (hp <= 0 && !noFailCheckbox.checked) {
        triggerFail();
    }
}

let isUIUpdateScheduled = false;

function updateUI() {
    if (isUIUpdateScheduled) return;
    isUIUpdateScheduled = true;
    requestAnimationFrame(() => {
        isUIUpdateScheduled = false;
        // Update Stats HUD
        scoreEl.textContent = String(score).padStart(6, '0');
        comboEl.textContent = combo;
        
        if (totalNotesPassed > 0) {
            const acc = (accuracyWeight / (totalNotesPassed * 305)) * 100;
            accuracyEl.textContent = acc.toFixed(2) + '%';
        } else {
            accuracyEl.textContent = '100.00%';
        }
        
        // Update HP and Hit Errors
        if (hudHpFill) {
            hudHpFill.style.height = `${hp}%`;
            if (hpColorHigh && hpColorMid && hpColorLow) {
                hudHpFill.style.background = `linear-gradient(to top, ${hpColorLow.value}, ${hpColorMid.value}, ${hpColorHigh.value})`;
            }
        }
        
        if (hudJudgmentTicks) {
            hudJudgmentTicks.innerHTML = '';
            hitErrors.forEach(err => {
                const offset = -(err.diff / MISS_WINDOW) * 100;
                const tick = document.createElement('div');
                tick.className = 'judgment-tick';
                tick.style.left = `calc(50% + ${offset}%)`;
                
                if (Math.abs(err.diff) <= WINDOW_320) tick.style.background = 'var(--judgement-perfect)';
                else if (Math.abs(err.diff) <= WINDOW_300) tick.style.background = 'var(--judgement-perfect)';
                else if (Math.abs(err.diff) <= WINDOW_200) tick.style.background = 'var(--judgement-great)';
                else if (Math.abs(err.diff) <= WINDOW_100) tick.style.background = 'var(--judgement-good)';
                else if (Math.abs(err.diff) <= WINDOW_50) tick.style.background = 'var(--judgement-ok)';
                else tick.style.background = 'var(--judgement-meh)';
                
                hudJudgmentTicks.appendChild(tick);
            });
        }
    
        const oneSecondAgo = performance.now() - 1000;
        keyPressTimes = keyPressTimes.filter(t => t > oneSecondAgo);
        
        if (kpsEl) {
            kpsEl.textContent = `${keyPressTimes.length} KPS`;
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

function playHitSound() {
    if (!hitSoundToggle.checked) return;
    if (audioCtx.state !== 'running') return;
    
    if (customHitSoundBuffer) {
        const source = audioCtx.createBufferSource();
        source.buffer = customHitSoundBuffer;
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.5; // default volume
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        source.start();
    } else {
        // synthesize sharp tick
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); 
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.06);
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
        
        if (gameTime > 0 && !isFailed) {
            const drift = (bgm.currentTime * 1000) - gameTime;
            gameTime += dt;
            
            if (Math.abs(drift) > 50) { 
                gameTime += drift * 0.1;
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

    // Update KPS
    const now = performance.now();
    while (keyPressTimes.length > 0 && now - keyPressTimes[0] > 1000) {
        keyPressTimes.shift();
    }
    const currentKPS = `${keyPressTimes.length} KPS`;
    if (kpsEl.textContent !== currentKPS) {
        kpsEl.textContent = currentKPS;
    }
}

function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    const gameScrollY = getScrollPosition(gameTime);
    
    // Draw Hit Line first so receptors can cover it
    ctx.strokeStyle = COLORS.hitLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, HIT_LINE_Y);
    ctx.lineTo(CANVAS_WIDTH, HIT_LINE_Y);
    ctx.stroke();

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
            }
            
            // Solid tap highlight below/above the line
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            if (isUpscroll) {
                ctx.fillRect(x, 0, LANE_WIDTH, HIT_LINE_Y);
            } else {
                ctx.fillRect(x, HIT_LINE_Y, LANE_WIDTH, CANVAS_HEIGHT - HIT_LINE_Y);
            }
        }

        // Key hint text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '20px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText(KEYBINDS[i].replace('Key', ''), x + LANE_WIDTH / 2, isUpscroll ? HIT_LINE_Y - 40 : HIT_LINE_Y + 40);

        ctx.strokeStyle = COLORS.laneBorder;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();

        // Target tap indicator (Receptor)
        ctx.fillStyle = (activeHits[i] > 0 || activeKeys[i]) ? COLORS.receptorActive : COLORS.receptor;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; // Distinct white outline, no longer purple
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + LANE_WIDTH / 2, HIT_LINE_Y, NOTE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
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
                  bodyAlpha = 0.3;
                  ctx.filter = "grayscale(100%)";
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
              ctx.filter = "none";
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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        if (isFailed) {
            ctx.fillStyle = 'var(--judgement-miss)';
            ctx.font = '900 48px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText('FAILED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        } else if (isPaused) {
            ctx.fillStyle = 'white';
            ctx.font = '900 48px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        } else {
            ctx.fillStyle = 'white';
            ctx.font = '24px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText('A S K L', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        }
    } else if (gameTime < 0) {
        ctx.fillStyle = '#fff';
        ctx.font = '80px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(-gameTime / 1000), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }
    
    // Draw Progress Pie Chart safely
    try {
        if (pieCtx && !isNaN(gameTime)) {
            let duration = mapDuration || 1;
            let progress = gameTime / duration;
            if (isNaN(progress) || !isFinite(progress)) progress = 0;
            progress = Math.max(0, Math.min(1, progress));
            
            pieCtx.clearRect(0, 0, 60, 60);
            
            pieCtx.beginPath();
            pieCtx.arc(30, 30, 25, 0, 2 * Math.PI);
            pieCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            pieCtx.fill();
            pieCtx.lineWidth = 4;
            pieCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            pieCtx.stroke();
            
            pieCtx.beginPath();
            pieCtx.arc(30, 30, 25, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress));
            pieCtx.lineTo(30, 30);
            pieCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            pieCtx.fill();
        }
    } catch (e) {
        console.error("Pie Chart Error: ", e);
    }
}

const loopChannel = new MessageChannel();

function gameLoop() {
    const now = performance.now();
    if (!lastTime) lastTime = now;
    
    const rate = getPlaybackRate();
    if (bgm && hasAudio && bgm.playbackRate !== rate) {
        bgm.playbackRate = rate;
    }
    
    let dt = (now - lastTime) * rate;
    if (lastTime === now) dt = 0; // Prevent huge jump on start
    lastTime = now;
    
    fpsFrames++;
    if (now - lastFpsTime >= 1000) {
        if (fpsEl) fpsEl.textContent = `${fpsFrames} FPS`;
        fpsFrames = 0;
        lastFpsTime = now;
    }

    // Cap dt to prevent massive jumps when switching tabs (cap at 100ms)
    lastTime = now;

    update(dt);
    loopChannel.port2.postMessage(null);
}

function renderLoop() {
    if (isPlaying) {
        draw();
    }
    requestAnimationFrame(renderLoop);
}

loopChannel.port1.onmessage = gameLoop;

// Start
gameLoop();
renderLoop();

function getScrollPosition(time) {
    if (!currentTimingPoints || currentTimingPoints.length === 0) return time;
    
    let tp = currentTimingPoints[0];
    for (let i = currentTimingPoints.length - 1; i >= 0; i--) {
        if (time >= currentTimingPoints[i].time) {
            tp = currentTimingPoints[i];
            break;
        }
    }
    
    return tp.cumulativeScroll + (time - tp.time) * tp.sv;
}





