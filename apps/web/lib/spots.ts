// Spot metadata — mirrors surfcheck/config.py:SPOTS field-by-field.
//
// The Python source uses positional tuples; this TS port keys them by slug so
// /[spot]/page.tsx can look them up directly. If you add or reorder fields
// here, also update surfcheck/config.py — both sides go through the Python
// forecast function, but the slug list drives generateStaticParams().

export type ShelterArc = readonly [start: number, end: number];

export type TidePref =
  | "any"
  | "rising"
  | "falling"
  | "high"
  | "low"
  | "mid";

export type BreakType = "beach" | "point" | "reef";

export type Spot = {
  slug: string;
  /** Display name as used in headings. */
  name: string;
  /** Sub-label, e.g. "Rio de Janeiro · RJ". */
  region: string;
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

/**
 * Locked roster mirroring surfcheck.config.SPOTS. Slugs match the Python
 * dict keys so /api/forecast can resolve a slug back to a Python tuple.
 *
 * Region strings differ from Python (which has no region field) — they're
 * UI metadata, kept here so the header renders without a second source.
 */
export const SPOTS: Record<string, Spot> = {
  arpoador: {
    slug: "arpoador",
    name: "Arpoador",
    region: "Rio de Janeiro · RJ",
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
    lat: -23.048,
    lon: -43.53,
    facing: 205,
    shelter: [[170, 240]],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.1,
  },
  // Itamambuca isn't in the Python config yet — added here so the design's
  // headline spot resolves. When you sync back, append it to the Python dict
  // with the same tuple ordering.
  itamambuca: {
    slug: "itamambuca",
    name: "Itamambuca",
    region: "Ubatuba · SP",
    lat: -23.397,
    lon: -45.039,
    facing: 165,
    shelter: [],
    breakType: "beach",
    tidePref: "any",
    sizeTol: 1.1,
  },
};

/** Default spot when none is provided (root redirects here). */
export const DEFAULT_SPOT_SLUG = "itamambuca";

export const SPOT_SLUGS = Object.keys(SPOTS);

export function getSpot(slug: string): Spot | null {
  return SPOTS[slug] ?? null;
}
