// Runs inside the extension's USER_SCRIPT world on youtube.com.
// The shell wraps this file as: (function (__RULES__) { <this file> })(<rules.json>);
// No chrome.* APIs are available here; everything comes from __RULES__.

// Stop a previous instance (happens when the shell hot-applies an update to an open tab).
try {
  if (globalThis.__ytAdSkipperStop) globalThis.__ytAdSkipperStop();
} catch (_) {}

const rules = __RULES__;
let timer = null;
let observer = null;
let styleEl = null;
let saved = null; // player state before an ad

// ---------- helpers ----------
const norm = (s) => (s || "").toLowerCase().replace(/[\s,.!?"'׳״־\-]/g, "");

const isVisible = (el) => {
  if (!el || !el.getBoundingClientRect) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none";
};

const sel = (arr) => (arr && arr.length ? arr.join(",") : null);

function clickIfExists(selector) {
  if (!selector) return false;
  for (const el of document.querySelectorAll(selector)) {
    if (isVisible(el)) {
      el.click();
      return true;
    }
  }
  return false;
}

// ---------- hide ad areas ----------
function applyHideStyle() {
  const s = sel(rules.hide);
  if (!s) return;
  styleEl = document.createElement("style");
  styleEl.id = "yt-ad-skipper-style";
  styleEl.textContent = `${s}{display:none !important;}`;
  (document.head || document.documentElement).appendChild(styleEl);
}

// ---------- video ads ----------
const getPlayer = () => document.querySelector(".html5-video-player");
const getVideo = (player) =>
  player.querySelector("video.html5-main-video") || player.querySelector("video");

function handleAd(player) {
  const video = getVideo(player);
  if (!video) return;

  if (!saved) saved = { muted: video.muted, rate: video.playbackRate };

  // 1. skip button
  if (clickIfExists(sel(rules.skipButtons))) return;

  // 2. unskippable: mute, speed up, jump to the end
  video.muted = true;
  try { video.playbackRate = 16; } catch (_) {}
  if (isFinite(video.duration) && video.duration > 0) {
    try { video.currentTime = video.duration; } catch (_) {}
  }
  if (video.paused) video.play().catch(() => {});
}

function restoreAfterAd(player) {
  if (!saved) return;
  const video = player && getVideo(player);
  if (video) {
    video.muted = saved.muted;
    try { video.playbackRate = saved.rate || 1; } catch (_) {}
  }
  saved = null;
}

// ---------- popups (Premium etc.) ----------
function dismissPopups() {
  const containerSel = sel(rules.popupContainers);
  if (!containerSel) return false;

  const triggers = (rules.popupTriggerText || []).map(norm);
  const dismissTexts = new Set((rules.dismissButtonText || []).map(norm));

  for (const c of document.querySelectorAll(containerSel)) {
    if (!isVisible(c)) continue;
    const text = norm(c.innerText || c.textContent);
    if (!triggers.some((k) => k && text.includes(k))) continue;

    const buttons = c.querySelectorAll("button, [role='button'], tp-yt-paper-button, a");
    for (const b of buttons) {
      if (!isVisible(b)) continue;
      const label = norm(b.innerText || b.textContent || b.getAttribute("aria-label"));
      if (label && dismissTexts.has(label)) {
        b.click();
        return true;
      }
    }
  }
  return false;
}

// ---------- main loop ----------
function tick() {
  const player = getPlayer();
  if (player && player.classList.contains("ad-showing")) {
    handleAd(player);
  } else {
    restoreAfterAd(player);
  }
  clickIfExists(sel(rules.overlayClose));
  dismissPopups();
}

function start() {
  applyHideStyle();
  timer = setInterval(tick, Math.max(100, rules.intervalMs || 200));
  observer = new MutationObserver(tick);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "opened"]
  });
  tick();
}

globalThis.__ytAdSkipperStop = () => {
  clearInterval(timer);
  if (observer) observer.disconnect();
  if (styleEl) styleEl.remove();
  restoreAfterAd(getPlayer());
};

if (document.documentElement) start();
else document.addEventListener("DOMContentLoaded", start, { once: true });
