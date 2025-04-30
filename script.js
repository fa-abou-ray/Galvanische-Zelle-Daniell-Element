//--------------------------------------------------
// 1) GRUNDSETUP
//--------------------------------------------------

const canvas = document.getElementById("myCanvas");
const ctx    = canvas.getContext("2d");
let   isRunning   = false;


/**
 * Metalle: name, potential, ionLabel, electronsNeeded
 */
const metals = [
    { name: "Zn", potential: -0.76, ionLabel: "Zn²⁺", electronsNeeded: 2 },
    { name: "Cu", potential:  0.34, ionLabel: "Cu²⁺", electronsNeeded: 2 },
    { name: "Ag", potential:  0.80, ionLabel: "Ag⁺",  electronsNeeded: 1 },
    { name: "Fe", potential: -0.44, ionLabel: "Fe²⁺", electronsNeeded: 2 },
    { name: "Mg", potential: -2.37, ionLabel: "Mg²⁺", electronsNeeded: 2 }
];

// Auswahl-Elemente
const leftSelect  = document.getElementById("leftElectrode");
const rightSelect = document.getElementById("rightElectrode");

// Fülle Selects
metals.forEach((m,i) => {
    const optL = document.createElement("option");
    optL.value = i;
    optL.textContent = `${m.name} (E°=${m.potential} V)`;
    leftSelect.appendChild(optL);

    const optR = document.createElement("option");
    optR.value = i;
    optR.textContent = `${m.name} (E°=${m.potential} V)`;
    rightSelect.appendChild(optR);
});

// Voreinstellung
leftSelect.value  = "0";  // Zn
rightSelect.value = "1";  // Cu

//--------------------------------------------------
// 2) GLOBALE EINSTELLUNGEN (dynamisch nach ΔE)
//--------------------------------------------------
// Basisspeed (wenn ΔE=0)
const baseElectronSpeedPath = 0.002;   // Δt pro Frame auf dem Draht (0-1 Skala)
const baseElectronSpeedPx   = 1.5;     // px pro Frame im "pursuit"-Modus

// Aktuelle Speed-Werte (werden in updateElectronSpeeds() neu gesetzt)
let electronSpeedPath = baseElectronSpeedPath;
let electronSpeedPx   = baseElectronSpeedPx;

let   speedFactor       = 1;       // wird live vom Slider geändert

/**
 * Setzt electronSpeedPath und electronSpeedPx basierend auf ΔE.
 * maxΔE nehmen wir hier als 3 V an (Mg vs Ag ≈3,17 V), passe bei Bedarf an.
 */
function updateElectronSpeeds() {
    const L = getMetal(leftSelect);
    const R = getMetal(rightSelect);
    const deltaE = Math.abs(R.potential - L.potential);
    const maxDE  = 3.0;
    // speedScale: von 0 (kein Unterschied) bis ~1 (maximaler Unterschied)
    const speedScale = Math.min(deltaE / maxDE, 1);

    // Lineares Mapping: von base… bis 2×base
    electronSpeedPath = baseElectronSpeedPath * (1 + speedScale);
    electronSpeedPx   = baseElectronSpeedPx   * (1 + speedScale);
}

//--------------------------------------------------
// 3) FUNKTIONEN
//--------------------------------------------------
function getMetal(sel) {
    return metals[parseInt(sel.value, 10)];
}

function getSolutionLabel(metalName) {
    return metalName === "Ag" ? "Ag₂SO₄-Lösung" : metalName + "SO₄-Lösung";
}

/** Anode=Ox, Kathode=Red (zweizeilig) */
function getAnodeCathodeLabels() {
    const L = getMetal(leftSelect);
    const R = getMetal(rightSelect);
    if (L.name === R.name) {
        return {
            leftMetal: L.name, rightMetal: R.name,
            leftLine1: "Error", leftLine2: "",
            rightLine1: "Error", rightLine2: ""
        };
    }
    if (L.potential < R.potential) {
        return {
            leftMetal: L.name, rightMetal: R.name,
            leftLine1: "Anode", leftLine2: "(Oxidation)",
            rightLine1: "Kathode", rightLine2: "(Reduktion)"
        };
    }
    return {
        leftMetal: L.name, rightMetal: R.name,
        leftLine1: "Kathode", leftLine2: "(Reduktion)",
        rightLine1: "Anode", rightLine2: "(Oxidation)"
    };
}

