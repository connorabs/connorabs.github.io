$content = Get-Content -Path "main.js" -Raw

# 1. keydown
$content = $content -replace '(?s)let best = null;.*?if \(best\) \{.*?hitNote\(best, bestDiff\);.*?activeHits\[lane\] = 0\.15;.*?if \(best\.endTime > best\.time\) \{.*?best\.isBeingHeld = true;.*?activeHolds\[lane\] = best;.*?\}[\s\S]*?\}',
'let earliestNote = null;
      for (let i = currentNoteIndex; i < notes.length; i++) {
          const n = notes[i];
          if (n.active && n.lane === lane && !n.hit && !n.headMissed) {
              earliestNote = n;
              break;
          }
      }

      if (earliestNote) {
          const diff = earliestNote.time - currentExactGameTime;
          if (Math.Abs(diff) <= MISS_WINDOW) {
              hitNote(earliestNote, diff);
              activeHits[lane] = 0.15;
              
              if (earliestNote.endTime > earliestNote.time) {
                  earliestNote.isBeingHeld = true;
                  earliestNote.headHit = true;
                  activeHolds[lane] = earliestNote;
              }
          }
      }'

# 2. keyup
$content = $content -replace '(?s)const diff = holdNote\.endTime - currentExactGameTime;.*?if \(Math\.abs\(diff\) <= WINDOW_GOOD\) \{.*?hitNoteRelease\(holdNote, diff\);.*?\} else \{.*?missNote\(holdNote\);.*?\}',
'const diff = holdNote.endTime - currentExactGameTime;
          if (Math.abs(diff) <= MISS_WINDOW * 1.5) {
              hitNoteRelease(holdNote, diff);
          } else {
              breakHoldNote(holdNote);
          }'

# 3. hitNote
$content = $content -replace '(?s)if \(note\.endTime <= note\.time\) \{\s*totalNotesPassed\+\+;\s*totalNotesHit\+\+;\s*note\.active = false;\s*\}',
'if (!(note.endTime > note.time)) {
        totalNotesPassed++;
        totalNotesHit++;
        note.active = false;
    }'

# 4. hitNoteRelease
$content = $content -replace '(?s)function hitNoteRelease\(note, diff\) \{.*?setTimeout\(\(\) => \{ judgementEl\.style\.transform = ''translate\(-50%, -50%\) scale\(1\)''\; \}, 50\);\n\}',
'function hitNoteRelease(note, diff) {
    note.tailHit = true;
    note.active = false;
    
    let pnts = 0;
    if (Math.abs(diff) <= WINDOW_PERFECT * 1.5) { pnts = 300; }
    else if (Math.abs(diff) <= WINDOW_GREAT * 1.5) { pnts = 200; }
    else if (Math.abs(diff) <= WINDOW_GOOD * 1.5) { pnts = 100; }
    else { pnts = 50; }
    
    if (note.broken) {
        pnts = 50;
    }
    
    score += pnts;
    totalNotesPassed++;
    totalNotesHit++;
    totalHits++;
    
    if (!note.broken) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        hp = Math.min(100, hp + 2);
    }
    
    hitErrors.push({ diff: diff, alpha: 1.0, miss: false });
    if (hitErrors.length > 40) hitErrors.shift();
    
    updateHUD();
    
    let txt = "GOOD";
    let cls = "judgement-good";
    if (pnts === 300) { txt = "PERFECT"; cls = "judgement-perfect"; }
    else if (pnts === 200) { txt = "GREAT"; cls = "judgement-great"; }
    else if (pnts === 50) { txt = "OKAY"; cls = "judgement-bad"; }
    
    judgementEl.textContent = txt;
    judgementEl.className = cls;
    judgementEl.style.transform = "translate(-50%, -50%) scale(1.1)";
    setTimeout(() => { judgementEl.style.transform = "translate(-50%, -50%) scale(1)"; }, 50);
}'

