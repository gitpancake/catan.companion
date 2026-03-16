import type { GameState } from "colonist-io-api";
import { renderOverlay } from "./render";

let overlayEl: HTMLElement | null = null;
let collapsed = false;

// Drag state
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

export function createOverlay(): HTMLElement {
  if (overlayEl) return overlayEl;

  overlayEl = document.createElement("div");
  overlayEl.className = "catan-companion-overlay";
  overlayEl.innerHTML = `
    <div class="catan-companion-header">
      <span>catan.</span>
      <button class="catan-companion-toggle">−</button>
    </div>
    <div class="catan-companion-body">
      <p style="color:#71717a;text-align:center;padding:8px 0;">Waiting for game data...</p>
    </div>
  `;

  // Toggle collapse
  const toggle = overlayEl.querySelector(".catan-companion-toggle")!;
  const body = overlayEl.querySelector(".catan-companion-body")!;
  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    body.classList.toggle("collapsed", collapsed);
    toggle.textContent = collapsed ? "+" : "−";
  });

  // Drag functionality
  const header = overlayEl.querySelector(".catan-companion-header")!;
  header.addEventListener("mousedown", (e) => {
    const evt = e as MouseEvent;
    isDragging = true;
    const rect = overlayEl!.getBoundingClientRect();
    dragOffsetX = evt.clientX - rect.left;
    dragOffsetY = evt.clientY - rect.top;
    evt.preventDefault();
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