//--------------------------------------------------
// 4) ELEKTRONENPFAD
//--------------------------------------------------
let electronPath        = [];
let electronSegments    = [];
let electronTotalDist   = 0;
let electrons           = [];
let electronSpawnTimer  = 60;          // Frames bis nächstes e⁻
const electronRadius    = 7;

function updateElectronPath() {
    electrons = [];
    const L = getMetal(leftSelect);
    const R = getMetal(rightSelect);

    if (L.name === R.name) {
        electronPath     = [];
        electronSegments = [];
        electronTotalDist = 0;
        return;
    }
    // Pfad je nach Richtung
    if (L.potential < R.potential) {
        electronPath = [ {x:225,y:230},{x:225,y:90}, {x:575,y:90},{x:575,y:230} ];
    } else {
        electronPath = [ {x:575,y:230},{x:575,y:90}, {x:225,y:90},{x:225,y:230} ];
    }
    electronSegments  = [];
    electronTotalDist = 0;
    for (let i=0;i<electronPath.length-1;i++) {
        const dx = electronPath[i+1].x - electronPath[i].x;
        const dy = electronPath[i+1].y - electronPath[i].y;
        const dist = Math.hypot(dx,dy);
        electronSegments.push(dist);
        electronTotalDist += dist;
    }
}

function getElectronPos(t, offset = 0) {
    if (electronPath.length < 2) return {x:0, y:0};
    let dist = t * electronTotalDist;
    for (let i=0;i<electronSegments.length;i++) {
        if (dist <= electronSegments[i]) {
            const ratio = dist / electronSegments[i];
            const {x:x1, y:y1} = electronPath[i];
            const {x:x2, y:y2} = electronPath[i+1];
            let x = x1 + (x2 - x1) * ratio;
            let y = y1 + (y2 - y1) * ratio;
            if (offset>0) x += offset * 12;   // einfache x-Versetzung
            return {x,y};
        }
        dist -= electronSegments[i];
    }
    return electronPath[electronPath.length-1];
}

function spawnElectron(eIndex = 0) {
    if (electronPath.length < 2) return;
    const {x,y} = getElectronPos(0, eIndex);
    electrons.push({
        state  : 'path',   // 'path' → Draht, 'pursuit' → Ion
        t      : 0,
        offset : eIndex,
        x, y,
        done   : false
    });
}

function moveElectrons() {
    for (const e of electrons) {
        if (e.done) continue;

        if (e.state === 'path') {
            e.t += electronSpeedPath * speedFactor;
            if (e.t >= 1) { e.t = 1; e.state = 'pursuit'; }
            const pos = getElectronPos(e.t, e.offset);
            e.x = pos.x; e.y = pos.y;
        }
        else if (e.state === 'pursuit') {
            if (cathodeParticles.length === 0) { e.done = true; continue; }
            const target = cathodeParticles[0];
            const dx = target.x - e.x;
            const dy = target.y - e.y;
            const d  = Math.hypot(dx,dy);
            if (d > electronRadius + ionRadius) {
                e.x += (dx / d) * electronSpeedPx * speedFactor;
                e.y  = Math.min(e.y + (dy / d) * electronSpeedPx * speedFactor, 260);
            } else {
                e.done = true;
            }
        }
    }
}

//--------------------------------------------------
// 5) ANODE: METALL → ION
//--------------------------------------------------
const metalRadius = 14;
const ionRadius   = 14;

let anodeParticles = [];
function spawnAtAnode() {
    const L = getMetal(leftSelect);
    const R = getMetal(rightSelect);
    if (L.name === R.name) return;

    let side = "left", m = L;
    if (L.potential > R.potential) { side = "right"; m = R; }

    const ex = side === "left" ? 225 : 575;
    const ey = 230;
    anodeParticles.push({
        x: ex,
        y: ey,
        side,
        metalName      : m.name,
        ionLabel       : m.ionLabel,
        electronsNeeded: m.electronsNeeded,
        turnedToIon    : false,
        eSpawned       : false,
        vx: (Math.random()-0.5) * 0.2,
        vy: 0.2 + Math.random()*0.15
    });
}

