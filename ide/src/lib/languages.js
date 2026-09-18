import { JAVA } from "./java-lang.js";
import { PIL } from "./pil-lang.js";
import { LANGS_EXTRA } from "./langs-extra.js";

const X = LANGS_EXTRA.list;
export const LANGUAGES = {
  java:   { id: "java", name: "Java", file: "main.java", monaco: "java", color: "#f89820", indent: 4, template: JAVA.TEMPLATE, snippets: JAVA.SNIPPETS, keywords: [...JAVA.KEYWORDS, ...JAVA.API, ...JAVA.MEMBERS], wandbox: { compiler: "openjdk-jdk-22+36" }, need: /java\.util\.NoSuchElementException|NumberFormatException: Cannot parse null string/, cmd: "java main.java", classOf: JAVA.classNameOf },
  python: { ...X.python, id: "python", file: "main.py", monaco: "python", color: "#4b8bbe", cmd: "python3 main.py" },
  c:      { ...X.c, id: "c", file: "main.c", monaco: "c", color: "#a8b9cc", cmd: "gcc main.c -o out && ./out" },
  cpp:    { ...X.cpp, id: "cpp", file: "main.cpp", monaco: "cpp", color: "#f34b7d", cmd: "g++ main.cpp -o out && ./out" },
  csharp: { ...X.csharp, id: "csharp", file: "Program.cs", monaco: "csharp", color: "#68217a", cmd: "mcs Program.cs && mono Program.exe" },
  lua:    { ...X.lua, id: "lua", file: "main.lua", monaco: "lua", color: "#2c2d72", cmd: "lua main.lua" },
  pil:    { id: "pil", name: "PIL", file: "main.pil", monaco: "pil", color: "#8a63d2", indent: 3, template: PIL.TEMPLATE, snippets: PIL.SNIPPETS, keywords: PIL.KEYWORDS, cmd: "pil main.pil" },
};
export const ORDER = ["python", "java", "c", "cpp", "csharp", "lua", "pil"];
export const draftKey = id => "draft-" + id;
export const loadDraft = id => localStorage.getItem(draftKey(id)) || (id === "java" ? localStorage.getItem("java-draft") : id === "pil" ? localStorage.getItem("pil-draft") : null) || LANGUAGES[id].template;
export { JAVA, PIL, LANGS_EXTRA };
