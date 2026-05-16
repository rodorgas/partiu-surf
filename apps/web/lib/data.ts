// Mock forecast data for partiu.surf — pt-BR.
// Shape mirrors the surfcheck backend (swell, wind, tide, score).
// Replace MOCK_FORECAST with a real fetch in Phase 3.

export type TideState = "subindo" | "descendo" | "alta" | "baixa";

export type ForecastHour = {
  h: string;
  score: number;
  swH: number;
  swT: number;
  swDir: number;
  wKmh: number;
  wDir: number;
  gust: number;
  tideH: number;
  tide: TideState;
  flag: string;
};

export type Spot = {
  name: string;
  region: string;
  facing: number;
  breakType: string;
  waterTemp: number;
  sunrise: string;
  sunset: string;
  bestWindow: string;
  todayPeak: number;
};

export type NearbySpot = {
  name: string;
  city: string;
  dist: string;
  best: number;
};

export type Historic = {
  avgScore: number;
  avgSwH: number;
  avgSwT: number;
  note: string;
};

export type Forecast = {
  hours: ForecastHour[];
  spot: Spot;
  spots: NearbySpot[];
  suggestions: string[];
  welcome: string;
  historic: Historic;
};

const hours: ForecastHour[] = [
  { h: "05h", score: 5.6, swH: 1.4, swT: 11, swDir: 173, wKmh: 9, wDir: 225, gust: 15, tideH: 1.5, tide: "subindo", flag: "" },
  { h: "06h", score: 6.4, swH: 1.4, swT: 11, swDir: 175, wKmh: 8, wDir: 230, gust: 14, tideH: 1.6, tide: "subindo", flag: "" },
  { h: "07h", score: 7.8, swH: 1.5, swT: 12, swDir: 180, wKmh: 7, wDir: 235, gust: 12, tideH: 1.8, tide: "subindo", flag: "" },
  { h: "08h", score: 8.6, swH: 1.6, swT: 12, swDir: 182, wKmh: 6, wDir: 240, gust: 10, tideH: 2.0, tide: "subindo", flag: "" },
  { h: "09h", score: 8.9, swH: 1.7, swT: 13, swDir: 185, wKmh: 5, wDir: 245, gust: 8, tideH: 2.1, tide: "alta", flag: "" },
  { h: "10h", score: 8.4, swH: 1.7, swT: 13, swDir: 188, wKmh: 9, wDir: 260, gust: 14, tideH: 2.0, tide: "alta", flag: "" },
  { h: "11h", score: 7.2, swH: 1.6, swT: 12, swDir: 190, wKmh: 13, wDir: 280, gust: 19, tideH: 1.7, tide: "descendo", flag: "" },
  { h: "12h", score: 5.4, swH: 1.5, swT: 11, swDir: 192, wKmh: 18, wDir: 300, gust: 26, tideH: 1.4, tide: "descendo", flag: "⚠️" },
  { h: "13h", score: 3.8, swH: 1.4, swT: 11, swDir: 195, wKmh: 23, wDir: 310, gust: 32, tideH: 1.0, tide: "descendo", flag: "⚠️" },
  { h: "14h", score: 3.1, swH: 1.3, swT: 10, swDir: 200, wKmh: 25, wDir: 315, gust: 34, tideH: 0.7, tide: "baixa", flag: "⚠️" },
  { h: "15h", score: 4.2, swH: 1.3, swT: 10, swDir: 200, wKmh: 21, wDir: 310, gust: 28, tideH: 0.6, tide: "baixa", flag: "" },
  { h: "16h", score: 5.6, swH: 1.4, swT: 11, swDir: 198, wKmh: 16, wDir: 300, gust: 22, tideH: 0.9, tide: "subindo", flag: "" },
  { h: "17h", score: 6.9, swH: 1.5, swT: 11, swDir: 195, wKmh: 11, wDir: 285, gust: 17, tideH: 1.3, tide: "subindo", flag: "" },
  { h: "18h", score: 7.4, swH: 1.5, swT: 12, swDir: 192, wKmh: 8, wDir: 270, gust: 13, tideH: 1.7, tide: "subindo", flag: "" },
];

const spots: NearbySpot[] = [
  { name: "Itamambuca", city: "Ubatuba · SP", dist: "2.4 km", best: 8.9 },
  { name: "Maranduba", city: "Ubatuba · SP", dist: "9.1 km", best: 6.2 },
  { name: "Felix", city: "Ubatuba · SP", dist: "14 km", best: 7.4 },
  { name: "Vermelha do Sul", city: "Ubatuba · SP", dist: "18 km", best: 5.8 },
];

const suggestions: string[] = [
  "Tá bom pro shortboard agora?",
  "Quando é a melhor janela hoje?",
  "Vale a pena esperar a maré encher?",
  "Por que o vento piora depois das 12h?",
  "Compara Itamambuca com Maranduba",
  "Que prancha levo com 1.6m e 12s?",
];

const welcome =
  "Oi! Sou o copiloto do partiu.surf. Posso te ajudar a decidir se vale a pena ir surfar — analiso swell, vento, maré e cruzo com o seu nível e equipamento. Procura um pico ali na direita ou me pergunta direto.";

const historic: Historic = {
  avgScore: 6.1,
  avgSwH: 1.2,
  avgSwT: 9.5,
  note: "hoje 32% acima da média de novembro",
};

const spot: Spot = {
  name: "Itamambuca",
  region: "Ubatuba · SP",
  facing: 165,
  breakType: "beach",
  waterTemp: 24.1,
  sunrise: "05:21",
  sunset: "18:43",
  bestWindow: "08h–10h",
  todayPeak: 8.9,
};

export const MOCK_FORECAST: Forecast = {
  hours,
  spots,
  suggestions,
  welcome,
  historic,
  spot,
};

// Shared visual helpers (kept here so components stay presentational).
export const scoreColor = (s: number): "green" | "amber" | "red" =>
  s >= 7 ? "green" : s >= 4 ? "amber" : "red";

export const scoreEmoji = (s: number): string =>
  s >= 7 ? "🟢" : s >= 4 ? "🟡" : "🔴";

const COMPASS = [
  "N", "NNE", "NE", "ENE", "L", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
];

export const dirLabel = (deg: number): string =>
  COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

const BREAK_TYPE_PT: Record<string, string> = {
  beach: "praia",
  point: "point",
  reef: "recife",
};

export const breakTypeLabel = (bt: string): string => BREAK_TYPE_PT[bt] ?? bt;
