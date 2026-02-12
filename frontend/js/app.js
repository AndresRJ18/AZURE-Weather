/**
 * Azure Weather Dashboard – app.js
 * Handles: dark-mode toggle, search, fetch, render.
 *
 * The Azure Static Web Apps runtime proxies /api/* to the linked
 * Function App automatically, so no absolute URL is needed.
 */

// ── DOM refs ──────────────────────────────────────────────────────────────────
const body          = document.getElementById("body");
const themeToggle   = document.getElementById("themeToggle");
const themeLabel    = document.getElementById("themeLabel");
const cityInput     = document.getElementById("cityInput");
const searchBtn     = document.getElementById("searchBtn");
const errorMsg      = document.getElementById("errorMsg");
const loader        = document.getElementById("loader");
const currentCard   = document.getElementById("currentCard");
const forecastSect  = document.getElementById("forecastSection");
const forecastGrid  = document.getElementById("forecastGrid");

// Current-weather inner elements
const cityName      = document.getElementById("cityName");
const currentDesc   = document.getElementById("currentDesc");
const currentTemp   = document.getElementById("currentTemp");
const currentIcon   = document.getElementById("currentIcon");
const feelsLike     = document.getElementById("feelsLike");
const humidity      = document.getElementById("humidity");
const wind          = document.getElementById("wind");

// ── API endpoint (relative → works locally and on SWA) ───────────────────────
const API_BASE = "/api/weather";

// ── Dark mode ─────────────────────────────────────────────────────────────────
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  body.className = body.className
    .replace(/bg-scene-(dark|light)/, `bg-scene-${dark ? "dark" : "light"}`)
    .replace(/text-(slate-100|slate-800)/, `text-${dark ? "slate-100" : "slate-800"}`);
  themeLabel.textContent = dark ? "Light mode" : "Dark mode";
  localStorage.setItem("theme", dark ? "dark" : "light");
}

// Restore preference on load
const savedTheme = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(savedTheme ? savedTheme === "dark" : prefersDark);

themeToggle.addEventListener("click", () => {
  applyTheme(!document.documentElement.classList.contains("dark"));
});

// ── Utility helpers ───────────────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove("hidden");
}

function clearError() {
  errorMsg.classList.add("hidden");
  errorMsg.textContent = "";
}

function setLoading(on) {
  loader.classList.toggle("hidden", !on);
  searchBtn.disabled = on;
}

function iconUrl(code) {
  return `https://openweathermap.org/img/wn/${code}@2x.png`;
}

/** Format "2025-07-18" → "Fri 18" */
function fmtDate(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

// ── Render functions ──────────────────────────────────────────────────────────
function renderCurrent(data) {
  const { city, country, now } = data;

  cityName.textContent    = `${city}, ${country}`;
  currentDesc.textContent = now.desc;
  currentTemp.textContent = `${now.temp}°`;
  currentIcon.src         = iconUrl(now.icon);
  currentIcon.alt         = now.desc;
  feelsLike.textContent   = `${now.feels_like}°C`;
  humidity.textContent    = `${now.humidity}%`;
  wind.textContent        = `${now.wind} m/s`;

  currentCard.classList.remove("hidden");
  // Re-trigger animation
  currentCard.style.animation = "none";
  void currentCard.offsetWidth;
  currentCard.style.animation = "";
}

function renderForecast(forecast) {
  forecastGrid.innerHTML = "";

  forecast.forEach((day) => {
    const card = document.createElement("div");
    card.className = `forecast-card glass dark:glass rounded-xl p-4 text-center
      opacity-0 animate-fade-up dark:text-white text-slate-800`;

    card.innerHTML = `
      <p class="text-xs font-mono dark:text-slate-400 text-slate-500 mb-1">${fmtDate(day.date)}</p>
      <img src="${iconUrl(day.icon)}" alt="${day.desc}"
           class="w-10 h-10 mx-auto" />
      <p class="text-xs dark:text-slate-400 text-slate-500 mt-1 capitalize">${day.desc}</p>
      <div class="flex justify-center items-center gap-2 mt-2 text-sm font-semibold">
        <span class="text-sky-400">${day.max}°</span>
        <span class="dark:text-slate-500 text-slate-400 font-normal">/</span>
        <span class="dark:text-slate-400 text-slate-500 font-normal">${day.min}°</span>
      </div>
    `;
    forecastGrid.appendChild(card);
  });

  forecastSect.classList.remove("hidden");
}

// ── Fetch weather ─────────────────────────────────────────────────────────────
async function fetchWeather(city) {
  clearError();
  setLoading(true);
  currentCard.classList.add("hidden");
  forecastSect.classList.add("hidden");

  try {
    const res = await fetch(`${API_BASE}?city=${encodeURIComponent(city)}`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || `Error ${res.status}`);
      return;
    }

    renderCurrent(data);
    renderForecast(data.forecast);
  } catch (err) {
    console.error(err);
    showError("Network error – please check your connection.");
  } finally {
    setLoading(false);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
searchBtn.addEventListener("click", () => {
  const city = cityInput.value.trim();
  if (!city) {
    showError("Please enter a city name.");
    cityInput.focus();
    return;
  }
  fetchWeather(city);
});

cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchBtn.click();
});
