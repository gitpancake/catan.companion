import type { GameState } from "colonist-io-api";
import { renderOverlay } from "./render";

let overlayEl: HTMLElement | null = null;
let collapsed = false;
let resetCallback: (() => void) | null = null;

// Drag state
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

export function setOnReset(cb: () => void): void {
  resetCallback = cb;
}

export function createOverlay(): HTMLElement {
  // Check if overlay exists AND is still connected to the DOM
  if (overlayEl && document.contains(overlayEl)) return overlayEl;

  overlayEl = document.createElement("div");
  overlayEl.className = "catan-companion-overlay";

  // Build header
  const header = document.createElement("div");
  header.className = "catan-companion-header";

  const title = document.createElement("span");
  title.textContent = "catan.";
  header.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "catan-companion-header-actions";

  const resetBtn = document.createElement("button");
  resetBtn.className = "catan-companion-reset";
  resetBtn.title = "Reset scores";
  resetBtn.textContent = "\u21BA"; // ↺
  resetBtn.addEventListener("click", () => {
    if (resetCallback) resetCallback();
  });
  actions.appendChild(resetBtn);

  const toggle = document.createElement("button");
  toggle.className = "catan-companion-toggle";
  toggle.textContent = "\u2212"; // −

  const body = document.createElement("div");
  body.className = "catan-companion-body";

  const waiting = document.createElement("p");
  waiting.style.cssText = "color:#71717a;text-align:center;padding:8px 0;";
  waiting.textContent = "Waiting for game data...";
  body.appendChild(waiting);

  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    body.classList.toggle("collapsed", collapsed);
    toggle.textContent = collapsed ? "+" : "\u2212";
  });
  actions.appendChild(toggle);
  header.appendChild(actions);

  overlayEl.appendChild(header);
  overlayEl.appendChild(body);

  // Drag functionality
  header.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    isDragging = true;
    const rect = overlayEl!.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging || !overlayEl) return;
    overlayEl.style.left = `${e.clientX - dragOffsetX}px`;
    overlayEl.style.top = `${e.clientY - dragOffsetY}px`;
    overlayEl.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  document.body.appendChild(overlayEl);
  return overlayEl;
}

export function updateOverlay(state: GameState): void {
  if (!overlayEl) return;
  renderOverlay(overlayEl, state);
}
