import { parseLogEntry, createGameState, applyEvent, type GameState } from "colonist-io-api";
import { createOverlay, updateOverlay } from "../overlay/index";

let state: GameState = createGameState();
const processedIndices = new Set<string>();

function processEntry(entry: Element): void {
  const index = entry.getAttribute("data-index");
  if (!index || processedIndices.has(index)) return;
  processedIndices.add(index);

  const event = parseLogEntry(entry);
  if (event) {
    applyEvent(state, event);
    updateOverlay(state);
  }
}

function scanContainer(container: Element): void {
  const entries = container.querySelectorAll("[data-index]");
  for (const entry of entries) {
    processEntry(entry);
  }
}

// Scroll through the entire virtualized log to load all entries.
// colonist.io only renders a window of entries — scrolling forces
// the virtualizer to render earlier ones.
async function scrollToLoadAllEntries(container: Element): Promise<void> {
  // Find the scrollable parent
  let scrollEl: Element | null = container;
  while (scrollEl && scrollEl.scrollHeight <= scrollEl.clientHeight) {
    scrollEl = scrollEl.parentElement;
  }
  if (!scrollEl || scrollEl === document.body) {
    // container itself might be scrollable
    scrollEl = container;
  }

  // Scroll to the very top to start from the beginning
  scrollEl.scrollTop = 0;
  await wait(100);
  scanContainer(container);

  // Scroll down in chunks to load all virtualized entries
  const step = scrollEl.clientHeight * 0.8;
  let lastHeight = 0;
  let attempts = 0;

  while (attempts < 50) {
    scrollEl.scrollTop += step;
    await wait(50);
    scanContainer(container);

    // Check if we've reached the bottom
    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 10) {
      break;
    }
    // Check if scrollHeight stopped growing (all entries loaded)
    if (scrollEl.scrollHeight === lastHeight) {
      attempts++;
      if (attempts > 3) break;
    } else {
      attempts = 0;
    }
    lastHeight = scrollEl.scrollHeight;
  }

  // Restore scroll position to bottom (most recent entries)
  scrollEl.scrollTop = scrollEl.scrollHeight;
  await wait(50);
  scanContainer(container);

  console.log(`[catan-companion] Initial scan complete: ${processedIndices.size} entries processed`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function observeLogContainer(container: Element): void {
  // Do initial full scan by scrolling through the virtualized log
  scrollToLoadAllEntries(container).then(() => {
    // After initial scan, watch for new entries
    const observer = new MutationObserver(() => {
      scanContainer(container);
    });
    observer.observe(container, { childList: true, subtree: true });
  });
}

function findLogContainer(): Element | null {
  const byId = document.getElementById("game-log-text")
    ?? document.getElementById("game-log")
    ?? document.getElementById("game-chat-log");
  if (byId) return byId;

  // Fallback: find the nearest ancestor of [data-index] elements
  const firstEntry = document.querySelector("[data-index]");
  if (firstEntry) {
    let parent = firstEntry.parentElement;
    while (parent && parent !== document.body) {
      const entries = parent.querySelectorAll("[data-index]");
      if (entries.length >= 2) {
        return parent;
      }
      parent = parent.parentElement;
    }
  }

  return null;
}

export function startObserver(): void {
  createOverlay();

  const logContainer = findLogContainer();
  if (logContainer) {
    observeLogContainer(logContainer);
    return;
  }

  const bodyObserver = new MutationObserver((_mutations, observer) => {
    const log = findLogContainer();
    if (log) {
      observer.disconnect();
      clearInterval(pollInterval);
      observeLogContainer(log);
    }
  });

  bodyObserver.observe(document.body, { childList: true, subtree: true });

  const pollInterval = setInterval(() => {
    const log = findLogContainer();
    if (log) {
      clearInterval(pollInterval);
      bodyObserver.disconnect();
      observeLogContainer(log);
    }
  }, 2000);

  setTimeout(() => clearInterval(pollInterval), 60000);
}
