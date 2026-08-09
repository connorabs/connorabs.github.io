const canvas = document.getElementById('builder-canvas');
const ctx = canvas.getContext('2d');
const timeDisplay = document.getElementById('time-display');

// DOM Elements
const audioUpload = document.getElementById('audio-upload');
const bpmInput = document.getElementById('bpm-input');
const offsetInput = document.getElementById('offset-input');
const snapInput = document.getElementById('snap-input');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const mapUpload = document.getElementById('map-upload');
const importOszBtn = document.getElementById('import-osz-btn');
const oszUpload = document.getElementById('osz-upload');
const patternSelect = document.getElementById('pattern-select');

// Configure Canvas
const CANVAS_WIDTH = 400;
const NUM_LANES = 4;
const LANE_WIDTH = CANVAS_WIDTH / NUM_LANES;
let CANVAS_HEIGHT = 800; // Will be immediately overridden
let HIT_LINE_Y = CANVAS_HEIGHT - 100;

function resizeCanvas() {
    if (canvas.parentElement) {
        CANVAS_HEIGHT = canvas.parentElement.clientHeight || window.innerHeight;
    } else {
        CANVAS_HEIGHT = window.innerHeight;
    }
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    HIT_LINE_Y = CANVAS_HEIGHT - 100;
}

window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 0);

// Audio State
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffer = null;
let audioSource = null;
let isPlaying = false;
let playbackStartTime = 0;
let pauseTime = 0;

// Editor State
let currentTime = 0; // Absolute time in seconds
let pixelsPerSecond = 800; // Zoom level
let bpm = 120;
let offset = 0.0;
let snapDivisor = 4;
let waveformData = null; // Array of peaks

// Looping & Playtest State
let isLooping = false;
let loopStart = 0;
let loopEnd = 0;
let isAutoplaying = false;

// Map Data
let mapNotes = []; // Schema: { time: 1.5, lanes: [0, 1], duration: 0.5 }
let songName = "map.json";

// Populate pattern stamper
window.GAME_PATTERNS.forEach((pattern, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    opt.textContent = pattern.name;
    patternSelect.appendChild(opt);
});

// -----------------------------------------------------------------------------
// Audio & Waveform Logic
// -----------------------------------------------------------------------------
audioUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    songName = file.name.replace(/\.[^/.]+$/, "") + ".json";
    
    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    generateWaveformData();
    
    currentTime = 0;
    pauseTime = 0;
});

function generateWaveformData() {
    const channelData = audioBuffer.getChannelData(0); // Use left channel
    const samplesPerSecond = audioBuffer.sampleRate;
    
    // We want to generate peaks down to a resolution that won't lose fidelity when zoomed in.
    // 100 peaks per second is plenty for rendering.
    const peaksPerSecond = 100;
    const sampleStep = Math.floor(samplesPerSecond / peaksPerSecond);
    
    waveformData = new Float32Array(Math.floor(channelData.length / sampleStep));
    
    for (let i = 0; i < waveformData.length; i++) {
        let max = 0;
        const start = i * sampleStep;
        for (let j = 0; j < sampleStep; j++) {
            const val = Math.abs(channelData[start + j]);
            if (val > max) max = val;
        }
        waveformData[i] = max;
    }
}

function playAudio() {
    if (!audioBuffer) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioCtx.destination);
    
    if (isLooping && loopEnd > loopStart) {
        if (pauseTime < loopStart || pauseTime >= loopEnd) {
            pauseTime = loopStart;
            currentTime = loopStart;
        }
        audioSource.loop = true;
        audioSource.loopStart = loopStart;
        audioSource.loopEnd = loopEnd;
    }

    audioSource.start(0, pauseTime);
    playbackStartTime = audioCtx.currentTime - pauseTime;
    isPlaying = true;
}

