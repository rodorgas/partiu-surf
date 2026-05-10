// Shared mobile primitives — palette + reusable bits used by the mobile shell.

window.MS = (function () {
  const C = {
    bg:       '#f5e8d2',
    surface:  '#fff8e9',
    panel:    '#fbecd1',
    deep:     '#0a3a44',
    teal:     '#147184',
    teal2:    '#1d8d9f',
    sun:      '#f29c50',
    coral:    '#e26a4a',
    foam:     '#cde9e3',
    ink:      '#1d2a30',
    inkDim:   '#557078',
    inkSoft:  '#8a9ea3',
    rule:     '#e1cfa6',
    green:    '#1f8a5b',
    amber:    '#d97a1a',
    red:      '#c0392b',
    sans:     "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
    display:  "'Bricolage Grotesque', 'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  };

  const scoreInk = (s) => (s >= 7 ? C.green : s >= 4 ? C.amber : C.red);

  function AppBar({tight}) {
    return (
      <div style={{
        padding: tight ? '4px 16px 8px' : '6px 16px 10px',
        display:'flex', alignItems:'center', gap:10,
        background:'transparent',
      }}>
        <svg width="26" height="26" viewBox="0 0 34 34" fill="none">
          <circle cx="17" cy="17" r="16" fill={C.sun}/>
          <path d="M2 22 Q 9 15 17 22 T 32 22" stroke={C.deep} strokeWidth="2" fill="none" strokeLinecap="round"/>
          <path d="M2 26 Q 9 19 17 26 T 32 26" stroke={C.deep} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5"/>
        </svg>
        <span style={{fontFamily:C.display, fontSize:18, fontWeight:700, color:C.deep, letterSpacing:'-0.02em'}}>
          partiu<span style={{color:C.coral}}>.</span>surf
        </span>
        <span style={{
          marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:6,
          padding:'5px 10px', background:C.surface, borderRadius:999, fontSize:11.5, color:C.ink, fontWeight:500,
          boxShadow:`0 1px 0 ${C.rule}`,
        }}>
          ◉ Itamambuca
        </span>
      </div>
    );
  }

  function SummaryCard({score=8.9, compact=false}) {
    return (
      <div style={{
        margin: compact ? '4px 12px' : '0 16px',
        padding: compact ? '12px 14px' : '14px 16px',
        background:C.surface, borderRadius:18,
        boxShadow:`0 1px 0 ${C.rule}`,
        position:'relative', overflow:'hidden',
      }}>
        <div style={{
          position:'absolute', top:-40, right:-40, width:120, height:120, borderRadius:'50%',
          background:`radial-gradient(circle at center, ${C.sun}40 0%, transparent 70%)`,
          pointerEvents:'none',
        }} />
        <div style={{position:'relative', display:'flex', alignItems:'flex-start', gap:12}}>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:10, color:C.teal, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase'}}>
              ◔ beach · facing SSE
            </div>
            <div style={{fontFamily:C.display, fontSize:compact?22:26, color:C.deep, fontWeight:700, lineHeight:1, marginTop:3, letterSpacing:'-0.02em'}}>
              Itamambuca
            </div>
            <div style={{fontSize:12, color:C.inkDim, marginTop:6, lineHeight:1.45}}>
              Pico <b style={{color:C.deep}}>08h–10h</b> · 1.7m·13s S · terral leve
            </div>
          </div>
          <Wedge score={score} size={compact?72:88} />
        </div>
      </div>
    );
  }

  function Wedge({score=8.9, size=88}) {
    const w=size, h=size*0.7, cx=w/2, cy=size*0.62, r=size*0.4;
    const t = Math.max(0, Math.min(1, score/10));
    const ang = Math.PI*(1-t);
    const x2 = cx + r*Math.cos(ang), y2 = cy - r*Math.sin(ang);
    const ink = scoreInk(score);
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{flex:'0 0 auto'}}>
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} stroke={C.foam} strokeWidth="8" fill="none" strokeLinecap="round"/>
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`} stroke={ink} strokeWidth="8" fill="none" strokeLinecap="round"/>
        <text x={cx} y={cy-8} fontSize={size*0.28} fill={C.deep} textAnchor="middle" fontFamily={C.display} fontWeight="700" letterSpacing="-0.02em">{score.toFixed(1)}</text>
        <text x={cx} y={cy+5} fontSize="8" fill={C.inkSoft} textAnchor="middle" fontFamily={C.sans} fontWeight="600" letterSpacing="0.1em">/10</text>
      </svg>
    );
  }

  function HourList({rows, max=8}) {
    const D = window.partiuData;
    rows = rows || D.hours;
    return (
      <div style={{margin:'0 16px', background:C.surface, borderRadius:16, boxShadow:`0 1px 0 ${C.rule}`, overflow:'hidden'}}>
        <div style={{
          padding:'8px 14px', fontSize:10.5, fontWeight:600, letterSpacing:'0.08em',
          textTransform:'uppercase', color:C.inkSoft, borderBottom:`1px solid ${C.rule}88`,
          display:'flex', justifyContent:'space-between', alignItems:'baseline',
        }}>
          <span>Hora a hora</span>
          <span style={{color:C.teal, letterSpacing:0, textTransform:'none', fontWeight:500, fontSize:11}}>06h → 18h</span>
        </div>
        {rows.slice(0,max).map((r,i)=>{
          const peak = r.score === Math.max(...rows.map(x=>x.score));
          const ink = scoreInk(r.score);
          return (
            <div key={r.h} style={{
              display:'grid',
              gridTemplateColumns:'42px 26px 1fr 64px 60px 26px',
              padding:'8px 14px', alignItems:'center', gap:8,
              background: peak ? '#fff5e2' : 'transparent',
              borderBottom: i<Math.min(rows.length,max)-1 ? `1px solid ${C.rule}66` : 'none',
              fontSize:12.5, color:C.ink, fontVariantNumeric:'tabular-nums',
            }}>
              <span style={{fontWeight:peak?700:500, color:peak?C.coral:C.ink}}>{r.h}</span>
              <span style={{color:ink, fontWeight:600, textAlign:'right'}}>{r.score.toFixed(1)}</span>
              <span style={{height:5, background:C.foam, borderRadius:999, overflow:'hidden'}}>
                <span style={{display:'block', width:`${r.score*10}%`, height:'100%', background:ink, borderRadius:999}} />
              </span>
              <span style={{color:C.inkDim, fontSize:11.5}}>{r.swH.toFixed(1)}m·{r.swT}s</span>
              <span style={{color:r.gust>25?C.red:C.inkDim, fontSize:11.5}}>{r.wKmh}<span style={{color:C.inkSoft, fontSize:10}}>km/h</span></span>
              <span style={{textAlign:'center', fontSize:13}}>{r.flag || (r.score>=7?'🟢':r.score>=4?'🟡':'🔴')}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function FilterChips() {
    return (
      <div style={{display:'flex', gap:6, padding:'0 16px', overflowX:'auto'}}>
        <Chip active>Auto</Chip>
        <Chip>Iniciante</Chip>
        <Chip>Short 6'2"</Chip>
        <Chip>Hoje</Chip>
      </div>
    );
  }
  function Chip({active, children}) {
    return (
      <span style={{
        fontSize:12, padding:'7px 12px', borderRadius:999,
        background: active?C.deep:C.surface,
        color: active?'#fff':C.ink,
        boxShadow: active ? `0 2px 8px rgba(10,58,68,0.18)` : `0 1px 0 ${C.rule}`,
        whiteSpace:'nowrap', fontWeight:500,
      }}>{children}</span>
    );
  }

  function SuggestionPill({children, dark, onClick}) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          display:'inline-block', whiteSpace:'nowrap',
          fontSize:12.5, padding:'7px 12px',
          borderRadius:999, lineHeight:1.2,
          border:'none', cursor:onClick?'pointer':'default',
          background: dark ? 'rgba(255,255,255,0.12)' : C.surface,
          color: dark ? '#fff' : C.ink,
          boxShadow: dark ? 'none' : `0 1px 0 ${C.rule}`,
        }}>{children}</button>
    );
  }

  return { C, scoreInk, AppBar, SummaryCard, Wedge, HourList, FilterChips, Chip, SuggestionPill };
})();
