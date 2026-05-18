// Loading skeleton shown while the server-side getForecast call is pending.
// Lives inside a <Suspense> boundary so Next.js can stream the page shell
// before the Python lambdas resolve — turns the 4–7s cold-cache blank into
// an immediate paint with the spot name and a hint of geometry.

import { SPOTS } from "@/lib/spots";

const C = {
  bg: "#f5e8d2",
  surface: "#fff8e9",
  panel: "#fbecd1",
  deep: "#0a3a44",
  sand: "#e9c585",
  teal: "#147184",
  inkDim: "#557078",
  rule: "#e1cfa6",
  display: "var(--font-display), var(--font-sans), ui-sans-serif, system-ui, sans-serif",
} as const;

const PULSE = "surf-skeleton-pulse 1.4s ease-in-out infinite";

function Bar({ w, h = 14, delay = 0 }: { w: number | string; h?: number; delay?: number }) {
  return (
    <div
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: h,
        borderRadius: 999,
        background: C.sand,
        animation: PULSE,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

export function SpotSkeleton({ spot }: { spot: string }) {
  const meta = SPOTS[spot];
  const name = meta?.name ?? spot;
  const region = meta?.region ?? "";

  return (
    <div
      data-testid="spot-skeleton"
      style={{
        position: "absolute",
        inset: 0,
        background: C.bg,
        overflow: "auto",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 28px 0" }}>
        <div
          style={{
            background: C.surface,
            borderRadius: 24,
            padding: "28px 32px",
            boxShadow: `0 1px 0 ${C.rule}, 0 8px 24px rgba(10,58,68,0.04)`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11.5,
                  color: C.teal,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                {region}
              </div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: C.display,
                  fontSize: 48,
                  lineHeight: 1,
                  color: C.deep,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {name}
              </h1>
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <Bar w={88} h={28} />
                <Bar w={88} h={28} delay={0.1} />
                <Bar w={88} h={28} delay={0.2} />
                <Bar w={88} h={28} delay={0.3} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18, maxWidth: 480 }}>
                <Bar w="100%" />
                <Bar w="70%" delay={0.15} />
              </div>
            </div>
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: "50%",
                background: C.sand,
                animation: PULSE,
                flex: "0 0 auto",
              }}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 24,
            padding: "18px 20px",
            background: C.surface,
            borderRadius: 24,
            boxShadow: `0 1px 0 ${C.rule}, 0 8px 24px rgba(10,58,68,0.04)`,
          }}
        >
          <div style={{ display: "flex", gap: 12, overflow: "hidden" }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: "0 0 64px",
                  height: 96,
                  borderRadius: 14,
                  background: C.panel,
                  animation: PULSE,
                  animationDelay: `${i * 0.06}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            color: C.inkDim,
            fontSize: 13,
            textAlign: "center",
            letterSpacing: "0.02em",
          }}
        >
          carregando previsão…
        </div>
      </div>
    </div>
  );
}
