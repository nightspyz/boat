// The settings menu (Esc): volumes, boat speed, how fast time passes, and the weather.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

const SETTINGS_KEY = "coastline-settings-v1";
const settings = { master: 1, effects: 1, ambience: 1, music: 1, boatSpeed: 1, timeSpeed: 1, weather: "auto" };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
} catch (e) {
  // no saved settings
}
const saveSettings = () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {}
};
for (const k of ["master", "effects", "ambience", "music"]) sound.setVolume(k, settings[k]);

// Weather you can fix in place (weather.js): value 0 = clear … 0.95 = storm, plus fog
const WEATHER_PRESETS = {
  clear: { value: 0.05, fog: 0 },
  cloudy: { value: 0.35, fog: 0 },
  rain: { value: 0.6, fog: 0 },
  storm: { value: 0.95, fog: 0 },
  fog: { value: 0.1, fog: 1 },
};
const WEATHER_CHOICES = [
  ["auto", "🔄 Forecast"],
  ["clear", "☀️ Clear"],
  ["cloudy", "⛅ Cloudy"],
  ["rain", "🌧️ Rain"],
  ["storm", "⛈️ Storm"],
  ["fog", "🌫️ Fog"],
];
const TIME_SPEEDS = [0, 0.25, 0.5, 1, 2, 4];

const menuEl = document.getElementById("menu");
const menuPanel = menuEl.querySelector(".menu-panel");
let menuWasPaused = false;

function renderMenu() {
  const pct = (v) => `${Math.round(v * 100)}%`;
  const slider = (key, label, min, max, step, value, text) =>
    `<label class="menu-row"><span>${label}</span><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}"><b>${text}</b></label>`;
  const timeIdx = Math.max(0, TIME_SPEEDS.indexOf(settings.timeSpeed));
  const timeText = settings.timeSpeed === 0 ? "Stopped" : `${settings.timeSpeed}×`;
  menuPanel.innerHTML = `
    <h2>Paused</h2>
    <div class="menu-sub">Esc to resume · Coastline v${GAME_VERSION}</div>
    <h3>🔊 Sound</h3>
    ${slider("master", "Master volume", 0, 1, 0.05, settings.master, pct(settings.master))}
    ${slider("effects", "Sound effects", 0, 1, 0.05, settings.effects, pct(settings.effects))}
    ${slider("ambience", "Sea &amp; weather", 0, 1, 0.05, settings.ambience, pct(settings.ambience))}
    ${slider("music", "Music", 0, 1, 0.05, settings.music, pct(settings.music))}
    <h3>⛵ Game</h3>
    ${slider("boatSpeed", "Boat speed", 0.5, 2, 0.1, settings.boatSpeed, pct(settings.boatSpeed))}
    ${slider("timeSpeed", "Time of day speed", 0, TIME_SPEEDS.length - 1, 1, timeIdx, timeText)}
    <h3>☁️ Weather</h3>
    <div class="menu-weather">${WEATHER_CHOICES.map(
      ([id, label]) => `<button data-weather="${id}" class="${settings.weather === id ? "on" : ""}">${label}</button>`
    ).join("")}</div>
    <div class="menu-note">${
      settings.weather === "auto" ? "The weather follows each day's forecast." : "The weather stays like this until you choose Forecast again."
    }</div>
    <details class="menu-tips"><summary>📷 Tips for better photos</summary><ul>
      <li><b>Centre it.</b> The closer your subject is to the middle of the frame, the better the rating.</li>
      <li><b>Fill the frame.</b> Get closer, or zoom in (mouse wheel or + −). The telephoto lens zooms to 10×.</li>
      <li><b>Focus first.</b> Press R: when the bracket turns green, your subject is sharp.</li>
      <li><b>Hold still.</b> Slow the boat and stop swinging the camera as you shoot. In dim light shake shows more.</li>
      <li><b>Make the first one count.</b> Only your first photo of each subject pays: Excellent pays 1.8×, Poor only 0.35×.</li>
      <li><b>One subject at a time.</b> Rain, stars or fog only count when nothing else is near the middle.</li>
      <li><b>Right time, right weather.</b> Many subjects only show up at certain hours or in certain weather: the journal (J) lists the best conditions for each.</li>
      <li><b>Go up.</b> The drone (V) finds things you can't see from the water: the clifftop lake, the party, roads and villages.</li>
    </ul></details>
    <button class="menu-resume" data-act="resume">Resume</button>`;
}

function toggleMenu(show = menuEl.classList.contains("hidden")) {
  if (EDIT_MODE) return; // no pause menu in the world editor
  if (show === !menuEl.classList.contains("hidden")) return;
  if (show) {
    if (photo.active) photo.exit();
    menuWasPaused = state.paused;
    state.paused = true; // freeze the game while the menu is open
    renderMenu();
  } else {
    state.paused = menuWasPaused;
  }
  menuEl.classList.toggle("hidden", !show);
}

menuEl.addEventListener("input", (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  let v = Number(e.target.value);
  if (key === "timeSpeed") v = TIME_SPEEDS[v];
  settings[key] = v;
  if (["master", "effects", "ambience", "music"].includes(key)) sound.setVolume(key, v);
  const out = e.target.nextElementSibling;
  out.textContent = key === "timeSpeed" ? (v === 0 ? "Stopped" : `${v}×`) : `${Math.round(v * 100)}%`;
  saveSettings();
});
menuEl.addEventListener("click", (e) => {
  const w = e.target.closest("[data-weather]");
  if (w) {
    settings.weather = w.dataset.weather;
    saveSettings();
    renderMenu();
    return;
  }
  if (e.target.closest('[data-act="resume"]') || e.target === menuEl) toggleMenu(false);
});
menuEl.addEventListener("pointerdown", (e) => e.stopPropagation());

// Esc opens and closes the menu, unless it's closing something else first (camera, journal, map, gallery).
// Runs before the game's own key handling, so keys don't reach the game while the menu is open.
window.addEventListener(
  "keydown",
  (e) => {
    const open = !menuEl.classList.contains("hidden");
    if (e.code === "Escape" && !e.repeat) {
      const busy =
        photo.active ||
        !journalEl.classList.contains("hidden") ||
        !bigMapEl.classList.contains("hidden") ||
        !document.getElementById("gallery").classList.contains("hidden");
      if (open || !busy) {
        toggleMenu(!open);
        e.stopImmediatePropagation();
        e.preventDefault();
      }
      return;
    }
    if (open) {
      e.stopImmediatePropagation();
      if (e.code === "Space") e.preventDefault();
    }
  },
  true
);