function playHitSound() {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

function pauseAudio() {
    if (!isPlaying) return;
    audioSource.stop();
    isPlaying = false;
    pauseTime = currentTime;
}

// -----------------------------------------------------------------------------
// Input Handling & Tools
// -----------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;

    if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedNotes.length > 0) {
            e.preventDefault();
            mapNotes = mapNotes.filter(n => !selectedNotes.includes(n));
            selectedNotes = [];
            return;
        }
    }

    if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) pauseAudio();
        else playAudio();
    }
    
    if (e.code === 'KeyQ') {
        e.preventDefault();
        if (loopStart === currentTime) {
            isLooping = false;
            loopStart = 0;
            loopEnd = 0;
        } else {
            loopStart = currentTime;
            isLooping = (loopEnd > loopStart);
        }
        if (isPlaying) { pauseAudio(); playAudio(); }
    }
    
    if (e.code === 'KeyE') {
        e.preventDefault();
        if (loopEnd === currentTime) {
            isLooping = false;
            loopStart = 0;
            loopEnd = 0;
        } else {
            loopEnd = currentTime;
            isLooping = (loopEnd > loopStart);
        }
        if (isPlaying) { pauseAudio(); playAudio(); }
    }
});

// Settings update
bpmInput.addEventListener('input', () => bpm = parseFloat(bpmInput.value) || 120);
offsetInput.addEventListener('input', () => offset = parseFloat(offsetInput.value) || 0);
snapInput.addEventListener('change', () => snapDivisor = parseInt(snapInput.value));

const loopStartBtn = document.getElementById('loop-start-btn');
const loopEndBtn = document.getElementById('loop-end-btn');
const loopClearBtn = document.getElementById('loop-clear-btn');
const autoplayCheckbox = document.getElementById('autoplay-checkbox');

const tabTools = document.getElementById('tab-tools');
const tabJson = document.getElementById('tab-json');
const toolsPanel = document.getElementById('tools-panel');
const jsonPanel = document.getElementById('json-panel');
const jsonEditor = document.getElementById('json-editor');
const jsonApplyBtn = document.getElementById('json-apply-btn');

if (tabTools && tabJson) {
    tabTools.addEventListener('click', () => {
        tabTools.classList.add('active');
        tabJson.classList.remove('active');
        toolsPanel.style.display = 'flex';
        jsonPanel.style.display = 'none';
    });
    
    tabJson.addEventListener('click', () => {
        tabJson.classList.add('active');
        tabTools.classList.remove('active');
        toolsPanel.style.display = 'none';
        jsonPanel.style.display = 'flex';
        
        const mapData = {
            version: 1,
            songName: songName,
            bpm: bpm,
            offset: offset,
            notes: mapNotes.map(n => ({
                time: Number(n.time.toFixed(3)),
                lanes: n.lanes,
                duration: Number(n.duration.toFixed(3))
            }))
        };
        jsonEditor.value = JSON.stringify(mapData, null, 2);
    });
    
    jsonApplyBtn.addEventListener('click', () => {
        try {
            const mapData = JSON.parse(jsonEditor.value);
            songName = mapData.songName || songName;
            bpm = mapData.bpm || bpm;
            offset = mapData.offset || offset;
            
            bpmInput.value = bpm;
            offsetInput.value = offset;
            
            if (Array.isArray(mapData.notes)) {
                mapNotes = mapData.notes;
            }
            
            selectedNotes = [];
            alert("Changes applied successfully!");
        } catch(err) {
            alert("Error parsing JSON. Please check your syntax.");
        }
    });
}

if (loopStartBtn) {
    loopStartBtn.addEventListener('click', () => {
        loopStart = currentTime;
        isLooping = (loopEnd > loopStart);
        if (isPlaying) { pauseAudio(); playAudio(); }
    });
}
if (loopEndBtn) {
    loopEndBtn.addEventListener('click', () => {
        loopEnd = currentTime;
        isLooping = (loopEnd > loopStart);
        if (isPlaying) { pauseAudio(); playAudio(); }
    });
}
if (loopClearBtn) {
    loopClearBtn.addEventListener('click', () => {
        isLooping = false;
        loopStart = 0;
        loopEnd = 0;
        if (isPlaying) { pauseAudio(); playAudio(); }
    });
}
if (autoplayCheckbox) {
    autoplayCheckbox.addEventListener('change', () => {
        isAutoplaying = autoplayCheckbox.checked;
    });
}

function getSelectedTool() {
    return document.querySelector('input[name="tool"]:checked').value;
}

// Grid Snapping Math
function snapTime(time) {
    if (bpm <= 0) return time;
    const beatDuration = 60 / bpm;
    const snapDuration = beatDuration / snapDivisor;
    
    // Find closest snap point
    // time = offset + (N * snapDuration)
    const normalizedTime = time - offset;
    const snaps = Math.round(normalizedTime / snapDuration);
    let snapped = offset + (snaps * snapDuration);
    return Math.max(0, snapped);
}