function updateAnodeParticles() {
    for (const p of anodeParticles) {
        p.x += p.vx * speedFactor;
        p.y += p.vy * speedFactor;
        const ex = p.side === "left" ? 225 : 575;
        const ey = 230;
        const dist = Math.hypot(p.x - ex, p.y - ey);
        if (!p.turnedToIon && dist > 20) p.turnedToIon = true;
        if (p.turnedToIon && !p.eSpawned) {
            for (let i=0;i<p.electronsNeeded;i++) spawnElectron(i);
            p.eSpawned = true;
        }
        if (p.turnedToIon && p.y > 400) {
            solutionIons.push({x:p.x, y:p.y, label:p.ionLabel});
            p.removeMe = true;
        }
    }
    anodeParticles = anodeParticles.filter(p => !p.removeMe);
}

//--------------------------------------------------
// 6) KATHODE: ION → METALL
//--------------------------------------------------
function getDepositPosition(ex, ey, maxY = 260) {
    const minDist  = metalRadius * 2 + 1;   // Mindestabstand Kugel-zu-Kugel
    let   ringR    = metalRadius * 2;       // Start-Ring um die Elektrode
    const ringStep = metalRadius * 0.5;     // wie stark der Suchring wächst
    const maxTries = 50;                    // Sicherheits-Limit

    for (let t = 0; t < maxTries; t++) {
        const a = Math.random() * Math.PI * 2;      // zufälliger Winkel
        const x = ex + Math.cos(a) * ringR;
        const y = ey + Math.sin(a) * ringR;

        if (y > maxY) continue;                      // nicht in die Lösung fallen

        let ok = true;
        for (const m of metalOnElectrode) {
            if (Math.hypot(m.x - x, m.y - y) < minDist) { ok = false; break; }
        }
        if (ok) return {x, y};

        // nach jeweils 8 Versuchen den Ringradius etwas vergrößern
        if (t % 8 === 7) ringR += ringStep;
    }
    // Fallback: wenn alles voll ist, einfach darunter stapeln
    return {x: ex, y: ey + metalRadius * 3};
}
let cathodeParticles = [];

function randomCathodePos(side) {
    if (side === "left") return {startX:150+Math.random()*150, startY:200+Math.random()*200};
    return {startX:500+Math.random()*150, startY:200+Math.random()*200};
}

function spawnAtCathode() {
    const L = getMetal(leftSelect);
    const R = getMetal(rightSelect);
    if (L.name === R.name) return;

    let side = "left", m = L;
    if (L.potential < R.potential) { side="right"; m = R; }

    const pushIon = () => {
        const {startX,startY} = randomCathodePos(side);
        cathodeParticles.push({
            x:startX, y:startY, side,
            ionLabel : m.ionLabel,
            metalName: m.name,
            electronsNeeded  : m.electronsNeeded,
            capturedElectrons: 0,
            hasMetal         : false
        });
    };
    if (m.name === "Ag") {
        pushIon(); pushIon();
    } else {
        pushIon();
    }
}

function updateCathodeParticles() {
    for (let i=cathodeParticles.length-1;i>=0;i--) {
        const c = cathodeParticles[i];
        const ex = c.side === "left" ? 225 : 575;
        const ey = 230;
        const dx = ex - c.x;
        const dy = ey - c.y;
        const dist = Math.hypot(dx,dy);
        if (dist>1) {
            c.x += (dx/dist)*0.15*speedFactor;
            c.y += (dy/dist)*0.15*speedFactor;
        }
        // Elektronen‑Kollision
        for (let j=electrons.length-1;j>=0;j--) {
            const e = electrons[j];
            if (e.done) continue;
            const dxE = e.x - c.x;
            const dyE = e.y - c.y;
            const dd  = Math.hypot(dxE,dyE);
            if (dd < electronRadius + ionRadius) {
                electrons.splice(j,1);
                // Metall‑Ablagerung
                const pos = getDepositPosition(ex, ey);          // ← neue, sichere Position
metalOnElectrode.push({x: pos.x, y: pos.y, label: c.metalName});

                cathodeParticles.splice(i,1);
                break;
            }
        }
    }
    electrons = electrons.filter(e=>!e.done);
}

