import document from "document";
import { vibration } from "haptics";
import { HeartRateSensor } from "heart-rate";
import { display } from "display";
import { me } from "appbit";
import exercise from "exercise";
import clock from "clock";
import { gettext } from "i18n";

const SCREEN_WIDTH = 336;

// UI Elements
const labelA = document.getElementById("labelA");
const labelB = document.getElementById("labelB");
const setsLabel = document.getElementById("setsScore");
const hrLabel = document.getElementById("hrLabel");
const btnA = document.getElementById("btnTeamA");
const btnB = document.getElementById("btnTeamB");
const btnUndo = document.getElementById("btnUndo");
const btnToggleStats = document.getElementById("btnToggleStats");
const pauseOverlay = document.getElementById("pauseOverlay");
const pauseTime = document.getElementById("pauseTime");
const pauseKcal = document.getElementById("pauseKcal");
const btnResume = document.getElementById("groupResume");
const btnFinish = document.getElementById("groupFinish");
const txtResume = document.getElementById("txtResume");
const txtFinish = document.getElementById("txtFinish");
let showHR = true; // We start by showing BPM
let currentHR = "--";
let activeSession = false;

if (txtResume) txtResume.text = `${gettext("resume_btn")}`;
if (txtFinish) txtFinish.text = `${gettext("finish_btn")}`;

const figures = [
  document.getElementById("pA_left"),  // 2
  document.getElementById("pA_right"), // 1
  document.getElementById("pB_right"), // 0
  document.getElementById("pB_left")   // 3
];

// References to buttons of the players
const btnP = [
  document.getElementById("btnP0"),
  document.getElementById("btnP1"),
  document.getElementById("btnP2"),
  document.getElementById("btnP3")
];

// Game State
let scoreA = 0, scoreB = 0, gamesA = 0, gamesB = 0;
let currentServer = 0;
const pointsDesc = ["0", "15", "30", "40"];

// Array to save the last 10 states (Undo)
let history = [];

function saveState() {
  history.push({
    sA: scoreA,
    sB: scoreB,
    gA: gamesA,
    gB: gamesB,
    srv: currentServer
  });
  if (history.length > 10) history.shift();
}

function updateDisplay() {
  labelA.text = pointsDesc[scoreA];
  labelB.text = pointsDesc[scoreB];
  setsLabel.text = `${gamesA} - ${gamesB}`;
  
  figures.forEach((b, idx) => {
    b.style.fill = (idx === currentServer) ? "fb-yellow" : "white";
  });
}

function score(team) {
  // If we didn't select a server different from the default, session was not started. Start it at first point
  if(!activeSession) {
    startSession();
  }

  saveState(); // Saves the state BEFORE the point
  vibration.start("bump");

  if (team === 'A') {
    if (scoreA === 3) { // Wins Game
      scoreA = 0; scoreB = 0; gamesA++;
      currentServer = (currentServer + 1) % 4;
      vibration.start("nudge-max");
    } else {
      scoreA++;
      vibration.start("bump");
    }
  } else {
    if (scoreB === 3) { // Wins Game
      scoreA = 0; scoreB = 0; gamesB++;
      currentServer = (currentServer + 1) % 4;
      vibration.start("nudge-max");
    } else {
      scoreB++;
      vibration.start("bump");
    }
  }
  updateDisplay();
}

// Select server manually
function selectServer(idx) {
  // Only allowed if game is at the beggining
  if (scoreA === 0 && scoreB === 0 && gamesA === 0 && gamesB === 0) {
    currentServer = idx;
    startSession();
    vibration.start("bump");
    updateDisplay();
    console.log("Initial server defined: " + idx);
  }
}

// Attach events to the figures
btnP.forEach((btn, index) => {
  btn.onclick = () => selectServer(index);
});

// --- EVENTS ---
btnA.onclick = () => score('A');
btnB.onclick = () => score('B');