// Interaction
let isDragging = false;
let dragStartNote = null;
let middleDragNote = null;
let middleDragOriginalLane = 0;

// Multi-Selection State
let selectedNotes = [];
let isBoxSelecting = false;
let boxSelectStart = { x: 0, y: 0, time: 0, lane: 0 };
let boxSelectCurrent = { x: 0, y: 0, time: 0, lane: 0 };

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
        // Zoom
        const zoomDelta = e.deltaY > 0 ? -100 : 100;
        pixelsPerSecond = Math.max(200, Math.min(2000, pixelsPerSecond + zoomDelta));
    } else {
        // Scroll
        if (isPlaying) pauseAudio();
        // Invert deltaY so scrolling down moves down the chart (back in time)
        const timeDelta = -(e.deltaY / pixelsPerSecond);
        currentTime = Math.max(0, currentTime + timeDelta);
        pauseTime = currentTime;
    }
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0 && e.button !== 1) return; // Left or Middle click
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const lane = Math.floor(clickX / LANE_WIDTH);
    if (lane < 0 || lane >= NUM_LANES) return;
    
    const pixelsFromHitLine = HIT_LINE_Y - clickY;
    const timeAtClick = currentTime + (pixelsFromHitLine / pixelsPerSecond);
    
    if (timeAtClick < 0) return;
    const snappedTime = snapTime(timeAtClick);

    if (e.button === 0 && e.shiftKey) {
        e.preventDefault();
        isBoxSelecting = true;
        boxSelectStart = { x: clickX, y: clickY, time: timeAtClick, lane: lane };
        boxSelectCurrent = { x: clickX, y: clickY, time: timeAtClick, lane: lane };
        return;
    }
    
    if (e.button === 0 && !e.shiftKey) {
        selectedNotes = []; // Clear selection when clicking normally
    }

    if (e.button === 1) { // Middle click drag
        e.preventDefault();
        const EPSILON = 10 / pixelsPerSecond;
        const clickedNote = mapNotes.find(n => n.lanes.includes(lane) && timeAtClick >= n.time - EPSILON && timeAtClick <= n.time + (n.duration || 0) + EPSILON);
        if (clickedNote) {
            middleDragNote = clickedNote;
            middleDragOriginalLane = lane;
            if (!selectedNotes.includes(clickedNote)) {
                selectedNotes = [clickedNote];
            }
        }
        return;
    }

    const tool = getSelectedTool();
    const EPSILON = 10 / pixelsPerSecond;
    const clickedNote = mapNotes.find(n => n.lanes.includes(lane) && timeAtClick >= n.time - EPSILON && timeAtClick <= n.time + (n.duration || 0) + EPSILON);

    if (tool === 'note') {
        if (clickedNote) {
            const laneIdx = clickedNote.lanes.indexOf(lane);
            clickedNote.lanes.splice(laneIdx, 1);
            if (clickedNote.lanes.length === 0) mapNotes = mapNotes.filter(n => n !== clickedNote);
        } else {
            let existingAtSnap = mapNotes.find(n => Math.abs(n.time - snappedTime) < 0.001);
            if (existingAtSnap) {
                if (!existingAtSnap.lanes.includes(lane)) {
                    existingAtSnap.lanes.push(lane);
                    existingAtSnap.lanes.sort((a,b) => a-b);
                }
            } else {
                mapNotes.push({ time: snappedTime, lanes: [lane], duration: 0 });
            }
        }
    } else if (tool === 'ln') {
        isDragging = true;
        let existingAtSnap = mapNotes.find(n => Math.abs(n.time - snappedTime) < 0.001);
        if (existingAtSnap) {
            if (!existingAtSnap.lanes.includes(lane)) {
                existingAtSnap.lanes.push(lane);
                existingAtSnap.lanes.sort((a,b) => a-b);
            }
            dragStartNote = existingAtSnap;
        } else {
            const newNote = { time: snappedTime, lanes: [lane], duration: 0 };
            mapNotes.push(newNote);
            dragStartNote = newNote;
        }
    } else if (tool === 'delete') {
        if (clickedNote) {
            const laneIdx = clickedNote.lanes.indexOf(lane);
            clickedNote.lanes.splice(laneIdx, 1);
            if (clickedNote.lanes.length === 0) mapNotes = mapNotes.filter(n => n !== clickedNote);
        }
    } else if (tool === 'stamp') {
        stampPattern(snappedTime);
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickX = e.clientX - rect.left;
    const lane = Math.floor(clickX / LANE_WIDTH);
    const pixelsFromHitLine = HIT_LINE_Y - clickY;
    const timeAtClick = currentTime + (pixelsFromHitLine / pixelsPerSecond);
    const snappedTime = snapTime(Math.max(0, timeAtClick));

    if (isBoxSelecting) {
        boxSelectCurrent = { x: clickX, y: clickY, time: timeAtClick, lane: lane };
        return;
    }

    if (middleDragNote) {
        const timeDelta = snappedTime - middleDragNote.time;
        let laneDelta = 0;
        if (lane >= 0 && lane < NUM_LANES && lane !== middleDragOriginalLane) {
            laneDelta = lane - middleDragOriginalLane;
            middleDragOriginalLane = lane;
        }

        if (timeDelta !== 0 || laneDelta !== 0) {
            selectedNotes.forEach(sn => {
                sn.time = Math.max(0, sn.time + timeDelta);
                if (laneDelta !== 0) {
                    let shifted = sn.lanes.map(l => l + laneDelta).filter(l => l >= 0 && l < NUM_LANES);
                    if (shifted.length > 0) sn.lanes = shifted;
                }
            });
        }
        return;
    }

    if (!isDragging || !dragStartNote) return;
    dragStartNote.duration = snapTime(Math.max(dragStartNote.time, timeAtClick)) - dragStartNote.time;
});

