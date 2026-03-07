import type { GameEvent } from "./types";

function extractPlayerName(entry: Element): string {
  // Strategy 1: nested span > span (colonist.io pattern)
  const nestedSpan = entry.querySelector("span span");
  if (nestedSpan?.textContent?.trim()) return nestedSpan.textContent.trim();

  // Strategy 2: first colored/styled span (player names are often colored)
  const coloredSpans = entry.querySelectorAll("span[style], span[class]");
  for (const span of coloredSpans) {
    const text = span.textContent?.trim();
    if (text && text.length > 0 && text.length < 30 && !text.includes(" ")) {
      return text;
    }
  }

  // Strategy 3: extract from text before keyword
  const text = entry.textContent?.trim() ?? "";
  const keywords = [" placed ", " rolled", " built ", " received "];
  for (const kw of keywords) {
    const idx = text.indexOf(kw);
    if (idx > 0) {
      let name = text.substring(0, idx).trim();
      name = name.replace(/^[^\w]+/, "").trim();
      if (name.length > 0) return name;
    }
  }

  return "Unknown";
}

function extractDiceValue(entry: Element): number {
  const diceImgs = entry.querySelectorAll('img[alt^="dice"]');
  let total = 0;
  for (const img of diceImgs) {
    const alt = img.getAttribute("alt") ?? "";
    const match = alt.match(/(\d+)/);
    if (match) total += parseInt(match[1], 10);
  }
  if (total > 0) return total;

  const text = entry.textContent ?? "";
  const rollMatch = text.match(/rolled\s*(?:a\s+)?(\d+)/);
  if (rollMatch) return parseInt(rollMatch[1], 10);

  return 0;
}

export function parseLogEntry(entry: Element): GameEvent | null {
  const text = entry.textContent?.trim() ?? "";
  if (!text || text.length < 5) return null;

  const player = extractPlayerName(entry);

  // Dice roll
  if (text.includes("rolled")) {
    const value = extractDiceValue(entry);
    if (value > 0) return { type: "roll", player, value };
  }

  // Settlement or city built/placed
  if (text.includes("built a") || text.includes("placed a")) {
    const lower = text.toLowerCase();
    if (lower.includes("settlement")) return { type: "built", player, building: "settlement" };
    if (lower.includes("city")) return { type: "built", player, building: "city" };
  }

  // Largest army: "received Largest Army (+2 VPs)"
  if (text.toLowerCase().includes("largest army")) {
    return { type: "largest_army", player };
  }

  // Longest road: "received Longest Road (+2 VPs)"
  if (text.toLowerCase().includes("longest road")) {
    return { type: "longest_road", player };
  }

  // VP card revealed (end of game)
  if (text.toLowerCase().includes("victory point")) {
    return { type: "vp_card", player };
  }

  return null;
}
