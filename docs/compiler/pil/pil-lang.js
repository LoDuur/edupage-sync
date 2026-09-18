/* PIL (github.com/Acerx-AMJ/PIL): CodeMirror režīms, pabeigšanas dati, piemēri, valodas apraksts */
const PIL = (() => {
  const B = {
    "print": "VĒRTĪBA, … · izvada bez jaunas rindas", "println": "VĒRTĪBA, … · izvada ar jaunu rindu", "printf": "FORMĀTS, … · {} aizvieto", "printfln": "FORMĀTS, … · {} aizvieto + jauna rinda", "printch": "SIMBOLS",
    "read": "MĒRĶIS · nolasa vārdu", "readln": "MĒRĶIS · nolasa rindu", "readch": "MĒRĶIS · nolasa simbolu", "setecho": "0|1",
    "set": "VĒRTĪBA, MĒRĶIS", "swap": "A, B", "incr": "MAINĪGAIS", "decr": "MAINĪGAIS",
    "add": "A, B, …, MĒRĶIS", "sub": "A, B, …, MĒRĶIS", "mul": "A, B, …, MĒRĶIS", "div": "A, B, …, MĒRĶIS", "mod": "A, B, MĒRĶIS", "floor-mod": "A, B, MĒRĶIS", "pow": "A, B, MĒRĶIS", "neg": "N, MĒRĶIS",
    "sqrt": "N, MĒRĶIS", "cbrt": "N, MĒRĶIS", "abs": "N, MĒRĶIS", "sign": "N, MĒRĶIS", "min": "A, B, …, MĒRĶIS", "max": "A, B, …, MĒRĶIS", "clamp": "N, NO, LĪDZ, MĒRĶIS",
    "trunc": "N, MĒRĶIS", "ceil": "N, MĒRĶIS", "floor": "N, MĒRĶIS", "round": "N, MĒRĶIS", "exp": "N, MĒRĶIS", "ln": "N, MĒRĶIS", "log": "N, BĀZE, MĒRĶIS", "log2": "N, MĒRĶIS", "log10": "N, MĒRĶIS",
    "sin": "N, MĒRĶIS", "cos": "N, MĒRĶIS", "tan": "N, MĒRĶIS", "asin": "N, MĒRĶIS", "acos": "N, MĒRĶIS", "atan": "N, MĒRĶIS", "atan2": "Y, X, MĒRĶIS", "sinh": "N, MĒRĶIS", "cosh": "N, MĒRĶIS", "tanh": "N, MĒRĶIS", "asinh": "N, MĒRĶIS", "acosh": "N, MĒRĶIS", "atanh": "N, MĒRĶIS",
    "lerp": "A, B, T, MĒRĶIS", "step-towards": "NO, UZ, SOLIS, MĒRĶIS", "hypot": "A, B, MĒRĶIS", "hypot3": "A, B, C, MĒRĶIS", "gcd": "A, B, MĒRĶIS", "lcm": "A, B, MĒRĶIS",
    "seed-random": "SĒKLA", "random": "MĒRĶIS · 0..1", "randf-range": "NO, LĪDZ, MĒRĶIS", "randi-range": "NO, LĪDZ, MĒRĶIS",
    "bit-and": "A, B, MĒRĶIS", "bit-or": "A, B, MĒRĶIS", "bit-xor": "A, B, MĒRĶIS", "bit-not": "A, MĒRĶIS", "bit-shl": "A, N, MĒRĶIS", "bit-shr": "A, N, MĒRĶIS", "bit-count": "A, MĒRĶIS", "bit-test": "A, BITS, MĒRĶIS", "bit-set": "A, BITS, MĒRĶIS", "bit-clear": "A, BITS, MĒRĶIS", "bit-toggle": "A, BITS, MĒRĶIS",
    "le": "A, B, MĒRĶIS · A < B", "gr": "A, B, MĒRĶIS · A > B", "leeq": "A, B, MĒRĶIS · A ≤ B", "greq": "A, B, MĒRĶIS · A ≥ B", "eq": "A, B, MĒRĶIS · A = B", "neq": "A, B, MĒRĶIS · A ≠ B", "and": "A, B, MĒRĶIS", "or": "A, B, MĒRĶIS", "not": "A, MĒRĶIS",
    "goto": "IEZĪME", "jmp": "NOSACĪJUMS, IEZĪME", "jmpn": "NOSACĪJUMS, IEZĪME · ja nepatiess", "jmptable": "VĒRTĪBA, V1, IEZĪME1, …",
    "call": "MĒRĶIS, FUNKCIJA, ARG… · rezultāts mērķī", "func-call": "FUNKCIJA, ARG…, MĒRĶIS", "return": "VĒRTĪBA, …",
    "catch": "MĒRĶIS, FUNKCIJA, ARG…", "assert": "NOSACĪJUMS, ZIŅA", "warn": "ZIŅA", "error": "ZIŅA", "exit": "KODS",
    "stack-depth": "MĒRĶIS", "stack-name": "MĒRĶIS", "stack-line": "MĒRĶIS", "stack-file": "MĒRĶIS", "stack-trace": "",
    "typeof": "V, MĒRĶIS · int float char string array…", "is-num": "V, MĒRĶIS", "is-float": "V, MĒRĶIS", "is-int": "V, MĒRĶIS", "is-char": "V, MĒRĶIS", "is-string": "V, MĒRĶIS", "is-array": "V, MĒRĶIS", "is-reg": "V, MĒRĶIS", "is-function": "V, MĒRĶIS", "is-label": "V, MĒRĶIS", "is-null": "V, MĒRĶIS", "is-inf": "V, MĒRĶIS", "is-nan": "V, MĒRĶIS",
    "to-int": "V, MĒRĶIS · null, ja neder", "to-float": "V, MĒRĶIS · null, ja neder", "to-char": "V, MĒRĶIS",
    "time": "MĒRĶIS · ms", "unix-time": "MĒRĶIS", "date": "FORMĀTS, MĒRĶIS", "sleep": "MS",
    "valtable": "ATSLĒGA, MĒRĶIS, K1, V1, …", "table-contains": "ATSLĒGA, MĒRĶIS, K1, …",
    "variadic-size": "MĒRĶIS", "variadic-idx": "I, MĒRĶIS", "reg-size": "MĒRĶIS", "reg-idx": "I, MĒRĶIS", "reg-set": "I, VĒRTĪBA", "return-reg-size": "MĒRĶIS", "return-reg-idx": "I, MĒRĶIS", "return-reg-set": "I, VĒRTĪBA", "return-count": "MĒRĶIS",
    "func-arity": "FUNKCIJA, MĒRĶIS", "func-variadic": "FUNKCIJA, MĒRĶIS", "func-arg-match": "FUNKCIJA, N, MĒRĶIS",
    "string-new": "MĒRĶIS, DAĻA, … · jauna virkne (jāatbrīvo)", "string-fmt": "MĒRĶIS, FORMĀTS, …", "string-repeat": "MĒRĶIS, V, N", "string-free": "VIRKNE, …", "string-copy": "VIRKNE, MĒRĶIS", "string-size": "VIRKNE, MĒRĶIS", "string-empty": "VIRKNE, MĒRĶIS", "string-clear": "VIRKNE",
    "string-idx": "VIRKNE, I, MĒRĶIS", "string-set": "VIRKNE, I, SIMBOLS", "string-push": "VIRKNE, V", "string-pop": "VIRKNE", "string-back": "VIRKNE, MĒRĶIS", "string-front": "VIRKNE, MĒRĶIS", "string-insert": "VIRKNE, I, V", "string-erase": "VIRKNE, I", "string-erase-all": "VIRKNE, V",
    "string-concat": "VIRKNE, V", "string-substr": "VIRKNE, NO, GARUMS, MĒRĶIS", "string-split": "VIRKNE, DALĪTĀJS, MĒRĶIS · masīvs", "string-count": "VIRKNE, V, MĒRĶIS", "string-reverse": "VIRKNE", "string-trim": "VIRKNE", "string-to-lower": "VIRKNE", "string-to-upper": "VIRKNE",
    "string-find": "VIRKNE, V, NO, MĒRĶIS", "string-rfind": "VIRKNE, V, NO, MĒRĶIS", "string-contains": "VIRKNE, V, MĒRĶIS", "string-starts-with": "VIRKNE, V, MĒRĶIS", "string-ends-with": "VIRKNE, V, MĒRĶIS", "string-replace": "VIRKNE, VECAIS, JAUNAIS, MĒRĶIS", "string-replace-all": "VIRKNE, VECAIS, JAUNAIS",
    "string-find-first-of": "VIRKNE, SIMBOLI, MĒRĶIS", "string-find-first-not-of": "VIRKNE, SIMBOLI, MĒRĶIS", "string-find-last-of": "VIRKNE, SIMBOLI, MĒRĶIS", "string-find-last-not-of": "VIRKNE, SIMBOLI, MĒRĶIS",
    "string-capacity": "VIRKNE, MĒRĶIS", "string-reserve": "VIRKNE, N", "string-resize": "VIRKNE, N, SIMBOLS", "string-memfree": "VIRKNE", "string-mark": "VIRKNE, MARĶIERIS", "string-get-mark": "VIRKNE, MĒRĶIS", "string-free-marked": "MARĶIERIS",
    "array-new": "MĒRĶIS, V, … · jauns masīvs (jāatbrīvo)", "array-fill": "MĒRĶIS, N, V", "array-iota": "MĒRĶIS, N, SĀKUMS", "array-free": "MASĪVS, …", "array-deep-free": "MASĪVS", "array-size": "MASĪVS, MĒRĶIS", "array-empty": "MASĪVS, MĒRĶIS", "array-clear": "MASĪVS",
    "array-idx": "MASĪVS, I, MĒRĶIS", "array-set": "MASĪVS, I, V", "array-push": "MASĪVS, V", "array-pop": "MASĪVS", "array-back": "MASĪVS, MĒRĶIS", "array-front": "MASĪVS, MĒRĶIS", "array-insert": "MASĪVS, I, V", "array-erase": "MASĪVS, I", "array-erase-all": "MASĪVS, V",
    "array-join": "MASĪVS, DALĪTĀJS, MĒRĶIS · virkne", "array-concat": "MASĪVS, MASĪVS2, MĒRĶIS", "array-slice": "MASĪVS, NO, LĪDZ, MĒRĶIS", "array-shuffle": "MASĪVS", "array-sort": "MASĪVS, DILSTOŠI", "array-count": "MASĪVS, V, MĒRĶIS", "array-reverse": "MASĪVS", "array-find": "MASĪVS, V, MĒRĶIS", "array-contains": "MASĪVS, V, MĒRĶIS",
    "array-shallow-copy": "MASĪVS, MĒRĶIS", "array-deep-copy": "MASĪVS, MĒRĶIS", "array-capacity": "MASĪVS, MĒRĶIS", "array-reserve": "MASĪVS, N", "array-resize": "MASĪVS, N, V", "array-memfree": "MASĪVS", "array-mark": "MASĪVS, MARĶIERIS", "array-get-mark": "MASĪVS, MĒRĶIS", "array-free-marked": "MARĶIERIS",
    "map-new": "MĒRĶIS, K1, V1, …", "map-free": "MAPE, …", "map-deep-free": "MAPE, …", "map-mark": "MAPE, MARĶIERIS", "map-get-mark": "MAPE, MĒRĶIS", "map-free-marked": "MARĶIERIS", "map-shallow-copy": "MAPE, MĒRĶIS", "map-deep-copy": "MAPE, MĒRĶIS", "map-erase": "MAPE, ATSLĒGA", "map-set": "MAPE, ATSLĒGA, V", "map-at": "MAPE, ATSLĒGA, MĒRĶIS", "map-contains": "MAPE, ATSLĒGA, MĒRĶIS", "map-size": "MAPE, MĒRĶIS", "map-empty": "MAPE, MĒRĶIS", "map-clear": "MAPE", "map-keys": "MAPE, MĒRĶIS", "map-values": "MAPE, MĒRĶIS", "map-merge": "MAPE, MAPE2, MĒRĶIS",
  };
  const BUILTINS = Object.keys(B).map(n => ({ n, sig: B[n] }));
  const BUILTIN_SET = new Set(Object.keys(B));
  const KEYWORDS = ["let", "const", "main"];
  const DIRECTIVES = ["@include", "@reg-size", "@return-reg-size"];
  const MATH = "abs min max sqrt cbrt sin cos tan asin acos atan atan2 asinh acosh atanh sinh cosh tanh clamp sign trunc ceil floor round exp ln log log2 log10 lerp if pi tau e hypot gcd lcm".split(" ");

  CodeMirror.defineMode("pil", () => {
    const ident = /[A-Za-z_][\w-]*/;
    return {
      startState: () => ({ sol: true }),
      token(stream, state) {
        if (stream.sol()) state.sol = true;
        if (stream.eatSpace()) return null;
        const ch = stream.peek();
        if (ch === ";") { stream.skipToEnd(); return "comment"; }
        if (ch === '"') { stream.next(); let esc = false; while (!stream.eol()) { const c = stream.next(); if (!esc && c === '"') break; esc = !esc && c === "\\"; } state.sol = false; return "string"; }
        if (ch === "'") { stream.next(); let esc = false; while (!stream.eol()) { const c = stream.next(); if (!esc && c === "'") break; esc = !esc && c === "\\"; } state.sol = false; return "string-2"; }
        if (stream.match(/^R?\$\d+/)) { state.sol = false; return "variable-2"; }
        if (stream.match(/^@[\w-]+/)) { state.sol = false; return "meta"; }
        if (stream.match(/^-?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?/)) { state.sol = false; return "number"; }
        if (stream.match(/^\.\.\./)) return "keyword";
        if (stream.match(ident)) {
          const w = stream.current(), first = state.sol; state.sol = false;
          if (first && stream.match(/^\s*\(/, false)) return "def";
          if (first && stream.match(/^\s*:/, false)) return "def";
          if (w === "let" || w === "const") return "keyword";
          if (BUILTIN_SET.has(w)) return first ? "builtin" : "variable";
          return first ? "atom" : "variable";
        }
        stream.next(); state.sol = false;
        return /[\[\](){},:]/.test(ch) ? "bracket" : "operator";
      },
      lineComment: ";",
    };
  });
  CodeMirror.defineMIME("text/x-pil", "pil");

  const SNIPPETS = {
    main: { text: "main()\n   println \"Sveika, pasaule!\"\n", cur: { line: 1 }, k: "programmas sākums" },
    func: { text: "name(a, b) let result\n   add a, b, result\n   return result\n", cur: { line: 1 }, k: "funkcija" },
    loop: { text: "set 0, $0\nloop:\n   println $0\n   incr $0\n   le $0, 10, $1\n   jmp $1, loop\n", cur: { line: 2 }, k: "cikls 0..9" },
    if: { text: "set 7, $0\ngr $0, 5, $1\njmpn $1, else\n   println \"lielāks par 5\"\n   goto end\nelse:\n   println \"nav lielāks\"\nend:\n", cur: { line: 3 }, k: "if / else" },
    readnum: { text: "print \"Ievadi skaitli: \"\nreadln $0\nto-int $0, $1\nstring-free $0\n", cur: { line: 3 }, k: "nolasīt skaitli" },
    readtxt: { text: "print \"Ievadi tekstu: \"\nreadln $0\n", cur: { line: 1 }, k: "nolasīt rindu" },
    arr: { text: "array-new $0, 1, 2, 3\narray-size $0, $1\nprintln $0\narray-free $0\n", cur: { line: 3 }, k: "masīvs" },
    str: { text: "string-new $0, \"a\", \"b\"\nprintln $0\nstring-free $0\n", cur: { line: 2 }, k: "virkne" },
    const: { text: "const NAME 10\n", cur: -3, k: "konstante (faila līmenī)" },
    callr: { text: "call $0, name, 1, 2\n", cur: 0, k: "izsaukt un saglabāt rezultātu" },
  };

  const EXAMPLES = [
    { name: "Sveika, pasaule", code: `; PIL – maza interpretēta valoda COBOL + asemblera stilā.
; Programma sākas funkcijā main. Komentāri sākas ar ;
main()
   println "Sveika, pasaule!"
   add 2, 3, $0          ; $0 = 2 + 3
   printfln "2 + 3 = {}", $0
` },
    { name: "Faktoriāls", code: `; rekursīvs faktoriāls: n! = n * (n-1)!
factorial(n) let minus1, result
   leeq n, 1, $0                 ; $0 = n <= 1
   jmp $0, factorial-end         ; ja jā – atgriež 1

   sub n, 1, minus1
   call result, factorial, minus1
   mul result, n, result
   return result
factorial-end:
   return 1

main()
   factorial 5
   printfln "5! = {}", R$0       ; R$0 – atgrieztā vērtība
` },
    { name: "Cikls 1..10", code: `main()
   set 1, $1          ; skaitītājs
   set 10, $2         ; līdz
loop:
   print $1, " "
   add $1, 1, $1
   leeq $1, $2, $3
   jmp $3, loop
   println ""
` },
    { name: "Fibonači", code: `fib-iterative(n) let prev1, prev2, curr
   leeq n, 1, $0
   jmp $0, fib-end
   set n, $1
   set 1, prev1
   set 0, prev2
   set 0, curr
fib-loop:
   add prev1, prev2, curr
   set prev1, prev2
   set curr, prev1
   decr $1
   gr $1, 1, $2
   jmp $2, fib-loop
   return curr
fib-end:
   return n

main()
   set 0, $5
print-loop:
   call $6, fib-iterative, $5
   printfln "fib({}) = {}", $5, $6
   incr $5
   le $5, 15, $7
   jmp $7, print-loop
` },
    { name: "Ievade (stdin)", code: `; nolasa vārdu un vecumu – ieraksti tos terminālī, kad programma gaida
main() let name, age
   print "Tavs vārds: "
   readln name
   print "Vecums: "
   readln $0
   to-int $0, age
   string-free $0
   is-null age, $1
   jmp $1, bad-age
   add age, 1, $2
   printfln "Sveiks, {}! Nākamgad tev būs {}.", name, $2
   string-free name
   return
bad-age:
   println "Vecumam jābūt skaitlim."
   string-free name
` },
    { name: "Kalkulators", code: `input-number(msg) let input, tmp
   goto input-number-start
input-number-error:
   println "Nederīga ievade, mēģini vēlreiz."
input-number-start:
   print msg
   readln tmp
   to-float tmp, input
   string-free tmp
   is-null input, tmp
   jmp tmp, input-number-error
   return input

calculate(n1, n2, op) let fn, tmp, result
   valtable op, fn, '+', add, '-', sub, '*', mul, '/', div, '%', mod, '^', pow
   is-null fn, tmp
   jmpn tmp, valid-op
   println "Nederīgs operators."
   return 0.0
valid-op:
   func-call fn, n1, n2, result
   return result

main() let n1, n2, op
   call n1, input-number, "Pirmais skaitlis: "
   call n2, input-number, "Otrais skaitlis: "
   print "Operators (+,-,*,/,%,^): "
   readln $0
   string-idx $0, 0, op        ; pirmais simbols no rindas
   string-free $0
   println ""
   calculate n1, n2, op
   printfln "{} {} {} = {}", n1, op, n2, R$0
` },
    { name: "Masīvi un virknes", code: `main() let arr, s, n, i
   array-new arr, 5, 3, 9, 1
   array-push arr, 7
   array-sort arr, 0
   array-size arr, n
   printfln "masīvs {} ({} elementi)", arr, n

   set 0, i
   set 0, $1                  ; reģistri sākumā ir null – jāinicializē
sum-loop:
   array-idx arr, i, $0
   add $1, $0, $1
   incr i
   le i, n, $2
   jmp $2, sum-loop
   printfln "summa = {}", $1

   string-new s, "Valmieras ", "tehnikums"
   string-to-upper s
   string-size s, $3
   printfln "{} ({} simboli)", s, $3

   array-free arr
   string-free s
` },
    { name: "Konstantes un [matemātika]", code: `@reg-size 8
const LIMIT 3
const TITLE "Tabula līdz \${LIMIT}, pi = $[pi()]"

main()
   println TITLE
   set [ 2 ** 3 - 7 ], $0     ; [ ] – izteiksme no konstantēm (aprēķina pirms izpildes)
row:
   mul $0, $0, $1
   sqrt $1, $2
   printfln "{}^2 = {}  sqrt = {}", $0, $1, $2
   incr $0
   leeq $0, LIMIT, $3
   jmp $3, row
` },
  ];

  const DOC_TEXT = `PIL sintakse: fails sastāv no funkcijām, funkcija – no komandām (katra savā rindā, argumenti atdalīti ar komatu). Programma sākas funkcijā main(). Komentāri sākas ar ;.
Funkcijas definīcija: name(a, b) let lok1, lok2  (let – lokālie mainīgie, tajā pašā rindā). Iezīme: name: (savā rindā). Lēcieni: goto IEZĪME; jmp NOSACĪJUMS, IEZĪME (ja patiess); jmpn NOSACĪJUMS, IEZĪME (ja nepatiess). Nav if/while/for – tikai iezīmes un lēcieni.
Vērtību glabāšana: reģistri $0..$15, atgriešanas reģistri R$0..R$3 (return VĒRTĪBA tur ieliek), parametri, let lokālie, const NAME VĒRTĪBA faila līmenī (nav mainīgu globālo). Gandrīz visām komandām PĒDĒJAIS arguments ir MĒRĶIS, kur ielikt rezultātu: add 2, 3, $0 nozīmē $0 = 2 + 3.
Funkcijas izsaukums: name arg1, arg2 (rezultāts R$0) vai call MĒRĶIS, name, arg1, arg2.
Tipi: int, float, char 'a', string "teksts", masīvs, null. Matemātiskas izteiksmes kvadrātiekavās set [2 ** 10 + sqrt(16)], $0 aprēķina PIRMS izpildes – tajās drīkst būt tikai skaitļi un const, NE reģistri/mainīgie (funkcijas: abs min max sqrt sin cos tan pi() e() if(c,a,b) …). Reģistri sākumā ir null – pirms add/incr tos inicializē ar set 0, $N. readch nedarbojas pēc readln – simbolu ņem ar readln + string-idx S, 0, MĒRĶIS.
Izvade: print V, … (bez jaunas rindas); println V, …; printf FORMĀTS, …; printfln FORMĀTS, … ({} aizvieto ar argumentiem). Ievade: readln MĒRĶIS (rinda kā virkne), read MĒRĶIS (vārds), readch MĒRĶIS (simbols). to-int V, MĒRĶIS un to-float V, MĒRĶIS pārvērš (null, ja neizdodas; pārbauda ar is-null V, MĒRĶIS). Virknes no readln/string-new un masīvi no array-new jāatbrīvo ar string-free / array-free.
Aritmētika: add sub mul div (A, B, …, MĒRĶIS), mod pow (A, B, MĒRĶIS), neg abs sqrt floor ceil round (N, MĒRĶIS), incr V, decr V, set V, MĒRĶIS, swap A, B, min max (A, B, MĒRĶIS), random MĒRĶIS, randi-range NO, LĪDZ, MĒRĶIS.
Salīdzināšana (rezultāts 1/0): eq neq le gr leeq greq (A, B, MĒRĶIS), and or (A, B, MĒRĶIS), not A, MĒRĶIS.
Virknes: string-new MĒRĶIS, daļa, …; string-size S, MĒRĶIS; string-idx S, I, MĒRĶIS; string-push S, V; string-concat S, V; string-substr S, NO, GARUMS, MĒRĶIS; string-split S, DALĪTĀJS, MĒRĶIS (masīvs); string-find S, V, NO, MĒRĶIS; string-contains S, V, MĒRĶIS; string-replace-all S, VECAIS, JAUNAIS; string-to-upper S; string-to-lower S; string-trim S; string-reverse S; string-free S.
Masīvi: array-new MĒRĶIS, v, …; array-size A, MĒRĶIS; array-idx A, I, MĒRĶIS; array-set A, I, V; array-push A, V; array-pop A; array-sort A, DILSTOŠI(0/1); array-reverse A; array-find A, V, MĒRĶIS; array-contains A, V, MĒRĶIS; array-join A, DALĪTĀJS, MĒRĶIS; array-free A. println A izdrukā masīvu kā [1,2,3].
Citi: valtable ATSLĒGA, MĒRĶIS, k1, v1, k2, v2, … (uzmeklēšanas tabula); func-call FUNKCIJA, arg…, MĒRĶIS; typeof V, MĒRĶIS; exit KODS; sleep MS; assert NOSACĪJUMS, ZIŅA; error ZIŅA. Direktīvas: @reg-size N, @return-reg-size N.
Šajā versijā NAV printn/printfn/readline/readchar/global – lieto println/printfln/readln/readch/const. Atkāpes ir 3 atstarpes, bet tās nav obligātas.`;

  const TEMPLATE = EXAMPLES[0].code;
  return { BUILTINS, BUILTIN_SET, KEYWORDS, DIRECTIVES, MATH, SNIPPETS, EXAMPLES, DOC_TEXT, TEMPLATE };
})();
