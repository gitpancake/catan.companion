import type { GameState } from "colonist-io-api";

export function renderOverlay(container: HTMLElement, state: GameState): void {
  const body = container.querySelector(".catan-companion-body");
  if (!body || body.classList.contains("collapsed")) return;

  const players = Array.from(state.players.values());
  if (players.length === 0) {
    body.innerHTML = '<p style="color:#71717a;text-align:center;padding:8px 0;">Waiting for game data...</p>';
    return;
  }

  let html = '<table class="catan-companion-table"><thead><tr>';
  html += "<th></th><th>🏠</th><th>🏙️</th><th>VP</th>";
  html += "</tr></thead><tbody>";

  for (const player of players) {
    let vp = player.settlements + player.cities * 2 + player.vpCards;
    const hasLongestRoad = state.longestRoadPlayer === player.name;
    const hasLargestArmy = state.largestArmyPlayer === player.name;
    if (hasLongestRoad) vp += 2;
    if (hasLargestArmy) vp += 2;

    const badges: string[] = [];
    if (hasLargestArmy) badges.push("⚔️");
    if (hasLongestRoad) badges.push("🛤️");
    if (player.vpCards > 0) badges.push(`🃏×${player.vpCards}`);

    html += `<tr>`;
    html += `<td>${escapeHtml(player.name)}${badges.length ? " " + badges.join(" ") : ""}</td>`;
    html += `<td>${player.settlements}</td>`;
    html += `<td>${player.cities}</td>`;
    html += `<td style="font-weight:600">${vp}</td>`;
    html += `</tr>`;
  }
  html += "</tbody></table>";

  // Dice histogram
  const totalRolls = state.diceHistory.length;
  if (totalRolls > 0) {
    const maxCount = Math.max(...Object.values(state.diceHistogram), 1);
    html += '<div class="catan-companion-dice">';
    html += `<div class="catan-companion-dice-title">Dice (${totalRolls} rolls)</div>`;
    html += '<div class="catan-companion-dice-row">';
    for (let i = 2; i <= 12; i++) {
      const count = state.diceHistogram[i] ?? 0;
      const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
      html += `<div class="catan-companion-dice-bar">`;
      if (count > 0) html += `<span class="catan-companion-dice-bar-count">${count}</span>`;
      html += `<div class="catan-companion-dice-bar-fill" style="height:${heightPct}%"></div>`;
      html += `<span class="catan-companion-dice-bar-label">${i}</span>`;
      html += `</div>`;
    }
    html += "</div></div>";
  }

  body.innerHTML = html;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
