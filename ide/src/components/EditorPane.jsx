import React, { useEffect, useRef } from "react";
import { useStore } from "../store.js";
import { mountEditor, getEditor } from "../lib/editor.js";

export default function EditorPane() {
  const host = useRef(null);
  const { fontSize, wrap, minimap } = useStore();
  useEffect(() => { mountEditor(host.current, { fontSize, wrap, minimap }); }, []);
  useEffect(() => { const e = getEditor(); if (e) e.updateOptions({ fontSize, lineHeight: Math.round(fontSize * 1.6), wordWrap: wrap ? "on" : "off", minimap: { enabled: minimap, renderCharacters: false } }); }, [fontSize, wrap, minimap]);
  return <div className="editor-wrap"><div className="editor-host" ref={host} /></div>;
}
