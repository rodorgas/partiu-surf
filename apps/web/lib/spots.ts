// Spot metadata.
//
// The first 8 entries (Rio) mirror surfcheck/config.py:SPOTS field-by-field.
// Spots beyond Rio (NE, SP, SC, RS) live TS-only — /api/forecast.py receives
// the full spot tuple via query params, so the Python config doesn't need to
// know about them. If you sync any of these back, append to the Python dict
// with the same tuple ordering.
//
// Coordinates and facing/shelter/sizeTol for non-Rio spots are best-effort
// approximations from public maps + surf reports. Adjust as you get local
// knowledge.

export type ShelterArc = readonly [start: number, end: number];

export type TidePref =
  | "any"
  | "rising"
  | "falling"
  | "high"
  | "low"
  | "mid";

export type BreakType = "beach" | "point" | "reef";

/** Brazilian state UF codes used for grouping in the picker. */
export type StateUF = "PE" | "RN" | "BA" | "RJ" | "SP" | "SC" | "RS";

export type Spot = {
  slug: string;
  /** Display name as used in headings. */
  name: string;
  /** Sub-label, e.g. "Rio de Janeiro · RJ". */
  region: string;
  /** Brazilian state UF for grouping in the picker. */
  state: StateUF;
  lat: number;
  lon: number;
  /** Direction the beach "looks at" — ideal swell entry. Degrees 0..360. */
  facing: number;
  /** Wind directions blocked by terrain (degrees). Empty if open. */
  shelter: ShelterArc[];
  breakType: BreakType;
  tidePref: TidePref;
  /** Multiplier on power upper-bound: 1.0 baseline, >1 tolerates bigger size. */
  sizeTol: number;
};

export const STATE_NAMES: Record<StateUF, string> = {
  PE: "Pernambuco",
  RN: "Rio Grande do Norte",
  BA: "Bahia",
  RJ: "Rio de Janeiro",
  SP: "São Paulo",
  SC: "Santa Catarina",
  RS: "Rio Grande do Sul",
};

/** Display order — roughly north to south. */
export const STATE_ORDER: StateUF[] = ["PE", "RN", "BA", "RJ", "SP", "SC", "RS"];

