/**
 * Parser for osu!mania .osz files
 * Extracts the audio track and parses the .osu beatmap data natively in the browser.
 */

async function promptDifficultySelection(difficulties) {
    return new Promise((resolve) => {
        let modal = document.getElementById('osz-difficulty-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'osz-difficulty-modal';
            modal.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; justify-content:center; align-items:center; font-family: sans-serif;";
            modal.innerHTML = `
                <div style="background:#222; padding:20px; border-radius:8px; border:2px solid #555; text-align:center; min-width:300px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                    <h3 style="color:white; margin-top:0;">Select Difficulty</h3>
                    <select id="osz-difficulty-select" style="margin: 15px 0; padding: 8px; background: #333; color: white; width: 100%; border: 1px solid #555; outline:none; cursor:pointer;"></select>
                    <br>
                    <button id="osz-difficulty-cancel" style="padding:8px 16px; background:#f44336; color:white; border:none; border-radius:4px; cursor:pointer; margin-right:10px;">Cancel</button>
                    <button id="osz-difficulty-confirm" style="padding:8px 16px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer;">Load Map</button>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const select = document.getElementById('osz-difficulty-select');
        const confirmBtn = document.getElementById('osz-difficulty-confirm');
        const cancelBtn = document.getElementById('osz-difficulty-cancel');
        
        select.innerHTML = '';
        difficulties.forEach((diff, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = diff.name;
            select.appendChild(opt);
        });

        modal.style.display = 'flex';

        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        confirmBtn.onclick = () => {
            cleanup();
            resolve(difficulties[parseInt(select.value)].filename);
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };
    });
}

async function parseOsz(file) {
    if (!window.JSZip) {
        throw new Error("JSZip not loaded. Cannot parse .osz file.");
    }

    console.log("Loading .osz archive...");
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);

    // 1. Find all .osu files
    const osuFiles = [];
    for (const filename in contents.files) {
        if (filename.endsWith('.osu') && !contents.files[filename].dir) {
            osuFiles.push(filename);
        }
    }

    if (osuFiles.length === 0) {
        throw new Error("No .osu files found in the archive.");
    }

    // 2. We want to find 4K maps (CircleSize: 4) and Mode: 3 (Mania)
    let validDifficulties = [];
    
    for (const filename of osuFiles) {
        const text = await contents.files[filename].async("string");
        const lines = text.split(/\r\n|\n\r|\n/);
        
        let mode = getLineValue(lines, "Mode");
        let cs = getLineValue(lines, "CircleSize");
        let version = getLineValue(lines, "Version") || "Unknown Difficulty";
        
        if (mode === "3" && cs === "4") {
            validDifficulties.push({
                filename: filename,
                name: version,
                text: text
            });
        }
    }

    if (validDifficulties.length === 0) {
        throw new Error("No 4-Key osu!mania difficulty found in this archive. We currently only support 4K maps.");
    }

    let selectedOsu = null;
    let selectedOsuText = "";

    if (validDifficulties.length === 1) {
        selectedOsu = validDifficulties[0].filename;
        selectedOsuText = validDifficulties[0].text;
    } else {
        // Prompt user
        const chosenFilename = await promptDifficultySelection(validDifficulties);
        if (!chosenFilename) {
            throw new Error("User cancelled difficulty selection.");
        }
        const chosenDiff = validDifficulties.find(d => d.filename === chosenFilename);
        selectedOsu = chosenDiff.filename;
        selectedOsuText = chosenDiff.text;
    }
    
    console.log(`Selected difficulty: ${selectedOsu}`);

    // 3. Parse Metadata
    const lines = selectedOsuText.split(/\r\n|\n\r|\n/);
    const audioFilename = getLineValue(lines, "AudioFilename");
    const odString = getLineValue(lines, "OverallDifficulty");
    const od = odString ? parseFloat(odString) : 8;
    const hpString = getLineValue(lines, "HPDrainRate");
    const hp = hpString ? parseFloat(hpString) : 8;
    const songName = getLineValue(lines, "Title") || "Imported .osz Map";
    const difficultyName = getLineValue(lines, "Version") || "";
    const fullTitle = difficultyName ? `${songName} [${difficultyName}]` : songName;
    
    // 4. Extract Audio
    let audioBufferData = null;
    
    if (audioFilename) {
        let actualAudioKey = Object.keys(contents.files).find(k => k.toLowerCase() === audioFilename.toLowerCase());
        
        if (actualAudioKey && contents.files[actualAudioKey]) {
            console.log(`Extracting audio: ${actualAudioKey}`);
            audioBufferData = await contents.files[actualAudioKey].async("arraybuffer");
        } else {
            throw new Error(`Audio file '${audioFilename}' not found in the archive.`);
        }
    } else {
        throw new Error("AudioFilename not specified in the .osu file.");
    }

    // 5. Parse HitObjects
    const hitObjectsStart = lines.findIndex(l => l.trim() === "[HitObjects]");
    if (hitObjectsStart === -1) {
        throw new Error("No HitObjects section found.");
    }

    const mapNotes = [];
    for (let i = hitObjectsStart + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line.startsWith("[")) break; // Reached next section

        const parts = line.split(",");
        if (parts.length < 4) continue;

        const x = parseInt(parts[0], 10);
        const startTime = parseInt(parts[2], 10); // keep in ms
        const type = parseInt(parts[3], 10);
        
        // Map X to Lane (4K mode: 0-3)
        // Formula: Math.floor(x * keys / 512)
        let lane = Math.floor(x * 4 / 512);
        // Clamp it safely
        lane = Math.max(0, Math.min(3, lane));

        let duration = 0;
        
        // Check if Long Note (bit 7 is set: type 128)
        if ((type & 128) === 128 && parts.length > 5) {
            const holdParts = parts[5].split(":");
            const endTime = parseInt(holdParts[0], 10); // keep in ms
            if (Number.isFinite(endTime) && endTime > startTime) {
                duration = endTime - startTime;
            }
        }

        mapNotes.push({
            time: startTime,
            lanes: [lane],
            duration: duration
        });
    }

    // Sort by time
    mapNotes.sort((a, b) => a.time - b.time);

    // Parse TimingPoints for SV and BPM
    let bpm = 120;
    const timingPoints = [];
    const timingPointsStart = lines.findIndex(l => l.trim() === "[TimingPoints]");
    if (timingPointsStart !== -1) {
        for (let i = timingPointsStart + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            if (line.startsWith("[")) break;
            
            const parts = line.split(",");
            if (parts.length >= 2) {
                const timeStr = parts[0];
                const beatLengthStr = parts[1];
                if (!timeStr || !beatLengthStr) continue;
                
                const timeSec = parseFloat(timeStr); // keep in ms
                const beatLength = parseFloat(beatLengthStr);
                
                let sv = 1.0;
                if (beatLength > 0) { // uninherited point
                    bpm = Math.round(60000 / beatLength);
                    sv = 1.0;
                } else if (beatLength < 0) { // inherited point
                    sv = -100 / beatLength;
                }
                
                timingPoints.push({ time: timeSec, sv });
            }
        }
    }
    
    // Sort and calculate cumulative scroll
    timingPoints.sort((a, b) => a.time - b.time);
    
    // Calculate integral of scroll speed
    let cumulativeScroll = 0;
    for (let i = 0; i < timingPoints.length; i++) {
        if (i > 0) {
            cumulativeScroll += (timingPoints[i].time - timingPoints[i-1].time) * timingPoints[i-1].sv;
        }
        timingPoints[i].cumulativeScroll = cumulativeScroll;
    }

    console.log(`Successfully parsed ${mapNotes.length} notes and ${timingPoints.length} timing points.`);

    return {
        songName: fullTitle,
        od: od,
        hp: hp,
        bpm,
        offset: 0,
        audioBufferData,
        mapNotes,
        timingPoints
    };
}

function getLineValue(lines, key) {
    const line = lines.find(l => l.startsWith(`${key}:`));
    if (!line) return null;
    return line.split(`${key}:`)[1].trim();
}

