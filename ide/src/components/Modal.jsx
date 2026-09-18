import React, { useEffect } from "react";
import { createPortal } from "react-dom";
export function Modal({ title, children, onClose }) {
  useEffect(() => { const k = e => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  return createPortal(<div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog"><h3>{title}</h3>{children}</div></div>, document.body);
}