export const SPOTS: Record<string, Spot> = {
  // ---- Rio de Janeiro (mirrors surfcheck/config.py) ----------------------
  arpoador: {
    slug: "arpoador",
    name: "Arpoador",
    region: "Rio de Janeiro · RJ",
    state: "RJ",
    lat: -22.989,
    lon: -43.193,
    facing: 195,
    shelter: [],
    breakType: "beach",
    tidePref: "rising",
    sizeTol: 1.0,
  },
  leblon: {
    slug: "leblon",
    name: "Leblon",
    region: "Rio de Janeiro · RJ",
    state: "RJ",
    lat: -22.988,
    lon: -43.222,
    facing: 180,
    shelter: [[220, 290]],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 0.7,
  },
  ipanema: {
    slug: "ipanema",
    name: "Ipanema P9",
    region: "Rio de Janeiro · RJ",
    state: "RJ",
    lat: -22.985,
    lon: -43.205,
    facing: 190,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.0,
  },
  barra: {
    slug: "barra",
    name: "Barra (Pepê)",
    region: "Rio de Janeiro · RJ",
    state: "RJ",
    lat: -23.011,
    lon: -43.366,
    facing: 180,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.2,
  },
  reserva: {
    slug: "reserva",
    name: "Reserva",
    region: "Rio de Janeiro · RJ",
    state: "RJ",
    lat: -23.02,
    lon: -43.402,
    facing: 185,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.3,
  },
  macumba: {
    slug: "macumba",
    name: "Macumba",
    region: "Rio de Janeiro · RJ",
    state: "RJ",
    lat: -23.026,
    lon: -43.5,
    facing: 195,
    shelter: [[170, 220]],
    breakType: "beach",
    tidePref: "rising",
    sizeTol: 1.1,
  },
  prainha: {
    slug: "prainha",
    name: "Prainha",
    region: "Rio de Janeiro · RJ",
    state: "RJ",
    lat: -23.044,
    lon: -43.504,
    facing: 200,
    shelter: [[170, 230]],
    breakType: "point",
    tidePref: "high",
    sizeTol: 1.2,
  },
  grumari: {
    slug: "grumari",
    name: "Grumari",
    region: "Rio de Janeiro · RJ",
    state: "RJ",
    lat: -23.048,
    lon: -43.53,
    facing: 205,
    shelter: [[170, 240]],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.1,
  },
  // ---- Rio de Janeiro (extra) --------------------------------------------
  saquarema: {
    slug: "saquarema",
    name: "Saquarema (Itaúna)",
    region: "Saquarema · RJ",
    state: "RJ",
    lat: -22.926,
    lon: -42.516,
    facing: 180,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.3,
  },
  itacoatiara: {
    slug: "itacoatiara",
    name: "Itacoatiara",
    region: "Niterói · RJ",
    state: "RJ",
    lat: -22.971,
    lon: -43.038,
    facing: 180,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.2,
  },
  geriba: {
    slug: "geriba",
    name: "Geribá",
    region: "Búzios · RJ",
    state: "RJ",
    lat: -22.768,
    lon: -41.918,
    facing: 180,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.0,
  },
  recreio: {
    slug: "recreio",
    name: "Recreio",
    region: "Rio de Janeiro · RJ",
    state: "RJ",
    lat: -23.026,
    lon: -43.461,
    facing: 195,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.1,
  },

  // ---- São Paulo ---------------------------------------------------------
  itamambuca: {
    slug: "itamambuca",
    name: "Itamambuca",
    region: "Ubatuba · SP",
    state: "SP",
    lat: -23.397,
    lon: -45.039,
    facing: 165,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.1,
  },
  maresias: {
    slug: "maresias",
    name: "Maresias",
    region: "São Sebastião · SP",
    state: "SP",
    lat: -23.793,
    lon: -45.575,
    facing: 170,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.2,
  },
  maranduba: {
    slug: "maranduba",
    name: "Maranduba",
    region: "Ubatuba · SP",
    state: "SP",
    lat: -23.524,
    lon: -45.219,
    facing: 180,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.0,
  },

  // ---- Northeast ---------------------------------------------------------
  "cacimba-do-padre": {
    slug: "cacimba-do-padre",
    name: "Cacimba do Padre",
    region: "Fernando de Noronha · PE",
    state: "PE",
    lat: -3.857,
    lon: -32.448,
    facing: 30,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.5,
  },
  pipa: {
    slug: "pipa",
    name: "Pipa",
    region: "Tibau do Sul · RN",
    state: "RN",
    lat: -6.232,
    lon: -35.044,
    facing: 90,
    shelter: [],
    breakType: "point",
    tidePref: "any",
    sizeTol: 1.1,
  },
  maracaipe: {
    slug: "maracaipe",
    name: "Maracaípe",
    region: "Ipojuca · PE",
    state: "PE",
    lat: -8.527,
    lon: -35.000,
    facing: 90,
    shelter: [],
    breakType: "beach",
    tidePref: "low",
    sizeTol: 1.0,
  },
  itacare: {
    slug: "itacare",
    name: "Itacaré (Tiririca)",
    region: "Itacaré · BA",
    state: "BA",
    lat: -14.282,
    lon: -38.999,
    facing: 110,
    shelter: [],
    breakType: "point",
    tidePref: "mid",
    sizeTol: 1.1,
  },

  // ---- Santa Catarina ----------------------------------------------------
  "praia-brava-itajai": {
    slug: "praia-brava-itajai",
    name: "Praia Brava",
    region: "Itajaí · SC",
    state: "SC",
    lat: -26.998,
    lon: -48.620,
    facing: 110,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.2,
  },
  joaquina: {
    slug: "joaquina",
    name: "Joaquina",
    region: "Florianópolis · SC",
    state: "SC",
    lat: -27.625,
    lon: -48.451,
    facing: 100,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.2,
  },
  "praia-mole": {
    slug: "praia-mole",
    name: "Praia Mole",
    region: "Florianópolis · SC",
    state: "SC",
    lat: -27.604,
    lon: -48.428,
    facing: 100,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.1,
  },
  "guarda-do-embau": {
    slug: "guarda-do-embau",
    name: "Guarda do Embaú",
    region: "Palhoça · SC",
    state: "SC",
    lat: -27.876,
    lon: -48.595,
    facing: 120,
    shelter: [],
    breakType: "point",
    tidePref: "rising",
    sizeTol: 1.2,
  },
  silveira: {
    slug: "silveira",
    name: "Silveira",
    region: "Garopaba · SC",
    state: "SC",
    lat: -28.029,
    lon: -48.652,
    facing: 130,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.3,
  },
  "praia-do-rosa": {
    slug: "praia-do-rosa",
    name: "Praia do Rosa",
    region: "Imbituba · SC",
    state: "SC",
    lat: -28.117,
    lon: -48.643,
    facing: 130,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.1,
  },
  "cabo-santa-marta": {
    slug: "cabo-santa-marta",
    name: "Cabo de Santa Marta",
    region: "Laguna · SC",
    state: "SC",
    lat: -28.602,
    lon: -48.806,
    facing: 130,
    shelter: [],
    breakType: "point",
    tidePref: "any",
    sizeTol: 1.3,
  },

  // ---- Rio Grande do Sul -------------------------------------------------
  torres: {
    slug: "torres",
    name: "Torres",
    region: "Torres · RS",
    state: "RS",
    lat: -29.336,
    lon: -49.732,
    facing: 130,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.2,
  },
};

/** Default spot when none is provided (root redirects here). */
export const DEFAULT_SPOT_SLUG = "arpoador";

export const SPOT_SLUGS = Object.keys(SPOTS);

export function getSpot(slug: string): Spot | null {
  return SPOTS[slug] ?? null;
}