window.addEventListener('mouseup', (e) => {
    isDragging = false;
    dragStartNote = null;
    
    if (isBoxSelecting) {
        isBoxSelecting = false;
        const minTime = Math.min(boxSelectStart.time, boxSelectCurrent.time);
        const maxTime = Math.max(boxSelectStart.time, boxSelectCurrent.time);
        const minLane = Math.min(boxSelectStart.lane, boxSelectCurrent.lane);
        const maxLane = Math.max(boxSelectStart.lane, boxSelectCurrent.lane);
        
        mapNotes.forEach(note => {
            if (note.time >= minTime && note.time <= maxTime) {
                const inside = note.lanes.some(l => l >= minLane && l <= maxLane);
                if (inside && !selectedNotes.includes(note)) selectedNotes.push(note);
            }
        });
    }

    if (e.button === 1 && middleDragNote) {
        middleDragNote = null;
        cleanupNotes();
    }
});

function cleanupNotes() {
    const EPSILON = 0.001;
    let uniqueNotes = [];
    
    mapNotes.forEach(note => {
        let existing = uniqueNotes.find(n => Math.abs(n.time - note.time) < EPSILON && Math.abs((n.duration||0) - (note.duration||0)) < EPSILON);
        if (existing) {
            note.lanes.forEach(l => {
                if (!existing.lanes.includes(l)) existing.lanes.push(l);
            });
            existing.lanes.sort((a,b) => a-b);
        } else {
            uniqueNotes.push(note);
        }
    });
    
    mapNotes = uniqueNotes;
}

// Map Manipulation
function placeOrToggleNote(time, lane, duration, forceCreate = false) {
    // Check if exact note exists
    const EPSILON = 0.001;
    let existing = mapNotes.find(n => Math.abs(n.time - time) < EPSILON);
    
    if (existing && !forceCreate) {
        // Toggle lane
        const laneIdx = existing.lanes.indexOf(lane);
        if (laneIdx > -1) {
            existing.lanes.splice(laneIdx, 1);
            if (existing.lanes.length === 0) {
                mapNotes = mapNotes.filter(n => n !== existing);
            }
        } else {
            existing.lanes.push(lane);
            existing.lanes.sort((a,b) => a-b);
        }
        return existing;
    } else {
        const newNote = { time, lanes: [lane], duration };
        mapNotes.push(newNote);
        mapNotes.sort((a,b) => a.time - b.time);
        return newNote;
    }
}

// removed deleteNoteAt

function stampPattern(startTime) {
    const patternIdx = parseInt(patternSelect.value);
    const pattern = window.GAME_PATTERNS[patternIdx];
    if (!pattern) return;
    
    const beatDuration = 60 / bpm;
    
    pattern.sequence.forEach((seq, i) => {
        const time = startTime + (i * pattern.beatSnap * beatDuration);
        const duration = (seq.holdBeats || 0) * beatDuration;
        
        seq.lanes.forEach(lane => {
            placeOrToggleNote(time, lane, duration, true);
        });
    });
}