# 5. missNote
$content = $content -replace '(?s)function missNote\(note\) \{.*?note\.active = false;.*?\}\n\}',
'function missNote(note) {
    if (!note.isMissed) {
        note.isMissed = true;
        combo = 0;
        totalNotesPassed++;
        hp -= 10;
        
        hitErrors.push({ diff: 0, alpha: 1.0, miss: true });
        if (hitErrors.length > 40) hitErrors.shift();
        
        updateHUD();
        judgementEl.textContent = "MISS";
        judgementEl.className = "judgement-miss";
        judgementEl.style.transform = "translate(-50%, -50%) scale(1.1)";
        setTimeout(() => { judgementEl.style.transform = "translate(-50%, -50%) scale(1)"; }, 50);
        
        if (hp <= 0 && !noFailCheckbox.checked) {
            isFailed = true;
            if (hasAudio) bgm.pause();
        }
    }
    
    if (!(note.endTime > note.time)) {
        note.active = false;
    }
}

function breakHoldNote(note) {
    if (!note.broken) {
        note.broken = true;
        note.isBeingHeld = false;
        combo = 0;
        if (activeHolds[note.lane] === note) {
            activeHolds[note.lane] = null;
        }
        updateHUD();
    }
}'

# 6. checkMisses
$content = $content -replace '(?s)function checkMisses\(\) \{.*?if \(!note\.hit\) \{.*?const timeDiff = note\.time - gameTime;.*?if \(timeDiff < -MISS_WINDOW\) \{.*?missNote\(note\);.*?\}[\s\S]*?\}[\s\S]*?\}',
'function checkMisses() {
    for (let i = currentNoteIndex; i < notes.length; i++) {
        const note = notes[i];
        if (!note.active) continue;
        if (note.time > gameTime + 2000) break;
        
        if (!note.hit && !note.headMissed) {
            const timeDiff = note.time - gameTime;
            if (timeDiff < -MISS_WINDOW) {
                note.headMissed = true;
                missNote(note);
                if (note.endTime > note.time) {
                    breakHoldNote(note);
                }
            }
        }
        
        if (note.endTime > note.time) {
            if (note.broken && !note.tailMissed && !note.tailHit) {
                const timeDiff = note.endTime - gameTime;
                if (timeDiff <= 0) {
                    hitNoteRelease(note, 0); // Reached end broken, score 50
                }
            } else if (note.isBeingHeld && !note.tailHit && !note.tailMissed) {
                const timeDiff = note.endTime - gameTime;
                if (timeDiff < -MISS_WINDOW * 1.5) {
                    note.isBeingHeld = false;
                    activeHolds[note.lane] = null;
                    note.tailMissed = true;
                    missNote(note);
                    note.active = false;
                }
            }
        }
    }'

# 7. LN Body Draw
$content = $content -replace '(?s)ctx\.drawImage\(preLNBodyCanvas, rx, startY, NOTE_RADIUS \* 2, Math\.max\(1, height\)\);',
'let bodyAlpha = 1.0;
          if (note.broken) {
              bodyAlpha = 0.3;
              ctx.filter = "grayscale(100%)";
          }
          ctx.globalAlpha = bodyAlpha;
          ctx.drawImage(preLNBodyCanvas, rx, startY, NOTE_RADIUS * 2, Math.max(1, height));
          ctx.globalAlpha = 1.0;
          ctx.filter = "none";'

# 8. LN Head Draw
$content = $content -replace '(?s)if \(!note\.hit\) \{\s*ctx\.drawImage\(preNoteCanvas, rx, headY - NOTE_RADIUS\);\s*\}',
'if (!note.headMissed && !note.hit) {
              let headAlpha = note.broken ? 0.3 : 1.0;
              ctx.globalAlpha = headAlpha;
              if (note.broken) ctx.filter = "grayscale(100%)";
              ctx.drawImage(preNoteCanvas, rx, headY - NOTE_RADIUS);
              ctx.globalAlpha = 1.0;
              ctx.filter = "none";
          }'

# 9. LN Tail Draw
$content = $content -replace '(?s)ctx\.drawImage\(preNoteCanvas, rx, tailY - NOTE_RADIUS\);',
'if (!note.tailMissed && !note.tailHit) {
              let tailAlpha = note.broken ? 0.3 : 1.0;
              ctx.globalAlpha = tailAlpha;
              if (note.broken) ctx.filter = "grayscale(100%)";
              ctx.drawImage(preNoteCanvas, rx, tailY - NOTE_RADIUS);
              ctx.globalAlpha = 1.0;
              ctx.filter = "none";
          }'

Set-Content -Path "main.js" -Value $content
Write-Host "Success"
