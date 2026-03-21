export async function postTeamMessage(origin, missionId, payload) {
  const response = await fetch(
    `${origin}/api/missions/${encodeURIComponent(missionId)}/team-messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }

  return text || "{}";
}
