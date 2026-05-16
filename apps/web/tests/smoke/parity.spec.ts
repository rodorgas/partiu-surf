import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const FORECAST_SCRIPT = path.resolve(
  __dirname,
  "..",
  "..",
  "api",
  "forecast.py",
);

// Parity: the TS render path (page → /api/forecast → adapter) must produce the
// same scores as `python -m surfcheck` for the same spot/date. Within ±0.1
// because the CLI prints with 1 decimal and we serialize with 2.
test("scores match python -m surfcheck (±0.1) for arpoador on a fixed date", async () => {
  const date = "2026-05-11";

  // Run the CLI and capture its score column.
  const cli = spawnSync(
    "python3",
    ["-m", "surfcheck", "--spot", "arpoador", "--date", date],
    { cwd: REPO_ROOT, encoding: "utf-8" },
  );
  expect(cli.status, cli.stderr).toBe(0);
  const cliScores: Record<string, number> = {};
  for (const line of cli.stdout.split("\n")) {
    const m = line.match(/^(\d{2}h)\s.*?(\d+\.\d)\s*[🟢🟡🔴⚠️💤]/u);
    if (m) cliScores[m[1]] = Number(m[2]);
  }
  expect(Object.keys(cliScores).length).toBeGreaterThan(0);

  // Run the Python forecast function standalone (same module the Vercel
  // function uses). This is identical to what /api/forecast returns.
  const args = JSON.stringify({
    slug: "arpoador",
    name: "Arpoador",
    region: "Rio de Janeiro · RJ",
    lat: -22.989,
    lon: -43.193,
    facing: 195,
    sizeTol: 1.0,
    breakType: "beach",
    tidePref: "rising",
    shelter: [],
    date,
  });
  const api = spawnSync("python3", [FORECAST_SCRIPT, args], {
    encoding: "utf-8",
  });
  expect(api.status, api.stderr).toBe(0);
  const apiPayload = JSON.parse(api.stdout) as {
    hours: { h: string; score: number }[];
  };

  // Compare overlapping hours only — CLI shows all 24h, /api shows daylight 05-18.
  let compared = 0;
  for (const r of apiPayload.hours) {
    const cliScore = cliScores[r.h];
    if (cliScore === undefined) continue;
    compared++;
    expect(
      Math.abs(r.score - cliScore),
      `score diff at ${r.h}: CLI=${cliScore} API=${r.score}`,
    ).toBeLessThanOrEqual(0.1);
  }
  expect(compared, "no overlapping hours to compare").toBeGreaterThanOrEqual(5);
});
