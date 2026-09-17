/* Papildu valodas (Wandbox): Python, C, C++, C#, Lua – sagataves, piemēri, pabeigšana, EOF noteikšana */
const LANGS_EXTRA = (() => {
  const NEED = "\x1e__NEED_INPUT__\x1e";
  const A = {
    C: [" ██████╗", "██╔════╝", "██║     ", "██║     ", "╚██████╗", " ╚═════╝"],
    "+": ["       ", "  ██╗  ", "██████╗", "╚═██╔═╝", "  ╚═╝  ", "       "],
    "#": [" ██╗ ██╗ ", "████████╗", "╚██╔═██╔╝", "████████╗", "╚██╔═██╔╝", " ╚═╝ ╚═╝ "],
    P: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔═══╝ ", "██║     ", "╚═╝     "],
    Y: ["██╗   ██╗", "╚██╗ ██╔╝", " ╚████╔╝ ", "  ╚██╔╝  ", "   ██║   ", "   ╚═╝   "],
    T: ["████████╗", "╚══██╔══╝", "   ██║   ", "   ██║   ", "   ██║   ", "   ╚═╝   "],
    H: ["██╗  ██╗", "██║  ██║", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
    O: [" ██████╗ ", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
    N: ["███╗   ██╗", "████╗  ██║", "██╔██╗ ██║", "██║╚██╗██║", "██║ ╚████║", "╚═╝  ╚═══╝"],
    L: ["██╗     ", "██║     ", "██║     ", "██║     ", "███████╗", "╚══════╝"],
    U: ["██╗   ██╗", "██║   ██║", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
    A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  };
  const banner = word => Array.from({ length: 6 }, (_, i) => [...word].map(ch => A[ch][i]).join("")).join("\n");

  const CSHIM = `#include <stdio.h>
#include <stdlib.h>
#ifdef __cplusplus
#include <iostream>
#include <streambuf>
extern "C" {
#endif
__attribute__((unused)) static void __vt_need(void) { fflush(stdout); fputs("\\n${NEED}", stderr); fflush(stderr); exit(0); }
__attribute__((unused)) static void __vt_chk(void) { int c = getc(stdin); if (c == EOF) __vt_need(); ungetc(c, stdin); }
#ifdef __cplusplus
}
struct __VtBuf : std::streambuf {
  std::streambuf* in; char nl; bool any; int last;
  explicit __VtBuf(std::streambuf* b) : in(b), nl('\\n'), any(false), last(0) {}
  int underflow() override { int c = in->sgetc(); if (c != EOF) return c; if (any && last != '\\n') { last = '\\n'; setg(&nl, &nl, &nl + 1); return '\\n'; } __vt_need(); return EOF; }
  int uflow() override { if (gptr() && gptr() < egptr()) { gbump(1); return '\\n'; } int c = in->sbumpc(); if (c != EOF) { any = true; last = c; return c; } if (any && last != '\\n') { last = '\\n'; return '\\n'; } __vt_need(); return EOF; }
  int pbackfail(int c) override { return c == EOF ? in->sungetc() : in->sputbackc((char)c); }
};
static struct __VtInit { __VtInit() { static __VtBuf b(std::cin.rdbuf()); std::cin.rdbuf(&b); } } __vt_init;
#endif
#define scanf(...) (__vt_chk(), scanf(__VA_ARGS__))
#define getchar() (__vt_chk(), getchar())
#define gets(s) (__vt_chk(), gets(s))
#define fgets(s, n, f) (((f) == stdin ? (__vt_chk(), 0) : 0), fgets((s), (n), (f)))
#define getc(f) (((f) == stdin ? (__vt_chk(), 0) : 0), getc(f))
#define fgetc(f) (((f) == stdin ? (__vt_chk(), 0) : 0), fgetc(f))
`;
  const LUASHIM = `do local r=io.read;io.read=function(...) local a={r(...)} if a[1]==nil then io.stdout:flush() io.stderr:write("${NEED}") os.exit(0) end return table.unpack(a) end end;`;

  const c = {
    name: "C", mode: "text/x-csrc", indent: 4, comment: "//", engine: "WANDBOX · GCC 13", banner: banner("C"),
    meta: '∞ <b>KOMPILATORS</b> · GCC 13 · C17<br>TAB PABEIDZ · CTRL+↵ PALAIŽ · CTRL+S SAGLABĀ<br>IEVADE PROGRAMMAI – TERMINĀLĪ ZEM IZVADES',
    fileOf: () => "main.c", keywords: "auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while printf scanf puts gets fgets getchar putchar strlen strcpy strcmp strcat malloc free NULL stdin stdout EOF".split(" "),
    snippets: { main: { text: '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}', cur: { line: 3 }, k: "main" }, fori: { text: "for (int i = 0; i < n; i++) {\n    \n}", cur: { line: 1 }, k: "for cikls" }, scanf: { text: 'scanf("%d", &x);', cur: 0, k: "ievade" }, printf: { text: 'printf("%d\\n", x);', cur: 0, k: "izvade" } },
    wandbox: { compiler: "gcc-13.2.0-c", ext: "c", options: "-include\nshim.h\n-Wall\n-lm", codes: () => [{ file: "shim.h", code: CSHIM }] },
    errLine: /prog\.c:(\d+):\d+: (?:fatal )?error: (.*)/g,
    template: '#include <stdio.h>\n\nint main(void) {\n    printf("Sveika, pasaule!\\n");\n    return 0;\n}\n',
    examples: [
      { name: "Sveika, pasaule", code: '#include <stdio.h>\n\nint main(void) {\n    printf("Sveika, pasaule!\\n");\n    return 0;\n}\n' },
      { name: "Ievade (scanf)", code: '#include <stdio.h>\n\nint main(void) {\n    char name[64];\n    int age;\n    printf("Tavs vārds: ");\n    scanf("%63s", name);\n    printf("Vecums: ");\n    scanf("%d", &age);\n    printf("Sveiks, %s! Nākamgad tev būs %d.\\n", name, age + 1);\n    return 0;\n}\n' },
      { name: "Masīvs un funkcija", code: '#include <stdio.h>\n\nint sum(int a[], int n) {\n    int s = 0;\n    for (int i = 0; i < n; i++) s += a[i];\n    return s;\n}\n\nint main(void) {\n    int a[] = {5, 3, 9, 1, 7};\n    int n = sizeof a / sizeof a[0];\n    printf("summa = %d\\n", sum(a, n));\n    for (int i = 1; i <= 5; i++) printf("%d ", i * i);\n    printf("\\n");\n    return 0;\n}\n' },
    ],
  };
  const cpp = {
    name: "C++", mode: "text/x-c++src", indent: 4, comment: "//", engine: "WANDBOX · GCC 13 · C++20", banner: banner("C++"),
    meta: '∞ <b>KOMPILATORS</b> · GCC 13 · C++20<br>TAB PABEIDZ · CTRL+↵ PALAIŽ · CTRL+S SAGLABĀ<br>IEVADE PROGRAMMAI – TERMINĀLĪ ZEM IZVADES',
    fileOf: () => "main.cpp", keywords: "auto bool break case catch char class const constexpr continue default delete do double else enum explicit false float for friend if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef union unsigned using virtual void while std cout cin endl string vector map set pair make_pair push_back size begin end sort max min swap getline stoi to_string include iostream".split(" "),
    snippets: { main: { text: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}', cur: { line: 4 }, k: "main" }, fori: { text: "for (int i = 0; i < n; i++) {\n    \n}", cur: { line: 1 }, k: "for cikls" }, cout: { text: "cout << x << endl;", cur: 0, k: "izvade" }, cin: { text: "cin >> x;", cur: 0, k: "ievade" }, vec: { text: "vector<int> v;", cur: 0, k: "vektors" } },
    wandbox: { compiler: "gcc-13.2.0", ext: "cc", options: "-include\nshim.h\n-std=c++20\n-Wall", codes: () => [{ file: "shim.h", code: CSHIM }] },
    errLine: /prog\.cc:(\d+):\d+: (?:fatal )?error: (.*)/g,
    template: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Sveika, pasaule!" << endl;\n    return 0;\n}\n',
    examples: [
      { name: "Sveika, pasaule", code: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Sveika, pasaule!" << endl;\n    return 0;\n}\n' },
      { name: "Ievade (cin)", code: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string name;\n    int age;\n    cout << "Tavs vārds: ";\n    getline(cin, name);\n    cout << "Vecums: ";\n    cin >> age;\n    cout << "Sveiks, " << name << "! Nākamgad tev būs " << age + 1 << "." << endl;\n    return 0;\n}\n' },
      { name: "Vektors un algoritmi", code: '#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    vector<int> v = {5, 3, 9, 1, 7};\n    sort(v.begin(), v.end());\n    int sum = 0;\n    for (int x : v) sum += x;\n    cout << "masīvs:";\n    for (int x : v) cout << " " << x;\n    cout << "\\nsumma = " << sum << endl;\n    return 0;\n}\n' },
    ],
  };
  const csharp = {
    name: "C#", mode: "text/x-csharp", indent: 4, comment: "//", engine: "WANDBOX · MONO 6.12", banner: banner("C#"),
    meta: '∞ <b>KOMPILATORS</b> · MONO 6.12 · C# 7<br>TAB PABEIDZ · CTRL+↵ PALAIŽ · CTRL+S SAGLABĀ<br>IEVADE PROGRAMMAI – TERMINĀLĪ ZEM IZVADES',
    fileOf: code => { const m = code.match(/class\s+([A-Za-z_]\w*)/); return (m ? m[1] : "Program") + ".cs"; },
    keywords: "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while Console.WriteLine Console.Write Console.ReadLine int.Parse double.Parse Convert.ToInt32 string.Format Math.Max Math.Min Math.Abs Math.Sqrt List Dictionary Length Count Add ToString Split Trim ToUpper ToLower Contains".split(" "),
    snippets: { main: { text: "using System;\n\nclass Program {\n    static void Main() {\n        \n    }\n}", cur: { line: 4 }, k: "Main" }, cw: { text: "Console.WriteLine();", cur: -2, k: "Console.WriteLine" }, rl: { text: "string s = Console.ReadLine();", cur: 0, k: "ievade" }, fori: { text: "for (int i = 0; i < n; i++) {\n    \n}", cur: { line: 1 }, k: "for cikls" } },
    wandbox: { compiler: "mono-6.12.0.199", ext: "cs", transform: code => {
      const re = /(static\s+(?:async\s+)?(?:void|int)\s+Main\s*\([^)]*\)\s*\{)/;
      if (!re.test(code)) return code;
      return code.replace(re, "$1Console.OutputEncoding=new System.Text.UTF8Encoding(false);Console.SetIn(new __Vt(Console.In));")
        + `\nclass __Vt : System.IO.TextReader { System.IO.TextReader r; public __Vt(System.IO.TextReader x){r=x;} void N(){System.Console.Out.Flush();System.Console.Error.Write("${NEED}");System.Environment.Exit(0);} public override string ReadLine(){var l=r.ReadLine();if(l==null)N();return l;} public override int Read(){var c=r.Read();if(c<0)N();return c;} public override int Peek(){var c=r.Peek();if(c<0)N();return c;} public override string ReadToEnd(){return r.ReadToEnd();} }\n`;
    } },
    need: /ArgumentNullException|NullReferenceException/,
    errLine: /prog\.cs\((\d+),\d+\): error (.*)/g,
    template: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Sveika, pasaule!");\n    }\n}\n',
    examples: [
      { name: "Sveika, pasaule", code: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Sveika, pasaule!");\n    }\n}\n' },
      { name: "Ievade (ReadLine)", code: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.Write("Tavs vārds: ");\n        string name = Console.ReadLine();\n        Console.Write("Vecums: ");\n        int age = int.Parse(Console.ReadLine());\n        Console.WriteLine($"Sveiks, {name}! Nākamgad tev būs {age + 1}.");\n    }\n}\n' },
      { name: "Saraksts un LINQ", code: 'using System;\nusing System.Collections.Generic;\nusing System.Linq;\n\nclass Program {\n    static void Main() {\n        var list = new List<int> { 5, 3, 9, 1, 7 };\n        list.Sort();\n        Console.WriteLine("masīvs: " + string.Join(" ", list));\n        Console.WriteLine("summa = " + list.Sum());\n        Console.WriteLine("pāra: " + string.Join(" ", list.Where(x => x % 2 == 0)));\n    }\n}\n' },
    ],
  };
  const python = {
    name: "Python", mode: "python", indent: 4, comment: "#", engine: "WANDBOX · CPYTHON 3.13", banner: banner("PYTHON"),
    meta: '∞ <b>INTERPRETATORS</b> · CPYTHON 3.13<br>TAB PABEIDZ · CTRL+↵ PALAIŽ · CTRL+S SAGLABĀ<br>IEVADE PROGRAMMAI – TERMINĀLĪ ZEM IZVADES',
    fileOf: () => "main.py", keywords: "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield print input int float str len range list dict set tuple sorted sum min max abs round enumerate zip map filter open append pop split join strip upper lower format isdigit math random".split(" "),
    snippets: { main: { text: 'def main():\n    \n\n\nif __name__ == "__main__":\n    main()', cur: { line: 1 }, k: "main" }, fori: { text: "for i in range(n):\n    ", cur: { line: 1 }, k: "for cikls" }, inp: { text: 'x = int(input("Skaitlis: "))', cur: 0, k: "ievade" }, deff: { text: "def name(a, b):\n    return a + b", cur: 0, k: "funkcija" } },
    wandbox: { compiler: "cpython-3.13.8", ext: "py" },
    need: /EOFError/,
    errLine: /File "prog\.py", line (\d+)(?:, in [^\n]*)?\n(?:[^\n]*\n)*?(\w+Error[^\n]*)/g,
    template: 'print("Sveika, pasaule!")\n',
    examples: [
      { name: "Sveika, pasaule", code: 'print("Sveika, pasaule!")\nprint(2 + 3)\n' },
      { name: "Ievade (input)", code: 'name = input("Tavs vārds: ")\nage = int(input("Vecums: "))\nprint(f"Sveiks, {name}! Nākamgad tev būs {age + 1}.")\n' },
      { name: "Saraksti un funkcijas", code: 'def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nnums = [5, 3, 9, 1, 7]\nnums.sort()\nprint("masīvs:", nums, "summa =", sum(nums))\nprint([fib(i) for i in range(10)])\n' },
    ],
  };
  const lua = {
    name: "Lua", mode: "lua", indent: 2, comment: "--", engine: "WANDBOX · LUA 5.4", banner: banner("LUA"),
    meta: '∞ <b>INTERPRETATORS</b> · LUA 5.4<br>TAB PABEIDZ · CTRL+↵ PALAIŽ · CTRL+S SAGLABĀ<br>IEVADE PROGRAMMAI – TERMINĀLĪ ZEM IZVADES',
    fileOf: () => "main.lua", keywords: "and break do else elseif end false for function goto if in local nil not or repeat return then true until while print io.read io.write tonumber tostring string.format string.sub string.len string.upper string.lower table.insert table.remove table.concat table.sort ipairs pairs math.floor math.max math.min math.sqrt math.random #".split(" "),
    snippets: { fori: { text: "for i = 1, n do\n  \nend", cur: { line: 1 }, k: "for cikls" }, func: { text: "local function name(a, b)\n  return a + b\nend", cur: 0, k: "funkcija" }, inp: { text: 'io.write("Skaitlis: ")\nlocal x = tonumber(io.read())', cur: 0, k: "ievade" }, ifel: { text: "if x > 0 then\n  \nelse\n  \nend", cur: { line: 1 }, k: "if / else" } },
    wandbox: { compiler: "lua-5.4.7", ext: "lua", prepend: LUASHIM },
    errLine: /prog\.lua:(\d+): (.*)/g,
    template: 'print("Sveika, pasaule!")\n',
    examples: [
      { name: "Sveika, pasaule", code: 'print("Sveika, pasaule!")\nprint(2 + 3)\n' },
      { name: "Ievade (io.read)", code: 'io.write("Tavs vārds: ")\nlocal name = io.read()\nio.write("Vecums: ")\nlocal age = tonumber(io.read())\nprint(string.format("Sveiks, %s! Nākamgad tev būs %d.", name, age + 1))\n' },
      { name: "Tabulas un funkcijas", code: 'local function fib(n)\n  local a, b = 0, 1\n  for _ = 1, n do a, b = b, a + b end\n  return a\nend\n\nlocal t = {5, 3, 9, 1, 7}\ntable.sort(t)\nlocal sum = 0\nfor _, v in ipairs(t) do sum = sum + v end\nprint("masīvs: " .. table.concat(t, " ") .. "  summa = " .. sum)\nfor i = 0, 9 do io.write(fib(i), " ") end\nprint()\n' },
    ],
  };
  return { NEED, list: { python, c, cpp, csharp, lua } };
})();
