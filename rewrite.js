const fs = require('fs');
let code = fs.readFileSync('main.js', 'utf8');

// 1. replace keydown loop
const keydownRegex = /let best = null;[\s\S]*?if \(best\) \{[\s\S]*?hitNote\(best, bestDiff\);[\s\S]*?activeHits\[lane\] = 0\.15;[\s\S]*?if \(best\.endTime > best\.time\) \{[\s\S]*?best\.isBeingHeld = true;[\s\S]*?activeHolds\[lane\] = best;[\s\S]*?\}[\s\S]*?\}/;
const newKeydown = `let earliestNote = null;
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
      }`;
code = code.replace(keydownRegex, newKeydown);

// 2. replace keyup loop
const keyupRegex = /const diff = holdNote\.endTime - currentExactGameTime;[\s\S]*?if \(Math\.abs\(diff\) <= WINDOW_GOOD\) \{[\s\S]*?hitNoteRelease\(holdNote, diff\);[\s\S]*?\} else \{[\s\S]*?missNote\(holdNote\);[\s\S]*?\}/;
const newKeyup = `const diff = holdNote.endTime - currentExactGameTime;
          if (Math.abs(diff) <= MISS_WINDOW * 1.5) {
              hitNoteRelease(holdNote, diff);
          } else {
              breakHoldNote(holdNote);
          }`;
code = code.replace(keyupRegex, newKeyup);

// 3. update hitNote to handle LNs
code = code.replace(/if \(note\.endTime <= note\.time\) \{\s*totalNotesPassed\+\+;\s*totalNotesHit\+\+;\s*note\.active = false;\s*\}/, `if (!(note.endTime > note.time)) {
        totalNotesPassed++;
        totalNotesHit++;
        note.active = false;
    }`);

// 4. update hitNoteRelease to handle broken LNs scoring 50
const hitNoteReleaseRegex = /function hitNoteRelease\(note, diff\) \{[\s\S]*?setTimeout\(\(\) => \{ judgementEl\.style\.transform = 'translate\(-50%, -50%\) scale\(1\)'; \}, 50\);\n\}/;
const newHitNoteRelease = `function hitNoteRelease(note, diff) {
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
    
    let txt = 'GOOD';
    let cls = 'judgement-good';
    if (pnts === 300) { txt = 'PERFECT'; cls = 'judgement-perfect'; }
    else if (pnts === 200) { txt = 'GREAT'; cls = 'judgement-great'; }
    else if (pnts === 50) { txt = 'OKAY'; cls = 'judgement-bad'; }
    
    judgementEl.textContent = txt;
    judgementEl.className = cls;
    judgementEl.style.transform = 'translate(-50%, -50%) scale(1.1)';
    setTimeout(() => { judgementEl.style.transform = 'translate(-50%, -50%) scale(1)'; }, 50);
}`;
code = code.replace(hitNoteReleaseRegex, newHitNoteRelease);

// 5. update missNote to handle LN active state properly
const missNoteRegex = /function missNote\(note\) \{[\s\S]*?note\.active = false;[\s\S]*?\}\n\}/;
const newMissNote = `function missNote(note) {
    if (!note.isMissed) {
        note.isMissed = true;
        combo = 0;
        totalNotesPassed++;
        hp -= 10;
        
        hitErrors.push({ diff: 0, alpha: 1.0, miss: true });
        if (hitErrors.length > 40) hitErrors.shift();
        
        updateHUD();
        judgementEl.textContent = 'MISS';
        judgementEl.className = 'judgement-miss';
        judgementEl.style.transform = 'translate(-50%, -50%) scale(1.1)';
        setTimeout(() => { judgementEl.style.transform = 'translate(-50%, -50%) scale(1)'; }, 50);
        
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
}`;
code = code.replace(missNoteRegex, newMissNote);

// 6. checkMisses logic
const checkMissesRegex = /function checkMisses\(\) \{[\s\S]*?if \(!note\.hit\) \{[\s\S]*?const timeDiff = note\.time - gameTime;[\s\S]*?if \(timeDiff < -MISS_WINDOW\) \{[\s\S]*?missNote\(note\);[\s\S]*?\}[\s\S]*?\}[\s\S]*?\}/;
const newCheckMisses = `function checkMisses() {
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
    }`;
code = code.replace(checkMissesRegex, newCheckMisses);

// 7. draw logic (alpha / grayscale for broken notes)
const lnBodyRegex = /ctx\.drawImage\(preLNBodyCanvas, rx, startY, NOTE_RADIUS \* 2, Math\.max\(1, height\)\);/;
const newLnBody = `
          let bodyAlpha = 1.0;
          if (note.broken) {
              bodyAlpha = 0.3;
              ctx.filter = "grayscale(100%)";
          }
          ctx.globalAlpha = bodyAlpha;
          ctx.drawImage(preLNBodyCanvas, rx, startY, NOTE_RADIUS * 2, Math.max(1, height));
          ctx.globalAlpha = 1.0;
          ctx.filter = "none";`;
code = code.replace(lnBodyRegex, newLnBody);

const lnHeadRegex = /if \(!note\.hit\) \{\s*ctx\.drawImage\(preNoteCanvas, rx, headY - NOTE_RADIUS\);\s*\}/;
const newLnHead = `if (!note.headMissed && !note.hit) {
              let headAlpha = note.broken ? 0.3 : 1.0;
              ctx.globalAlpha = headAlpha;
              if (note.broken) ctx.filter = "grayscale(100%)";
              ctx.drawImage(preNoteCanvas, rx, headY - NOTE_RADIUS);
              ctx.globalAlpha = 1.0;
              ctx.filter = "none";
          }`;
code = code.replace(lnHeadRegex, newLnHead);

const lnTailRegex = /ctx\.drawImage\(preNoteCanvas, rx, tailY - NOTE_RADIUS\);/;
const newLnTail = `
          if (!note.tailMissed && !note.tailHit) {
              let tailAlpha = note.broken ? 0.3 : 1.0;
              ctx.globalAlpha = tailAlpha;
              if (note.broken) ctx.filter = "grayscale(100%)";
              ctx.drawImage(preNoteCanvas, rx, tailY - NOTE_RADIUS);
              ctx.globalAlpha = 1.0;
              ctx.filter = "none";
          }`;
code = code.replace(lnTailRegex, newLnTail);

fs.writeFileSync('main.js', code);
console.log('done');
