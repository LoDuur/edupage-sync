/* PIL (github.com/Acerx-AMJ/PIL): completion data, examples, language reference for the AI */
export const PIL = (() => {
  const B = {
    "print": "VALUE, … · print without newline", "println": "VALUE, … · print with newline", "printf": "FORMAT, … · {} substituted", "printfln": "FORMAT, … · {} substituted + newline", "printch": "CHAR",
    "read": "DEST · read a word", "readln": "DEST · read a line", "readch": "DEST · read a char", "setecho": "0|1",
    "set": "VALUE, DEST", "swap": "A, B", "incr": "VAR", "decr": "VAR",
    "add": "A, B, …, DEST", "sub": "A, B, …, DEST", "mul": "A, B, …, DEST", "div": "A, B, …, DEST", "mod": "A, B, DEST", "floor-mod": "A, B, DEST", "pow": "A, B, DEST", "neg": "N, DEST",
    "sqrt": "N, DEST", "cbrt": "N, DEST", "abs": "N, DEST", "sign": "N, DEST", "min": "A, B, …, DEST", "max": "A, B, …, DEST", "clamp": "N, LO, HI, DEST",
    "trunc": "N, DEST", "ceil": "N, DEST", "floor": "N, DEST", "round": "N, DEST", "exp": "N, DEST", "ln": "N, DEST", "log": "N, BASE, DEST", "log2": "N, DEST", "log10": "N, DEST",
    "sin": "N, DEST", "cos": "N, DEST", "tan": "N, DEST", "asin": "N, DEST", "acos": "N, DEST", "atan": "N, DEST", "atan2": "Y, X, DEST", "sinh": "N, DEST", "cosh": "N, DEST", "tanh": "N, DEST", "asinh": "N, DEST", "acosh": "N, DEST", "atanh": "N, DEST",
    "lerp": "A, B, T, DEST", "step-towards": "LO, TO, STEP, DEST", "hypot": "A, B, DEST", "hypot3": "A, B, C, DEST", "gcd": "A, B, DEST", "lcm": "A, B, DEST",
    "seed-random": "SEED", "random": "DEST · 0..1", "randf-range": "LO, HI, DEST", "randi-range": "LO, HI, DEST",
    "bit-and": "A, B, DEST", "bit-or": "A, B, DEST", "bit-xor": "A, B, DEST", "bit-not": "A, DEST", "bit-shl": "A, N, DEST", "bit-shr": "A, N, DEST", "bit-count": "A, DEST", "bit-test": "A, BIT, DEST", "bit-set": "A, BIT, DEST", "bit-clear": "A, BIT, DEST", "bit-toggle": "A, BIT, DEST",
    "le": "A, B, DEST · A < B", "gr": "A, B, DEST · A > B", "leeq": "A, B, DEST · A ≤ B", "greq": "A, B, DEST · A ≥ B", "eq": "A, B, DEST · A = B", "neq": "A, B, DEST · A ≠ B", "and": "A, B, DEST", "or": "A, B, DEST", "not": "A, DEST",
    "goto": "LABEL", "jmp": "COND, LABEL", "jmpn": "COND, LABEL · if false", "jmptable": "VALUE, V1, LABEL1, …",
    "call": "DEST, FUNC, ARG… · result into DEST", "func-call": "FUNC, ARG…, DEST", "return": "VALUE, …",
    "catch": "DEST, FUNC, ARG…", "assert": "COND, MSG", "warn": "MSG", "error": "MSG", "exit": "CODE",
    "stack-depth": "DEST", "stack-name": "DEST", "stack-line": "DEST", "stack-file": "DEST", "stack-trace": "",
    "typeof": "V, DEST · int float char string array…", "is-num": "V, DEST", "is-float": "V, DEST", "is-int": "V, DEST", "is-char": "V, DEST", "is-string": "V, DEST", "is-array": "V, DEST", "is-reg": "V, DEST", "is-function": "V, DEST", "is-label": "V, DEST", "is-null": "V, DEST", "is-inf": "V, DEST", "is-nan": "V, DEST",
    "to-int": "V, DEST · null if invalid", "to-float": "V, DEST · null if invalid", "to-char": "V, DEST",
    "time": "DEST · ms", "unix-time": "DEST", "date": "FORMAT, DEST", "sleep": "MS",
    "valtable": "KEY, DEST, K1, V1, …", "table-contains": "KEY, DEST, K1, …",
    "variadic-size": "DEST", "variadic-idx": "I, DEST", "reg-size": "DEST", "reg-idx": "I, DEST", "reg-set": "I, VALUE", "return-reg-size": "DEST", "return-reg-idx": "I, DEST", "return-reg-set": "I, VALUE", "return-count": "DEST",
    "func-arity": "FUNC, DEST", "func-variadic": "FUNC, DEST", "func-arg-match": "FUNC, N, DEST",
    "string-new": "DEST, PART, … · new string (must be freed)", "string-fmt": "DEST, FORMAT, …", "string-repeat": "DEST, V, N", "string-free": "STR, …", "string-copy": "STR, DEST", "string-size": "STR, DEST", "string-empty": "STR, DEST", "string-clear": "STR",
    "string-idx": "STR, I, DEST", "string-set": "STR, I, CHAR", "string-push": "STR, V", "string-pop": "STR", "string-back": "STR, DEST", "string-front": "STR, DEST", "string-insert": "STR, I, V", "string-erase": "STR, I", "string-erase-all": "STR, V",
    "string-concat": "STR, V", "string-substr": "STR, LO, LEN, DEST", "string-split": "STR, SEP, DEST · array", "string-count": "STR, V, DEST", "string-reverse": "STR", "string-trim": "STR", "string-to-lower": "STR", "string-to-upper": "STR",
    "string-find": "STR, V, LO, DEST", "string-rfind": "STR, V, LO, DEST", "string-contains": "STR, V, DEST", "string-starts-with": "STR, V, DEST", "string-ends-with": "STR, V, DEST", "string-replace": "STR, OLD, NEW, DEST", "string-replace-all": "STR, OLD, NEW",
    "string-find-first-of": "STR, CHARS, DEST", "string-find-first-not-of": "STR, CHARS, DEST", "string-find-last-of": "STR, CHARS, DEST", "string-find-last-not-of": "STR, CHARS, DEST",
    "string-capacity": "STR, DEST", "string-reserve": "STR, N", "string-resize": "STR, N, CHAR", "string-memfree": "STR", "string-mark": "STR, MARK", "string-get-mark": "STR, DEST", "string-free-marked": "MARK",
    "array-new": "DEST, V, … · new array (must be freed)", "array-fill": "DEST, N, V", "array-iota": "DEST, N, START", "array-free": "ARRAY, …", "array-deep-free": "ARRAY", "array-size": "ARRAY, DEST", "array-empty": "ARRAY, DEST", "array-clear": "ARRAY",
    "array-idx": "ARRAY, I, DEST", "array-set": "ARRAY, I, V", "array-push": "ARRAY, V", "array-pop": "ARRAY", "array-back": "ARRAY, DEST", "array-front": "ARRAY, DEST", "array-insert": "ARRAY, I, V", "array-erase": "ARRAY, I", "array-erase-all": "ARRAY, V",
    "array-join": "ARRAY, SEP, DEST · string", "array-concat": "ARRAY, ARRAY2, DEST", "array-slice": "ARRAY, LO, HI, DEST", "array-shuffle": "ARRAY", "array-sort": "ARRAY, DESC", "array-count": "ARRAY, V, DEST", "array-reverse": "ARRAY", "array-find": "ARRAY, V, DEST", "array-contains": "ARRAY, V, DEST",
    "array-shallow-copy": "ARRAY, DEST", "array-deep-copy": "ARRAY, DEST", "array-capacity": "ARRAY, DEST", "array-reserve": "ARRAY, N", "array-resize": "ARRAY, N, V", "array-memfree": "ARRAY", "array-mark": "ARRAY, MARK", "array-get-mark": "ARRAY, DEST", "array-free-marked": "MARK",
    "map-new": "DEST, K1, V1, …", "map-free": "MAP, …", "map-deep-free": "MAP, …", "map-mark": "MAP, MARK", "map-get-mark": "MAP, DEST", "map-free-marked": "MARK", "map-shallow-copy": "MAP, DEST", "map-deep-copy": "MAP, DEST", "map-erase": "MAP, KEY", "map-set": "MAP, KEY, V", "map-at": "MAP, KEY, DEST", "map-contains": "MAP, KEY, DEST", "map-size": "MAP, DEST", "map-empty": "MAP, DEST", "map-clear": "MAP", "map-keys": "MAP, DEST", "map-values": "MAP, DEST", "map-merge": "MAP, MAP2, DEST",
  };
  const BUILTINS = Object.keys(B).map(n => ({ n, sig: B[n] }));
  const BUILTIN_SET = new Set(Object.keys(B));
  const KEYWORDS = ["let", "const", "main"];
  const DIRECTIVES = ["@include", "@reg-size", "@return-reg-size"];
  const MATH = "abs min max sqrt cbrt sin cos tan asin acos atan atan2 asinh acosh atanh sinh cosh tanh clamp sign trunc ceil floor round exp ln log log2 log10 lerp if pi tau e hypot gcd lcm".split(" ");



  const SNIPPETS = {
    main: { text: "main()\n   println \"Hello, world!\"\n", cur: { line: 1 }, k: "program entry" },
    func: { text: "name(a, b) let result\n   add a, b, result\n   return result\n", cur: { line: 1 }, k: "function" },
    loop: { text: "set 0, $0\nloop:\n   println $0\n   incr $0\n   le $0, 10, $1\n   jmp $1, loop\n", cur: { line: 2 }, k: "loop 0..9" },
    if: { text: "set 7, $0\ngr $0, 5, $1\njmpn $1, else\n   println \"greater than 5\"\n   goto end\nelse:\n   println \"not greater\"\nend:\n", cur: { line: 3 }, k: "if / else" },
    readnum: { text: "print \"Ievadi skaitli: \"\nreadln $0\nto-int $0, $1\nstring-free $0\n", cur: { line: 3 }, k: "read a number" },
    readtxt: { text: "print \"Ievadi tekstu: \"\nreadln $0\n", cur: { line: 1 }, k: "read a line" },
    arr: { text: "array-new $0, 1, 2, 3\narray-size $0, $1\nprintln $0\narray-free $0\n", cur: { line: 3 }, k: "array" },
    str: { text: "string-new $0, \"a\", \"b\"\nprintln $0\nstring-free $0\n", cur: { line: 2 }, k: "string" },
    const: { text: "const NAME 10\n", cur: -3, k: "constant (file level)" },
    callr: { text: "call $0, name, 1, 2\n", cur: 0, k: "call and store result" },
  };

  const EXAMPLES = [
    { name: "Hello, world", code: `; PIL – a small interpreted language in COBOL + assembly style.
; The program starts in main. Comments start with ;
main()
   println "Hello, world!"
   add 2, 3, $0          ; $0 = 2 + 3
   printfln "2 + 3 = {}", $0
` },
    { name: "Factorial", code: `; recursive factorial: n! = n * (n-1)!
factorial(n) let minus1, result
   leeq n, 1, $0                 ; $0 = n <= 1
   jmp $0, factorial-end         ; if so – return 1

   sub n, 1, minus1
   call result, factorial, minus1
   mul result, n, result
   return result
factorial-end:
   return 1

main()
   factorial 5
   printfln "5! = {}", R$0       ; R$0 – returned value
` },
    { name: "Loop 1..10", code: `main()
   set 1, $1          ; counter
   set 10, $2         ; up to
loop:
   print $1, " "
   add $1, 1, $1
   leeq $1, $2, $3
   jmp $3, loop
   println ""
` },
    { name: "Fibonacci", code: `fib-iterative(n) let prev1, prev2, curr
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
    { name: "Input (stdin)", code: `; reads a name and age – type them in the terminal when the program waits
main() let name, age
   print "Your name: "
   readln name
   print "Age: "
   readln $0
   to-int $0, age
   string-free $0
   is-null age, $1
   jmp $1, bad-age
   add age, 1, $2
   printfln "Hello, {}! Next year you will be {}.", name, $2
   string-free name
   return
bad-age:
   println "Age must be a number."
   string-free name
` },
    { name: "Calculator", code: `input-number(msg) let input, tmp
   goto input-number-start
input-number-error:
   println "Invalid input, try again."
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
   println "Invalid operator."
   return 0.0
valid-op:
   func-call fn, n1, n2, result
   return result

main() let n1, n2, op
   call n1, input-number, "First number: "
   call n2, input-number, "Second number: "
   print "Operator (+,-,*,/,%,^): "
   readln $0
   string-idx $0, 0, op        ; first character of the line
   string-free $0
   println ""
   calculate n1, n2, op
   printfln "{} {} {} = {}", n1, op, n2, R$0
` },
    { name: "Arrays and strings", code: `main() let arr, s, n, i
   array-new arr, 5, 3, 9, 1
   array-push arr, 7
   array-sort arr, 0
   array-size arr, n
   printfln "array {} ({} elements)", arr, n

   set 0, i
   set 0, $1                  ; registers start as null – initialize them
sum-loop:
   array-idx arr, i, $0
   add $1, $0, $1
   incr i
   le i, n, $2
   jmp $2, sum-loop
   printfln "sum = {}", $1

   string-new s, "Valmieras ", "tehnikums"
   string-to-upper s
   string-size s, $3
   printfln "{} ({} characters)", s, $3

   array-free arr
   string-free s
` },
    { name: "Constants and [math]", code: `@reg-size 8
const LIMIT 3
const TITLE "Table up to \${LIMIT}, pi = $[pi()]"

main()
   println TITLE
   set [ 2 ** 3 - 7 ], $0     ; [ ] – expression of constants (evaluated before running)
row:
   mul $0, $0, $1
   sqrt $1, $2
   printfln "{}^2 = {}  sqrt = {}", $0, $1, $2
   incr $0
   leeq $0, LIMIT, $3
   jmp $3, row
` },
  ];

  const DOC_TEXT = `PIL syntax: a file consists of functions, a function of commands (one per line, arguments separated by commas). The program starts in main(). Comments start with ;.
Function definition: name(a, b) let loc1, loc2  (let – local variables, on the same line). Label: name: (on its own line). Jumps: goto LABEL; jmp COND, LABEL (if truthy); jmpn COND, LABEL (if falsy). There is no if/while/for – only labels and jumps.
Storage: registers $0..$15, return registers R$0..R$3 (return VALUE puts values there), parameters, let locals, const NAME VALUE at file level (no mutable globals). Almost every command takes the DESTINATION as its LAST argument: add 2, 3, $0 means $0 = 2 + 3.
Function call: name arg1, arg2 (result in R$0) or call DEST, name, arg1, arg2.
Types: int, float, char 'a', string "text", array, null. Math expressions in square brackets set [2 ** 10 + sqrt(16)], $0 are evaluated BEFORE running – they may contain only numbers and const, NOT registers/variables (functions: abs min max sqrt sin cos tan pi() e() if(c,a,b) …). Registers start as null – initialize with set 0, $N before add/incr. readch does not work after readln – take a character with readln + string-idx S, 0, DEST.
Output: print V, … (no newline); println V, …; printf FORMAT, …; printfln FORMAT, … ({} is replaced by arguments). Input: readln DEST (line as string), read DEST (word), readch DEST (char). to-int V, DEST and to-float V, DEST convert (null on failure; check with is-null V, DEST). Strings from readln/string-new and arrays from array-new must be freed with string-free / array-free.
Arithmetic: add sub mul div (A, B, …, DEST), mod pow (A, B, DEST), neg abs sqrt floor ceil round (N, DEST), incr V, decr V, set V, DEST, swap A, B, min max (A, B, DEST), random DEST, randi-range LO, HI, DEST.
Comparison (result 1/0): eq neq le gr leeq greq (A, B, DEST), and or (A, B, DEST), not A, DEST.
Strings: string-new DEST, part, …; string-size S, DEST; string-idx S, I, DEST; string-push S, V; string-concat S, V; string-substr S, FROM, LEN, DEST; string-split S, SEP, DEST (array); string-find S, V, FROM, DEST; string-contains S, V, DEST; string-replace-all S, OLD, NEW; string-to-upper S; string-to-lower S; string-trim S; string-reverse S; string-free S.
Arrays: array-new DEST, v, …; array-size A, DEST; array-idx A, I, DEST; array-set A, I, V; array-push A, V; array-pop A; array-sort A, DESC(0/1); array-reverse A; array-find A, V, DEST; array-contains A, V, DEST; array-join A, SEP, DEST; array-free A. println A prints an array as [1,2,3].
Other: valtable KEY, DEST, k1, v1, k2, v2, … (lookup table); func-call FUNC, arg…, DEST; typeof V, DEST; exit CODE; sleep MS; assert COND, MSG; error MSG. Directives: @reg-size N, @return-reg-size N.
This version has NO printn/printfn/readline/readchar/global – use println/printfln/readln/readch/const. Indentation is 3 spaces but optional.`;

  const TEMPLATE = EXAMPLES[0].code;
  return { BUILTINS, BUILTIN_SET, KEYWORDS, DIRECTIVES, MATH, SNIPPETS, EXAMPLES, DOC_TEXT, TEMPLATE };
})();
