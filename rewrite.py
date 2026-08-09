import os
import re

with open('main.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. replace keydown loop
keydown_regex = r"let best = null;.*?if \(best\) \{.*?hitNote\(best, bestDiff\);.*?activeHits\[lane\] = 0\.15;.*?if \(best\.endTime > best\.time\) \{.*?best\.isBeingHeld = true;.*?activeHolds\[lane\] = best;.*?\}[\s\S]*?\}"
new_keydown = """let earliestNote = null;
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
      }"""
code = re.sub(keydown_regex, new_keydown, code, flags=re.DOTALL)

# 2. replace keyup loop
keyup_regex = r"const diff = holdNote\.endTime - currentExactGameTime;.*?if \(Math\.abs\(diff\) <= WINDOW_GOOD\) \{.*?hitNoteRelease\(holdNote, diff\);.*?\} else \{.*?missNote\(holdNote\);.*?\}"
new_keyup = """const diff = holdNote.endTime - currentExactGameTime;
          if (Math.abs(diff) <= MISS_WINDOW * 1.5) {
              hitNoteRelease(holdNote, diff);
          } else {
              breakHoldNote(holdNote);
          }"""
code = re.sub(keyup_regex, new_keyup, code, flags=re.DOTALL)

# 3. update hitNote to handle LNs
hitnote_replace_regex = r"if \(note\.endTime <= note\.time\) \{\s*totalNotesPassed\+\+;\s*totalNotesHit\+\+;\s*note\.active = false;\s*\}"
new_hitnote_replace = """if (!(note.endTime > note.time)) {
        totalNotesPassed++;
        totalNotesHit++;
        note.active = false;
    }"""
code = re.sub(hitnote_replace_regex, new_hitnote_replace, code)

# 4. update hitNoteRelease to handle broken LNs scoring 50
hitnoterelease_regex = r"function hitNoteRelease\(note, diff\) \{.*?setTimeout\(\(\) => \{ judgementEl\.style\.transform = 'translate\(-50%, -50%\) scale\(1\)'; \}, 50\);\n\}"
new_hitnoterelease = """function hitNoteRelease(note, diff) {
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
}"""
code = re.sub(hitnoterelease_regex, new_hitnoterelease, code, flags=re.DOTALL)

# 5. update missNote to handle LN active state properly
missnote_regex = r"function missNote\(note\) \{.*?note\.active = false;.*?\}\n\}"
new_missnote = """function missNote(note) {
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
}"""
code = re.sub(missnote_regex, new_missnote, code, flags=re.DOTALL)

# 6. checkMisses logic
checkmisses_regex = r"function checkMisses\(\) \{.*?if \(!note\.hit\) \{.*?const timeDiff = note\.time - gameTime;.*?if \(timeDiff < -MISS_WINDOW\) \{.*?missNote\(note\);.*?\}[\s\S]*?\}[\s\S]*?\}"
new_checkmisses = """function checkMisses() {
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
    }"""
code = re.sub(checkmisses_regex, new_checkmisses, code, flags=re.DOTALL)

# 7. draw logic (alpha / grayscale for broken notes)
lnbody_regex = r"ctx\.drawImage\(preLNBodyCanvas, rx, startY, NOTE_RADIUS \* 2, Math\.max\(1, height\)\);"
new_lnbody = """
          let bodyAlpha = 1.0;
          if (note.broken) {
              bodyAlpha = 0.3;
              ctx.filter = "grayscale(100%)";
          }
          ctx.globalAlpha = bodyAlpha;
          ctx.drawImage(preLNBodyCanvas, rx, startY, NOTE_RADIUS * 2, Math.max(1, height));
          ctx.globalAlpha = 1.0;
          ctx.filter = "none";"""
code = re.sub(lnbody_regex, new_lnbody, code)

lnhead_regex = r"if \(!note\.hit\) \{\s*ctx\.drawImage\(preNoteCanvas, rx, headY - NOTE_RADIUS\);\s*\}"
new_lnhead = """if (!note.headMissed && !note.hit) {
              let headAlpha = note.broken ? 0.3 : 1.0;
              ctx.globalAlpha = headAlpha;
              if (note.broken) ctx.filter = "grayscale(100%)";
              ctx.drawImage(preNoteCanvas, rx, headY - NOTE_RADIUS);
              ctx.globalAlpha = 1.0;
              ctx.filter = "none";
          }"""
code = re.sub(lnhead_regex, new_lnhead, code)

lntail_regex = r"ctx\.drawImage\(preNoteCanvas, rx, tailY - NOTE_RADIUS\);"
new_lntail = """
          if (!note.tailMissed && !note.tailHit) {
              let tailAlpha = note.broken ? 0.3 : 1.0;
              ctx.globalAlpha = tailAlpha;
              if (note.broken) ctx.filter = "grayscale(100%)";
              ctx.drawImage(preNoteCanvas, rx, tailY - NOTE_RADIUS);
              ctx.globalAlpha = 1.0;
              ctx.filter = "none";
          }"""
code = re.sub(lntail_regex, new_lntail, code)

with open('main.js', 'w', encoding='utf-8') as f:
    f.write(code)
print('done')
