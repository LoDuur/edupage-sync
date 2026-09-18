/* Extra languages (Wandbox): Python, C, C++, C#, Lua – templates, completion, EOF detection */
export const LANGS_EXTRA = (() => {
  const NEED = "\x1e__NEED_INPUT__\x1e";
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
    name: "C", mode: "text/x-csrc", indent: 4, comment: "//", engine: "gcc 13 · C17",
    fileOf: () => "main.c", keywords: "auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while printf scanf puts gets fgets getchar putchar strlen strcpy strcmp strcat malloc free NULL stdin stdout EOF".split(" "),
    snippets: { main: { text: '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}', cur: { line: 3 }, k: "main" }, fori: { text: "for (int i = 0; i < n; i++) {\n    \n}", cur: { line: 1 }, k: "for loop" }, scanf: { text: 'scanf("%d", &x);', cur: 0, k: "input" }, printf: { text: 'printf("%d\\n", x);', cur: 0, k: "output" } },
    wandbox: { compiler: "gcc-13.2.0-c", ext: "c", options: "-include\nshim.h\n-Wall\n-lm", codes: () => [{ file: "shim.h", code: CSHIM }] },
    errLine: /prog\.c:(\d+):\d+: (?:fatal )?error: (.*)/g,
    template: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, world!\\n");\n    return 0;\n}\n',
    examples: [
      { name: "Hello, world", code: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, world!\\n");\n    return 0;\n}\n' },
      { name: "Input (scanf)", code: '#include <stdio.h>\n\nint main(void) {\n    char name[64];\n    int age;\n    printf("Your name: ");\n    scanf("%63s", name);\n    printf("Age: ");\n    scanf("%d", &age);\n    printf("Hello, %s! Next year you will be %d.\\n", name, age + 1);\n    return 0;\n}\n' },
      { name: "Array and function", code: '#include <stdio.h>\n\nint sum(int a[], int n) {\n    int s = 0;\n    for (int i = 0; i < n; i++) s += a[i];\n    return s;\n}\n\nint main(void) {\n    int a[] = {5, 3, 9, 1, 7};\n    int n = sizeof a / sizeof a[0];\n    printf("sum = %d\\n", sum(a, n));\n    for (int i = 1; i <= 5; i++) printf("%d ", i * i);\n    printf("\\n");\n    return 0;\n}\n' },
    ],
  };
  const cpp = {
    name: "C++", mode: "text/x-c++src", indent: 4, comment: "//", engine: "gcc 13 · C++20",
    fileOf: () => "main.cpp", keywords: "auto bool break case catch char class const constexpr continue default delete do double else enum explicit false float for friend if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef union unsigned using virtual void while std cout cin endl string vector map set pair make_pair push_back size begin end sort max min swap getline stoi to_string include iostream".split(" "),
    snippets: { main: { text: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}', cur: { line: 4 }, k: "main" }, fori: { text: "for (int i = 0; i < n; i++) {\n    \n}", cur: { line: 1 }, k: "for loop" }, cout: { text: "cout << x << endl;", cur: 0, k: "output" }, cin: { text: "cin >> x;", cur: 0, k: "input" }, vec: { text: "vector<int> v;", cur: 0, k: "vector" } },
    wandbox: { compiler: "gcc-13.2.0", ext: "cc", options: "-include\nshim.h\n-std=c++20\n-Wall", codes: () => [{ file: "shim.h", code: CSHIM }] },
    errLine: /prog\.cc:(\d+):\d+: (?:fatal )?error: (.*)/g,
    template: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, world!" << endl;\n    return 0;\n}\n',
    examples: [
      { name: "Hello, world", code: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, world!" << endl;\n    return 0;\n}\n' },
      { name: "Input (cin)", code: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string name;\n    int age;\n    cout << "Your name: ";\n    getline(cin, name);\n    cout << "Age: ";\n    cin >> age;\n    cout << "Hello, " << name << "! Next year you will be " << age + 1 << "." << endl;\n    return 0;\n}\n' },
      { name: "Vector and algorithms", code: '#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    vector<int> v = {5, 3, 9, 1, 7};\n    sort(v.begin(), v.end());\n    int sum = 0;\n    for (int x : v) sum += x;\n    cout << "array:";\n    for (int x : v) cout << " " << x;\n    cout << "\\nsum = " << sum << endl;\n    return 0;\n}\n' },
    ],
  };
  const csharp = {
    name: "C#", mode: "text/x-csharp", indent: 4, comment: "//", engine: "mono 6.12 · C# 7",
    fileOf: code => { const m = code.match(/class\s+([A-Za-z_]\w*)/); return (m ? m[1] : "Program") + ".cs"; },
    keywords: "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while Console.WriteLine Console.Write Console.ReadLine int.Parse double.Parse Convert.ToInt32 string.Format Math.Max Math.Min Math.Abs Math.Sqrt List Dictionary Length Count Add ToString Split Trim ToUpper ToLower Contains".split(" "),
    snippets: { main: { text: "using System;\n\nclass Program {\n    static void Main() {\n        \n    }\n}", cur: { line: 4 }, k: "Main" }, cw: { text: "Console.WriteLine();", cur: -2, k: "Console.WriteLine" }, rl: { text: "string s = Console.ReadLine();", cur: 0, k: "input" }, fori: { text: "for (int i = 0; i < n; i++) {\n    \n}", cur: { line: 1 }, k: "for loop" } },
    wandbox: { compiler: "mono-6.12.0.199", ext: "cs", transform: code => {
      const re = /(static\s+(?:async\s+)?(?:void|int)\s+Main\s*\([^)]*\)\s*\{)/;
      if (!re.test(code)) return code;
      return code.replace(re, "$1Console.OutputEncoding=new System.Text.UTF8Encoding(false);Console.SetIn(new __Vt(Console.In));")
        + `\nclass __Vt : System.IO.TextReader { System.IO.TextReader r; public __Vt(System.IO.TextReader x){r=x;} void N(){System.Console.Out.Flush();System.Console.Error.Write("${NEED}");System.Environment.Exit(0);} public override string ReadLine(){var l=r.ReadLine();if(l==null)N();return l;} public override int Read(){var c=r.Read();if(c<0)N();return c;} public override int Peek(){var c=r.Peek();if(c<0)N();return c;} public override string ReadToEnd(){return r.ReadToEnd();} }\n`;
    } },
    need: /ArgumentNullException|NullReferenceException/,
    errLine: /prog\.cs\((\d+),\d+\): error (.*)/g,
    template: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello, world!");\n    }\n}\n',
    examples: [
      { name: "Hello, world", code: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello, world!");\n    }\n}\n' },
      { name: "Input (ReadLine)", code: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.Write("Your name: ");\n        string name = Console.ReadLine();\n        Console.Write("Age: ");\n        int age = int.Parse(Console.ReadLine());\n        Console.WriteLine($"Hello, {name}! Next year you will be {age + 1}.");\n    }\n}\n' },
      { name: "List and LINQ", code: 'using System;\nusing System.Collections.Generic;\nusing System.Linq;\n\nclass Program {\n    static void Main() {\n        var list = new List<int> { 5, 3, 9, 1, 7 };\n        list.Sort();\n        Console.WriteLine("array: " + string.Join(" ", list));\n        Console.WriteLine("sum = " + list.Sum());\n        Console.WriteLine("even: " + string.Join(" ", list.Where(x => x % 2 == 0)));\n    }\n}\n' },
    ],
  };
  const python = {
    name: "Python", mode: "python", indent: 4, comment: "#", engine: "CPython 3.13",
    fileOf: () => "main.py", keywords: "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield print input int float str len range list dict set tuple sorted sum min max abs round enumerate zip map filter open append pop split join strip upper lower format isdigit math random".split(" "),
    snippets: { main: { text: 'def main():\n    \n\n\nif __name__ == "__main__":\n    main()', cur: { line: 1 }, k: "main" }, fori: { text: "for i in range(n):\n    ", cur: { line: 1 }, k: "for loop" }, inp: { text: 'x = int(input("Number: "))', cur: 0, k: "input" }, deff: { text: "def name(a, b):\n    return a + b", cur: 0, k: "function" } },
    wandbox: { compiler: "cpython-3.13.8", ext: "py" },
    need: /EOFError/,
    errLine: /File "prog\.py", line (\d+)(?:, in [^\n]*)?\n(?:[^\n]*\n)*?(\w+Error[^\n]*)/g,
    template: 'print("Hello, world!")\n',
    examples: [
      { name: "Hello, world", code: 'print("Hello, world!")\nprint(2 + 3)\n' },
      { name: "Input (input)", code: 'name = input("Your name: ")\nage = int(input("Age: "))\nprint(f"Hello, {name}! Next year you will be {age + 1}.")\n' },
      { name: "Lists and functions", code: 'def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nnums = [5, 3, 9, 1, 7]\nnums.sort()\nprint("array:", nums, "summa =", sum(nums))\nprint([fib(i) for i in range(10)])\n' },
    ],
  };
  const lua = {
    name: "Lua", mode: "lua", indent: 2, comment: "--", engine: "Lua 5.4",
    fileOf: () => "main.lua", keywords: "and break do else elseif end false for function goto if in local nil not or repeat return then true until while print io.read io.write tonumber tostring string.format string.sub string.len string.upper string.lower table.insert table.remove table.concat table.sort ipairs pairs math.floor math.max math.min math.sqrt math.random #".split(" "),
    snippets: { fori: { text: "for i = 1, n do\n  \nend", cur: { line: 1 }, k: "for loop" }, func: { text: "local function name(a, b)\n  return a + b\nend", cur: 0, k: "function" }, inp: { text: 'io.write("Number: ")\nlocal x = tonumber(io.read())', cur: 0, k: "input" }, ifel: { text: "if x > 0 then\n  \nelse\n  \nend", cur: { line: 1 }, k: "if / else" } },
    wandbox: { compiler: "lua-5.4.7", ext: "lua", prepend: LUASHIM },
    errLine: /prog\.lua:(\d+): (.*)/g,
    template: 'print("Hello, world!")\n',
    examples: [
      { name: "Hello, world", code: 'print("Hello, world!")\nprint(2 + 3)\n' },
      { name: "Input (io.read)", code: 'io.write("Your name: ")\nlocal name = io.read()\nio.write("Age: ")\nlocal age = tonumber(io.read())\nprint(string.format("Hello, %s! Next year you will be %d.", name, age + 1))\n' },
      { name: "Tables and functions", code: 'local function fib(n)\n  local a, b = 0, 1\n  for _ = 1, n do a, b = b, a + b end\n  return a\nend\n\nlocal t = {5, 3, 9, 1, 7}\ntable.sort(t)\nlocal sum = 0\nfor _, v in ipairs(t) do sum = sum + v end\nprint("array: " .. table.concat(t, " ") .. "  sum = " .. sum)\nfor i = 0, 9 do io.write(fib(i), " ") end\nprint()\n' },
    ],
  };
  return { NEED, list: { python, c, cpp, csharp, lua } };
})();