// -----------------------------------------------------------------------------
// Render Loop
// -----------------------------------------------------------------------------
function draw() {
    let prevTime = currentTime;

    if (isPlaying) {
        let playedTime = audioCtx.currentTime - playbackStartTime;
        if (isLooping && loopEnd > loopStart && playedTime >= loopEnd) {
            let timeSinceFirstLoop = playedTime - loopEnd;
            currentTime = loopStart + (timeSinceFirstLoop % (loopEnd - loopStart));
        } else {
            currentTime = playedTime;
        }
    }
    
    if (isPlaying && isAutoplaying) {
        let notesToPlay = 0;
        if (currentTime < prevTime) { // Looped
            notesToPlay += mapNotes.filter(n => n.time > prevTime && n.time <= loopEnd).length;
            notesToPlay += mapNotes.filter(n => n.time >= loopStart && n.time <= currentTime).length;
        } else {
            notesToPlay += mapNotes.filter(n => n.time > prevTime && n.time <= currentTime).length;
        }
        if (notesToPlay > 0) playHitSound();
    }
    
    timeDisplay.textContent = formatTime(currentTime);

    ctx.fillStyle = '#0f0f13';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Waveform Background
    if (waveformData) {
        ctx.fillStyle = 'rgba(0, 255, 204, 0.1)';
        const visibleSeconds = CANVAS_HEIGHT / pixelsPerSecond;
        const startTime = currentTime - ((CANVAS_HEIGHT - HIT_LINE_Y) / pixelsPerSecond);
        
        const peaksPerSecond = 100;
        const startIdx = Math.max(0, Math.floor(startTime * peaksPerSecond));
        const endIdx = Math.min(waveformData.length, Math.ceil((startTime + visibleSeconds) * peaksPerSecond));
        
        ctx.beginPath();
        for (let i = startIdx; i < endIdx; i++) {
            const peakTime = i / peaksPerSecond;
            const y = HIT_LINE_Y - ((peakTime - currentTime) * pixelsPerSecond);
            const val = waveformData[i] * (CANVAS_WIDTH / 2);
            
            ctx.moveTo(CANVAS_WIDTH/2 - val, y);
            ctx.lineTo(CANVAS_WIDTH/2 + val, y);
        }
        ctx.strokeStyle = 'rgba(0, 255, 204, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Draw Lanes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i < NUM_LANES; i++) {
        ctx.beginPath();
        ctx.moveTo(i * LANE_WIDTH, 0);
        ctx.lineTo(i * LANE_WIDTH, CANVAS_HEIGHT);
        ctx.stroke();
    }

    // Draw Beat Grid
    const beatDuration = 60 / bpm;
    const snapDuration = beatDuration / snapDivisor;
    
    const visibleTimeBottom = currentTime - ((CANVAS_HEIGHT - HIT_LINE_Y) / pixelsPerSecond);
    const visibleTimeTop = currentTime + (HIT_LINE_Y / pixelsPerSecond);
    
    // Find starting beat
    let startSnap = Math.floor((visibleTimeBottom - offset) / snapDuration);
    let endSnap = Math.ceil((visibleTimeTop - offset) / snapDuration);
    
    for (let s = startSnap; s <= endSnap; s++) {
        const snapTime = offset + (s * snapDuration);
        const y = HIT_LINE_Y - ((snapTime - currentTime) * pixelsPerSecond);
        
        // Emphasize whole beats vs subdivisions
        const isWholeBeat = Math.abs((snapTime - offset) % beatDuration) < 0.001;
        
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        
        if (isWholeBeat) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        }
        ctx.stroke();
        
        if (isWholeBeat) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '10px Outfit';
            ctx.fillText(Math.round((snapTime - offset)/beatDuration), 5, y - 5);
        }
    }

    // Draw Hit Line
    ctx.beginPath();
    ctx.moveTo(0, HIT_LINE_Y);
    ctx.lineTo(CANVAS_WIDTH, HIT_LINE_Y);
    ctx.strokeStyle = 'var(--hit-line-color)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Loop Region
    if (isLooping && loopEnd > loopStart) {
        const yStart = HIT_LINE_Y - ((loopStart - currentTime) * pixelsPerSecond);
        const yEnd = HIT_LINE_Y - ((loopEnd - currentTime) * pixelsPerSecond);
        
        ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
        ctx.fillRect(0, yEnd, CANVAS_WIDTH, yStart - yEnd);
        
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, yStart); ctx.lineTo(CANVAS_WIDTH, yStart);
        ctx.moveTo(0, yEnd); ctx.lineTo(CANVAS_WIDTH, yEnd);
        ctx.stroke();
    }

    // Draw Notes
    mapNotes.forEach(note => {
        const headY = HIT_LINE_Y - ((note.time - currentTime) * pixelsPerSecond);
        const tailY = HIT_LINE_Y - (((note.time + note.duration) - currentTime) * pixelsPerSecond);
        
        const isSelected = selectedNotes.includes(note);

        note.lanes.forEach(lane => {
            const rx = lane * LANE_WIDTH;
            const w = LANE_WIDTH;
            
            if (note.duration > 0.01) {
                // Draw LN Body
                ctx.fillStyle = isSelected ? 'rgba(255, 255, 0, 0.4)' : 'rgba(0, 255, 204, 0.4)';
                ctx.fillRect(rx, tailY, w, headY - tailY);
                ctx.strokeStyle = isSelected ? '#ffff00' : 'rgba(0, 255, 204, 0.9)';
                ctx.strokeRect(rx, tailY, w, headY - tailY);
            }
            
            // Draw Head Note
            ctx.fillStyle = isSelected ? '#ffff00' : 'white';
            ctx.fillRect(rx, headY - 10, w, 20);
            ctx.strokeStyle = isSelected ? '#ffaa00' : 'var(--hit-line-color)';
            ctx.strokeRect(rx, headY - 10, w, 20);
        });
    });

    // Draw Selection Box
    if (isBoxSelecting) {
        ctx.fillStyle = 'rgba(0, 150, 255, 0.2)';
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)';
        ctx.lineWidth = 1;
        const x = Math.min(boxSelectStart.x, boxSelectCurrent.x);
        const y = Math.min(boxSelectStart.y, boxSelectCurrent.y);
        const w = Math.abs(boxSelectStart.x - boxSelectCurrent.x);
        const h = Math.abs(boxSelectStart.y - boxSelectCurrent.y);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
    }

    requestAnimationFrame(draw);
}