//--------------------------------------------------
// 7) LÖSUNG & ABLAGERUNGEN
//--------------------------------------------------
let solutionIons      = [];
let metalOnElectrode  = [];

function updateSolutionIons() {
    for (const i of solutionIons) {
        i.x += (Math.random()-0.5)*0.2*speedFactor;
        i.y += (Math.random()-0.5)*0.2*speedFactor;
    }
}

//--------------------------------------------------
// 8) VOLTMETER (LIVE) --------------------------------
//--------------------------------------------------
function drawVoltmeter() {
    // Kreis wurde schon von drawStaticScene gemalt – hier überschreiben
    const L = getMetal(leftSelect);
    const R = getMetal(rightSelect);
    let deltaE = R.potential - L.potential;
    if (L.name === R.name) deltaE = 0;

    ctx.beginPath();
    ctx.arc(400, 90, 20, 0, 2*Math.PI);
    ctx.fillStyle = "blue";
    ctx.fill();
    ctx.closePath();

    ctx.fillStyle = "white";
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(deltaE.toFixed(2) + " V", 400, 90);
}

//--------------------------------------------------
// 9) ANIMATION
//--------------------------------------------------
let spawnTimerOxRed = 600;

function animate() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawStaticScene();

    if (isRunning) {
        electronSpawnTimer -= speedFactor;
        if (electronSpawnTimer <= 0) {
            electronSpawnTimer = 60;
        }
        moveElectrons();
    }
    drawElectrons();

    if (isRunning) {
        spawnTimerOxRed -= speedFactor;
        if (spawnTimerOxRed <= 0) {
            spawnAtAnode();
            spawnAtCathode();
            spawnTimerOxRed = 600;
        }
        updateAnodeParticles();
        updateCathodeParticles();
        updateSolutionIons();
    }
    drawOxRed();
    drawVoltmeter();   //  Live‑Anzeige

    if (isRunning) requestAnimationFrame(animate);
}

//--------------------------------------------------
// 10) ZEICHNUNG – bewegliche Teile
//--------------------------------------------------
function drawElectrons() {
    for (const e of electrons) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, electronRadius, 0, 2*Math.PI);
        ctx.fillStyle = "blue";
        ctx.fill();
        ctx.closePath();

        ctx.font = "10px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("e⁻", e.x, e.y);
    }
}

function drawOxRed() {
    // Anode‑Partikel
    for (const p of anodeParticles) {
        ctx.beginPath();
        const r = p.turnedToIon ? ionRadius : metalRadius;
        ctx.arc(p.x, p.y, r, 0, 2*Math.PI);
        ctx.fillStyle = p.turnedToIon ? (p.side==="left"?"#d2b48c":"lightblue") : "lightgray";
        ctx.fill();
        ctx.closePath();
        ctx.font = "12px Arial";
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.turnedToIon ? p.ionLabel : p.metalName, p.x, p.y);
    }
    // Kathode‑Partikel
    for (const c of cathodeParticles) {
        ctx.beginPath();
        const r = !c.hasMetal ? ionRadius : metalRadius;
        ctx.arc(c.x, c.y, r, 0, 2*Math.PI);
        ctx.fillStyle = !c.hasMetal ? "lightblue" : "lightgray";
        ctx.fill();
        ctx.closePath();
        ctx.font = "12px Arial";
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(!c.hasMetal ? c.ionLabel : c.metalName, c.x, c.y);
    }
    // Ionen in Lösung
    for (const i of solutionIons) {
        ctx.beginPath();
        ctx.arc(i.x, i.y, ionRadius, 0, 2*Math.PI);
        ctx.fillStyle = i.x < 350 ? "#d2b48c" : "lightblue";
        ctx.fill();
        ctx.closePath();
        ctx.font = "12px Arial";
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(i.label, i.x, i.y);
    }
    // Metall‑Ablagerungen
    for (const m of metalOnElectrode) {
        ctx.beginPath();
        ctx.arc(m.x, m.y, metalRadius, 0, 2*Math.PI);
        ctx.fillStyle = "lightgray";
        ctx.fill();
        ctx.closePath();
        ctx.font = "12px Arial";
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.label, m.x, m.y);
    }
}