// Undo featuring a Long Press for a Total Reset
let undoTimer = 0;
btnUndo.onmousedown = () => { undoTimer = Date.now(); };
btnUndo.onmouseup = () => {
  if (undoTimer === 0) return; // Prevents ghost triggers

  let pressDuration = Date.now() - undoTimer;
  
  if (pressDuration > 1500) { // Total Reset (1.5s)
    scoreA = 0; scoreB = 0; gamesA = 0; gamesB = 0; currentServer = 0;
    history = [];
    vibration.start("confirmation");
  } else { // Simple Undo
    if (history.length > 0) {
      let prev = history.pop();
      scoreA = prev.sA; scoreB = prev.sB;
      gamesA = prev.gA; gamesB = prev.gB;
      currentServer = prev.srv;
      vibration.start("bump");
    } else {
      vibration.start("nudge");
    }
  }
  updateDisplay();
};

// Clock Settings
clock.granularity = "minutes"; // Updates every minute
// --- SENSORS LOGIC (HRM) ---
if (HeartRateSensor && me.permissions.granted("access_heart_rate")) {
  const hrm = new HeartRateSensor({ frequency: 1 });
  hrm.addEventListener("reading", () => {
    currentHR = hrm.heartRate;
    if (showHR) hrLabel.text = `${currentHR}`; // Only updates the label if showing the BPM (instead of clock)
  });
  
  // Disable BPM if display is off
  display.addEventListener("change", () => {
    if (display.on) {
      if (hrm) hrm.start();
      updateDisplay();
    } else {
      if (hrm) hrm.stop();
    }
  });
  hrm.start();
}

// --- CLOCK LOGIC ---
clock.ontick = (evt) => {
  if (!showHR) {
    let hours = evt.date.getHours();
    let mins = evt.date.getMinutes();
    if (mins < 10) mins = `0${mins}`;
    hrLabel.text = `${hours}:${mins}`;
  }
};

// --- ALTERNATE CLICKING ---
btnToggleStats.onclick = () => {
  vibration.start("bump");
  showHR = !showHR; // Alternates the state
  
  if (showHR) {
    hrLabel.text = `${currentHR}`;
    hrLabel.style.fill = "fb-red"; // Red for BPM
  } else {
    // Forces imediate clock update when clicking
    const now = new Date();
    let h = now.getHours();
    let m = now.getMinutes();
    hrLabel.text = `${h}:${(m < 10 ? "0" + m : m)}`;
    hrLabel.style.fill = "fb-white"; // White for Time
  }
};

function startSession() {
  if (me.permissions.granted("access_activity") && exercise && !activeSession) {
    try {
      // We use "tennis" as the closest profile available in the SDK
      exercise.start("tennis", {
        gps: false
      });
      activeSession = true;
      console.log("Padel tracking started!");
      vibration.start("nudge-max");
    } catch (e) {
      console.log("Error starting: " + e);
    }
  }
}

function finishSession() {
  if (exercise && exercise.state !== "stopped") {
    exercise.stop();
  }
  
  activeSession = false;
  console.log("Game saved in the history.");
}

// Capture physical button (BACK)
document.onkeypress = (evt) => {
if (evt.key === "back") {
    // 1. Prevent imediate exit
    evt.preventDefault();

    // 2. Check if the menus is already visible
    if (pauseOverlay && pauseOverlay.style.display !== "inline") {
      openPauseMenu();
    } else if (pauseOverlay) {
      // If clicking on BACK with menu open, we close the menu (Resume)
      vibration.start("bump");
      resume();
    }
  }
};

function openPauseMenu() {
  pauseOverlay.style.display = "inline";

  if (exercise && exercise.stats) {
    exercise.pause();
    const stats = exercise.stats;
    pauseKcal.text = `${stats.calories || 0} kcal`;
    
    let totalMS = stats.activeTime || 0;
    let s = Math.floor((totalMS / 1000) % 60);
    let m = Math.floor((totalMS / 60000) % 60);
    let h = Math.floor(totalMS / 3600000);
    pauseTime.text = `${h}:${m < 10 ? "0"+m : m}:${s < 10 ? "0"+s : s}`;
  } else {
    pauseKcal.text = "0 kcal";
    pauseTime.text = "00:00:00";
  }
}

function resume() {
  if (exercise && exercise.state === "paused") {
    exercise.resume();
  }
  pauseOverlay.style.display = "none";
}

// Menu buttons actions
btnResume.onclick = () => {
  vibration.start("bump");
  resume();
};

btnFinish.onclick = () => {
  vibration.start("confirmation");

  finishSession(); 
  // Close the app
  me.exit(); 
};

updateDisplay();