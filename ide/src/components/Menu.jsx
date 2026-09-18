import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

// Anchored popover menu. items: {label, icon, img, dot, k, selected, disabled, run} | "-" | {h}
export function Menu({ anchor, items, align = "left", width, onClose }) {
  const ref = useRef(null); const [pos, setPos] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => { if (!anchor || !ref.current) return; const r = anchor.getBoundingClientRect(), m = ref.current.getBoundingClientRect(); let left = align === "right" ? r.right - m.width : r.left; left = Math.max(8, Math.min(left, innerWidth - m.width - 8)); let top = r.bottom + 6; if (top + m.height > innerHeight - 8) top = Math.max(8, r.top - m.height - 6); setPos({ top, left }); }, [anchor, align]);
  useEffect(() => { const down = e => { if (ref.current && !ref.current.contains(e.target) && !anchor.contains(e.target)) onClose(); }; const key = e => { if (e.key === "Escape") onClose(); }; document.addEventListener("mousedown", down); document.addEventListener("keydown", key); return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); }; }, [anchor, onClose]);
  return createPortal(<div className="menu" ref={ref} style={{ top: pos.top, left: pos.left, minWidth: width }}>
    {items.map((it, i) => it === "-" ? <hr key={i} /> : it.h ? <div key={i} className="h">{it.h}</div> :
      <button key={i} disabled={it.disabled} className={it.selected ? "sel" : ""} onClick={() => { onClose(); it.run && it.run(); }}>
        {it.img ? <img src={it.img} alt="" /> : it.dot ? <span className="ldot" style={{ background: it.dot }} /> : it.icon ? <it.icon size={15} strokeWidth={1.8} /> : null}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
        {it.selected ? <Check size={14} className="chk" /> : it.k ? <span className="k">{it.k}</span> : null}
      </button>)}
  </div>, document.body);
}
export function useMenu() { const [m, setM] = useState(null); return { menu: m, open: (anchor, items, opts = {}) => setM({ anchor, items, ...opts }), close: () => setM(null), el: m ? <Menu {...m} onClose={() => setM(null)} /> : null }; }
