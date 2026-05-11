"use client";
// Collapsible explainer for the composite score formula.
// Rendered as a footer below the hour-by-hour table on both desktop and
// mobile. Uses native <details>/<summary> for accessibility + zero-state.

const P = {
  surface: "#fff8e9",
  deep:    "#0a3a44",
  teal:    "#147184",
  coral:   "#e26a4a",
  ink:     "#1d2a30",
  inkDim:  "#557078",
  inkSoft: "#8a9ea3",
  rule:    "#e1cfa6",
  foam:    "#cde9e3",
  bg:      "#f5e8d2",
  sans:    "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  display: "var(--font-display), var(--font-sans), ui-sans-serif, system-ui, sans-serif",
} as const;

type Variant = "desktop" | "mobile";

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "0.9em",
        background: P.bg,
        padding: "1px 6px",
        borderRadius: 4,
        color: P.deep,
      }}
    >
      {children}
    </code>
  );
}

function Row({
  icon,
  title,
  weight,
  children,
}: {
  icon: string;
  title: string;
  weight: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr",
        gap: 10,
        paddingTop: 10,
      }}
    >
      <span
        style={{
          fontSize: 16,
          color: P.teal,
          lineHeight: 1.2,
        }}
      >
        {icon}
      </span>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <b style={{ color: P.deep, fontSize: 13.5 }}>{title}</b>
          <span
            style={{
              fontSize: 10.5,
              color: P.inkSoft,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {weight}
          </span>
        </div>
        <div style={{ fontSize: 13, color: P.inkDim, lineHeight: 1.55, marginTop: 2 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function ScoreMethodology({ variant = "desktop" }: { variant?: Variant }) {
  const compact = variant === "mobile";
  return (
    <details
      data-testid="score-methodology"
      style={{
        background: P.surface,
        borderRadius: compact ? 14 : 18,
        boxShadow: `0 1px 0 ${P.rule}`,
        margin: compact ? "12px 16px 0" : "12px 0 0",
        overflow: "hidden",
        fontFamily: P.sans,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          padding: compact ? "10px 14px" : "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: compact ? 12.5 : 13.5,
          color: P.ink,
          fontWeight: 600,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: P.foam,
            color: P.teal,
            fontSize: 13,
            fontStyle: "italic",
            fontWeight: 700,
            fontFamily: "Georgia, serif",
          }}
        >
          i
        </span>
        <span>Como é calculado o score</span>
        <span
          aria-hidden="true"
          className="score-methodology-chevron"
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: P.inkSoft,
            transition: "transform .15s ease",
          }}
        >
          ▾
        </span>
      </summary>

      <div
        style={{
          padding: compact ? "0 14px 14px" : "0 22px 18px",
          borderTop: `1px solid ${P.rule}88`,
          fontSize: 13,
          color: P.inkDim,
          lineHeight: 1.55,
        }}
      >
        <p style={{ margin: "12px 0 0" }}>
          Score 0–10 é uma média ponderada de quatro fatores. O valor de cada
          fator também vai de 0 a 10.
        </p>

        <Row icon="≋" title="Potência da onda" weight="peso 50% (ou 40% com maré)">
          <Mono>H × T ÷ tolerância do pico</Mono>, mapeado pela curva da prancha.
          {" "}H é altura da onda em metros, T é período em segundos.{" "}
          <b style={{ color: P.deep }}>Período conta muito</b> — 1 m × 13 s tem
          muito mais energia que 1 m × 7 s. Picos como Reserva ou Barra aguentam
          tamanho maior limpo (tolerância &gt; 1); Leblon é mais sensível
          (tolerância 0.7).
        </Row>

        <Row icon="⌖" title="Direção do swell" weight="peso 30%">
          Quão alinhado o swell entra em relação ao <i>facing</i> do pico:{" "}
          <Mono>0–22°</Mono> = 10, <Mono>22–45°</Mono> = 7, <Mono>45–67°</Mono> = 4,
          {" "}<Mono>67–90°</Mono> = 2, <Mono>&gt; 90°</Mono> = 0.
        </Row>

        <Row icon="✱" title="Vento" weight="peso 20%">
          Terral (offshore) puro = 10. Onshore = 1. Rajada &gt; 25 km/h aplica{" "}
          <Mono>−3</Mono> no subscore. Picos com sombra terrestre{" "}
          (<i>shelter</i>) reduzem o vento efetivo em até 0.3× quando ele vem do
          ângulo bloqueado.
        </Row>

        <Row icon="◐" title="Maré" weight="peso 10% (quando há dado)">
          Bate ou não com a preferência do pico (alta, baixa, subindo,
          descendo, <i>mid</i>). Sem chave da WorldTides, esse fator sai do
          cálculo e os pesos rebalanceiam.
        </Row>

        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: P.bg,
            borderRadius: 12,
            color: P.deep,
            fontSize: 12.5,
            lineHeight: 1.6,
          }}
        >
          <div style={{ color: P.inkSoft, fontWeight: 600, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
            Composição
          </div>
          <div>
            sem maré: <Mono>(dir×3 + potência×5 + vento×2) ÷ 10</Mono>
          </div>
          <div style={{ marginTop: 4 }}>
            com maré: <Mono>(dir×3 + potência×4 + vento×2 + maré×1) ÷ 10</Mono>
          </div>
        </div>

        <p style={{ margin: "12px 0 0", fontSize: 12, color: P.inkSoft }}>
          🟢 ≥ 7 · 🟡 4–7 · 🔴 &lt; 4 · ⚠️ acima do <i>danger_h</i> da prancha com
          vento ruim · 💤 &lt; 0.5 m
        </p>
      </div>

      <style>{`
        details[data-testid="score-methodology"][open] .score-methodology-chevron {
          transform: rotate(180deg);
        }
        details[data-testid="score-methodology"] summary::-webkit-details-marker {
          display: none;
        }
      `}</style>
    </details>
  );
}

export default ScoreMethodology;