//--------------------------------------------------
// 11) STATISCHE SZENE
//--------------------------------------------------
function drawStaticScene() {
    const {leftMetal,rightMetal,leftLine1,leftLine2,rightLine1,rightLine2} = getAnodeCathodeLabels();

    // Überschrift
    ctx.font = "24px Arial";
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.fillText("Galvanische Zelle: Daniell‑Element", canvas.width/2, 35);

    // Bechergläser
    drawBeaker(100,150,250,300);
    drawBeaker(450,150,250,300);

    // Flüssigkeit
    drawLiquid(100,150,250,300,0.8,"#add8e6");
    drawLiquid(450,150,250,300,0.8,"#87cefa");

    ctx.font = "16px Arial";
    ctx.fillStyle = "black";
    ctx.textAlign = "left";
    ctx.fillText(getSolutionLabel(leftMetal),  110, 430);
    ctx.fillText(getSolutionLabel(rightMetal), 460, 430);

    // Elektroden
    drawRotatedInnerRect(225,230,220,80,90,"brown");
    drawRotatedInnerRect(575,230,220,80,90,"darkgray");

    // Metallsymbole
    ctx.save();
    ctx.font = "18px Arial";
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${leftMetal}`,  160, 115);
    ctx.fillText(`${rightMetal}`, 640, 115);
    ctx.restore();

    // Anode / Kathode‑Label
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(leftLine1,  40, 280);
    ctx.fillText(leftLine2,  40, 310);
    ctx.fillText(rightLine1, 760, 280);
    ctx.fillText(rightLine2, 760, 310);

    // Salzbrücke
    ctx.beginPath();
    ctx.strokeStyle = "gray";
    ctx.lineWidth = 5;
    ctx.moveTo(340, 320);
    ctx.lineTo(340, 130);
    ctx.lineTo(460, 130);
    ctx.lineTo(460, 320);
    ctx.stroke();
    ctx.closePath();
    ctx.font = "20px Arial";
    ctx.fillStyle = "black";
    ctx.fillText("Salzbrücke", 400, 160);

    // Draht & Voltmeter‑Grundform
    ctx.beginPath();
    ctx.moveTo(225, 120);
    ctx.lineTo(225, 90);
    ctx.lineTo(575, 90);
    ctx.lineTo(575, 120);
    ctx.strokeStyle = "gray";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.closePath();

    ctx.beginPath();
    ctx.arc(400, 90, 20, 0, 2*Math.PI);
    ctx.fillStyle = "blue";
    ctx.fill();
    ctx.closePath();

    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("V", 400, 90);

    // Unterschrift
    ctx.font = "12px Arial";
    ctx.fillStyle = "black";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Erstellt von Farah Abou‑Raya ©", 10, canvas.height-10);
}
/* ────────────────────────────────────────────── */
/* Reaktionsgleichungs-Checker                   */
/* ────────────────────────────────────────────── */
function supersToAscii(str){
    return str
      .replace(/²/g,"2").replace(/³/g,"3")
      .replace(/⁴/g,"4").replace(/⁵/g,"5")
      .replace(/⁶/g,"6").replace(/⁷/g,"7")
      .replace(/⁸/g,"8").replace(/⁹/g,"9")
      .replace(/⁺/g,"+").replace(/⁻/g,"-")
      .replace(/\s+/g,"").toLowerCase();
  }
  function buildExpectedHalf(eqType){          // "ox" oder "red"
    const L=getMetal(leftSelect), R=getMetal(rightSelect);
    const isOx = L.potential < R.potential;    // links = Anode?
    const mOx  = isOx ? L : R;                 // Metall, das oxidiert
    const mRed = isOx ? R : L;                 // Metall, das reduziert
  
    const ionOx  = mOx.ionLabel.replace(/²⁺/,"2+").replace(/⁺/,"+");
    const ionRed = mRed.ionLabel.replace(/²⁺/,"2+").replace(/⁺/,"+");
  
    if(eqType==="ox"){
      // z.B. "Zn->Zn2++2e-"
      return `${mOx.name}->${ionOx}+${mOx.electronsNeeded}e-`;
    }
    // Reduktion: "Cu2++2e-->Cu"
    return `${ionRed}+${mRed.electronsNeeded}e-->${mRed.name}`;
  }
  function checkEquations(){
    const icon = document.getElementById("resultIcon");
    const oxIn = supersToAscii(document.getElementById("oxidInput").value);
    const rdIn = supersToAscii(document.getElementById("redInput").value);
  
    const oxOk = oxIn === supersToAscii(buildExpectedHalf("ox"));
    const rdOk = rdIn === supersToAscii(buildExpectedHalf("red"));
  
    if(oxOk && rdOk){
      icon.style.background="#25c725";   // grün
      icon.title = "Alles korrekt!";
    }else{
      icon.style.background="#d32222";   // rot
      icon.title = "Mindestens eine Gleichung ist falsch.";
    }
  }
  
//--------------------------------------------------
// 12) START / STOP / RESET
//--------------------------------------------------
document.getElementById("startSimulation").addEventListener("click", () => {
    if (!isRunning) { isRunning = true; animate(); }
});
document.getElementById("stopSimulation").addEventListener("click", () => { isRunning = false; });
document.getElementById("resetButton").addEventListener("click", () => { isRunning = false; resetAll(); });
leftSelect .addEventListener("change", resetAll);
rightSelect.addEventListener("change", resetAll);

function resetAll() {
    electrons = [];
    anodeParticles = [];
    cathodeParticles = [];
    solutionIons = [];
    metalOnElectrode = [];

    spawnTimerOxRed = 80;
    electronSpawnTimer = 60;

    updateElectronPath();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawStaticScene();
    drawVoltmeter();
}

//--------------------------------------------------
// 13) SLIDER (DOM‑Binding)
//--------------------------------------------------
// ----------------------------------------------
// ----------------------------------------------
// Geschwindigkeits-Slider verknüpfen
// ----------------------------------------------
const speedSlider = document.getElementById("speedSlider");
const speedValue  = document.getElementById("speedValue");

speedSlider.addEventListener("input", () => {
  speedFactor = parseFloat(speedSlider.value);           // globale Variable
  speedValue.textContent = speedFactor.toFixed(1) + "×"; // Live-Anzeige
});



//--------------------------------------------------
// 14) INIT
//--------------------------------------------------
resetAll();
drawStaticScene();
drawVoltmeter();

//--------------------------------------------------
// 15) ZEICHEN‑HILFSFUNKTIONEN
//--------------------------------------------------
function drawBeaker(x,y,w,h) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y+h);
    ctx.lineTo(x+w, y+h);
    ctx.lineTo(x+w, y);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.closePath();
}

function drawLiquid(x,y,w,h,f,color) {
    const fillH = h*f;
    ctx.fillStyle = color;
    ctx.fillRect(x, y+h-fillH, w, fillH);
}

function drawRotatedInnerRect(cx,cy,w,h,angle,color) {
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(angle*Math.PI/180);
    ctx.fillStyle = color;
    ctx.fillRect(-w/2, -h/2, w, h);
    ctx.restore();
}

// ─── Gleichungs-Checker ─────────────────────────
document.getElementById("checkBtn").addEventListener("click", checkEquations);

// Bei Metall-Wechsel Eingabefelder & Anzeige zurücksetzen
[leftSelect, rightSelect].forEach(sel=>{
  sel.addEventListener("change", ()=>{
    document.getElementById("oxidInput").value="";
    document.getElementById("redInput").value ="";
    const icon=document.getElementById("resultIcon");
    icon.style.background="#ccc"; icon.title="";
  });
});






























































































