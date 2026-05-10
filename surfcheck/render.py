"""Output formatting — table, multi-day summary, history."""
from collections import defaultdict

from .scoring import label


def _tide_str(r):
    if r["tide_h"] is None:
        return ""
    return f"{r['tide_h']:.1f}m {r['tide_st'][:4]}"


def render_hours(rows, name, gear_key, when, gear, with_tide=False):
    tag = "" if gear_key == "all" else f" ({gear_key})"
    print(f"\n{name}{tag} — {when}\n")
    headers = [("Hora", 6), ("Swell", 18), ("Vento", 14)]
    if with_tide:
        headers.append(("Maré", 12))
    headers.append(("Score", 6))
    line = "".join(f"{h:<{w}}" for h, w in headers)
    print(line)
    print("─" * sum(w for _, w in headers))
    for r in rows:
        swell = f"{r['sh']:.1f}m {r['sp']:.0f}s {r['sd']}"
        vento = f"{r['wd']} {r['ws']:.0f}km/h"
        cols = [f"{r['dt'].strftime('%Hh'):<6}",
                f"{swell:<18}",
                f"{vento:<14}"]
        if with_tide:
            cols.append(f"{_tide_str(r):<12}")
        cols.append(f"{r['score']:.1f} {label(r['score'], r['sh'], r['ws_s'], gear)}")
        print("".join(cols))


def find_best_window(rows, min_hours=2, min_score=7):
    """Longest contiguous window with score >= min_score, lasting >= min_hours."""
    best, cur = None, None
    for i, r in enumerate(rows):
        if r["score"] >= min_score:
            if cur is None:
                cur = i
            length = i - cur + 1
            if length >= min_hours and (best is None or length > best[1] - best[0] + 1):
                best = (cur, i)
        else:
            cur = None
    return best


def render_summary(rows, gear):
    print()
    best = find_best_window(rows)
    if best:
        a = rows[best[0]]["dt"].strftime("%Hh")
        b = rows[best[1]]["dt"].strftime("%Hh")
        print(f"Melhor janela: {a}–{b} 🟢")
    else:
        print("Sem janela decente.")
    if any(r["sh"] > gear["danger_h"] and r["ws_s"] < 5 for r in rows):
        print(f"⚠️  Atenção: horas com onda > {gear['danger_h']}m e vento ruim — risco real.")


def render_multiday(rows, name, gear_key, days, gear):
    """Daily summary: best hour per day for the next N days."""
    by_day = defaultdict(list)
    for r in rows:
        by_day[r["dt"].strftime("%Y-%m-%d")].append(r)

    tag = "" if gear_key == "all" else f" ({gear_key})"
    print(f"\n{name}{tag} — próximos {days} dias\n")
    print(f"{'Data':<12}{'Pico':<6}{'Janela':<11}{'Swell':<18}{'Vento':<14}{'Score':<6}")
    print("─" * 67)
    for date_str in sorted(by_day)[:days]:
        day_rows = by_day[date_str]
        best = max(day_rows, key=lambda r: r["score"])
        green = [r for r in day_rows if r["score"] >= 7]
        if green:
            window = f"{green[0]['dt'].strftime('%Hh')}-{green[-1]['dt'].strftime('%Hh')}"
        else:
            window = "—"
        peak = best["dt"].strftime("%Hh")
        swell = f"{best['sh']:.1f}m {best['sp']:.0f}s {best['sd']}"
        vento = f"{best['wd']} {best['ws']:.0f}km/h"
        lbl = label(best["score"], best["sh"], best["ws_s"], gear)
        print(f"{date_str:<12}{peak:<6}{window:<11}{swell:<18}{vento:<14}"
              f"{best['score']:.1f} {lbl}")


def render_history(sessions):
    if not sessions:
        print("Nenhuma sessão registrada ainda. Use `python -m surfcheck log --rating N`.")
        return
    print(f"\n{'Quando':<20}{'Pico':<14}{'Gear':<12}{'Predicted':<11}{'Real':<6}{'Notas'}")
    print("─" * 75)
    for s in sessions:
        when = s["ts"][:16].replace("T", " ")
        notes = (s.get("notes", "") or "")[:30]
        pred = s["conditions"].get("score", float("nan"))
        print(f"{when:<20}{s['spot']:<14}{s['gear']:<12}"
              f"{pred:<11.1f}{s['rating']:<6}{notes}")
