/**
 * Parser for osu!mania .osz files
 * Extracts the audio track and parses the .osu beatmap data natively in the browser.
 */

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

    // 2. We want to find a 4K map (CircleSize: 4) and Mode: 3 (Mania)
    let selectedOsu = null;
    let selectedOsuText = "";

    for (const filename of osuFiles) {
        const text = await contents.files[filename].async("string");
        const lines = text.split(/\r\n|\n\r|\n/);
        
        let mode = getLineValue(lines, "Mode");
        let cs = getLineValue(lines, "CircleSize");
        
        if (mode === "3" && cs === "4") {
            selectedOsu = filename;
            selectedOsuText = text;
            break; // Pick the first 4K difficulty we find
        }
    }

    if (!selectedOsu) {
        throw new Error("No 4-Key osu!mania difficulty found in this archive. We currently only support 4K maps.");
    }
    console.log(`Selected difficulty: ${selectedOsu}`);

    // 3. Parse Metadata
    const lines = selectedOsuText.split(/\r\n|\n\r|\n/);
    const audioFilename = getLineValue(lines, "AudioFilename");
    const songName = getLineValue(lines, "Title") || "Imported .osz Map";
    
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
        const startTime = parseInt(parts[2], 10) / 1000.0; // convert ms to seconds
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
            const endTime = parseInt(holdParts[0], 10) / 1000.0;
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

    // Try to get BPM (first uninherited timing point)
    let bpm = 120;
    const timingPointsStart = lines.findIndex(l => l.trim() === "[TimingPoints]");
    if (timingPointsStart !== -1) {
        for (let i = timingPointsStart + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            if (line.startsWith("[")) break;
            
            const parts = line.split(",");
            if (parts.length >= 2) {
                const beatLength = parseFloat(parts[1]);
                if (beatLength > 0) { // uninherited point
                    bpm = Math.round(60000 / beatLength);
                    break;
                }
            }
        }
    }

    console.log(`Successfully parsed ${mapNotes.length} notes.`);

    return {
        songName,
        bpm,
        offset: 0, // absolute timestamps, so offset is always 0
        audioBufferData,
        mapNotes
    };
}

function getLineValue(lines, key) {
    const line = lines.find(l => l.startsWith(`${key}:`));
    if (!line) return null;
    return line.split(`${key}:`)[1].trim();
}