function formatTime(s) {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

requestAnimationFrame(draw);

// -----------------------------------------------------------------------------
// JSON Export
// -----------------------------------------------------------------------------
exportBtn.addEventListener('click', () => {
    // Clean up empty notes
    mapNotes = mapNotes.filter(n => n.lanes.length > 0);
    
    const mapData = {
        version: 1,
        songName: songName,
        bpm: bpm,
        offset: offset,
        notes: mapNotes.map(n => ({
            time: Number(n.time.toFixed(3)),
            lanes: n.lanes,
            duration: Number(n.duration.toFixed(3))
        }))
    };
    
    const jsonString = JSON.stringify(mapData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = songName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

if (importBtn && mapUpload) {
    importBtn.addEventListener('click', () => {
        mapUpload.click();
    });

    mapUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const mapData = JSON.parse(event.target.result);
                songName = mapData.songName || "imported_map.json";
                bpm = mapData.bpm || 120;
                offset = mapData.offset || 0;
                
                bpmInput.value = bpm;
                offsetInput.value = offset;
                
                if (Array.isArray(mapData.notes)) {
                    mapNotes = mapData.notes;
                }
                
                selectedNotes = []; // Clear selection
                console.log("Map imported successfully");
            } catch(err) {
                alert("Error parsing map JSON");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
}

if (importOszBtn && oszUpload) {
    importOszBtn.addEventListener('click', () => {
        oszUpload.click();
    });

    oszUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            importOszBtn.innerText = "Loading...";
            importOszBtn.disabled = true;
            
            const data = await parseOsz(file);
            songName = data.songName || "imported.osz";
            bpm = data.bpm || 120;
            offset = data.offset || 0;
            mapNotes = data.mapNotes;
            
            bpmInput.value = bpm;
            offsetInput.value = offset;
            selectedNotes = [];
            
            if (data.audioBufferData) {
                audioBuffer = await audioCtx.decodeAudioData(data.audioBufferData);
                console.log("OSZ Audio loaded!");
            }
            
            alert("Successfully imported .osz map!");
        } catch (err) {
            console.error(err);
            alert(err.message);
        } finally {
            importOszBtn.innerText = "Import .osz Map";
            importOszBtn.disabled = false;
        }
        
        e.target.value = '';
    });
}
