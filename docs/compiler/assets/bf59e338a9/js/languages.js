export const LANGUAGE_META = {
  python: { monaco: "python", file: "main.py", tab: 4, compiles: false, template: 'name = input("Name: ")\nprint(f"Hello, {name}!")\n',
    snippets: { for: "for ${1:i} in range(${2:10}):\n\t$0", if: "if ${1:condition}:\n\t$0", def: "def ${1:name}(${2}):\n\t$0", while: "while ${1:condition}:\n\t$0", input: '${1:value} = int(input("${2:Number}: "))' } },
  javascript: { monaco: "javascript", file: "main.js", tab: 2, compiles: false, template: 'const name = process.argv[2] || "world";\nconsole.log(`Hello, ${name}!`);\n', snippets: {} },
  java: { monaco: "java", file: "Main.java", tab: 4, compiles: false, template: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        System.out.print("Name: ");\n        String name = in.nextLine();\n        System.out.println("Hello, " + name + "!");\n    }\n}\n',
    snippets: { sout: "System.out.println(${1});", main: "public static void main(String[] args) {\n\t$0\n}", fori: "for (int ${1:i} = 0; $1 < ${2:n}; $1++) {\n\t$0\n}", scanner: "Scanner ${1:in} = new Scanner(System.in);", if: "if (${1:condition}) {\n\t$0\n}", while: "while (${1:condition}) {\n\t$0\n}" } },
  c: { monaco: "c", file: "main.c", tab: 4, compiles: true, template: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, world!\\n");\n    return 0;\n}\n',
    snippets: { main: "int main(void) {\n\t$0\n\treturn 0;\n}", printf: 'printf("${1:%d}\\n", ${2});', scanf: 'scanf("${1:%d}", &${2:x});', fori: "for (int ${1:i} = 0; $1 < ${2:n}; $1++) {\n\t$0\n}", if: "if (${1:condition}) {\n\t$0\n}" } },
  cpp: { monaco: "cpp", file: "main.cpp", tab: 4, compiles: true, template: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, world!" << endl;\n    return 0;\n}\n',
    snippets: { main: "int main() {\n\t$0\n\treturn 0;\n}", cout: "cout << ${1} << endl;", cin: "cin >> ${1:x};", fori: "for (int ${1:i} = 0; $1 < ${2:n}; $1++) {\n\t$0\n}", if: "if (${1:condition}) {\n\t$0\n}" } },
  csharp: { monaco: "csharp", file: "Program.cs", tab: 4, compiles: true, template: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.Write("Name: ");\n        string name = Console.ReadLine();\n        Console.WriteLine($"Hello, {name}!");\n    }\n}\n',
    snippets: { cw: "Console.WriteLine(${1});", cr: "Console.ReadLine()", fori: "for (int ${1:i} = 0; $1 < ${2:n}; $1++) {\n\t$0\n}", if: "if (${1:condition}) {\n\t$0\n}" } },
  lua: { monaco: "lua", file: "main.lua", tab: 2, compiles: false, template: 'io.write("Name: ")\nlocal name = io.read()\nprint("Hello, " .. name .. "!")\n',
    snippets: { for: "for ${1:i} = 1, ${2:10} do\n\t$0\nend", if: "if ${1:condition} then\n\t$0\nend", function: "function ${1:name}(${2})\n\t$0\nend", while: "while ${1:condition} do\n\t$0\nend" } },
  pil: { monaco: "pil", file: "main.pil", tab: 3, compiles: false, template: '# PIL – the program starts in main.\nmain()\n   local name;\n   print "Name: ";\n   readln name;\n   printfln "Hello, {}!", name;\n   string-free name;\n',
    snippets: { main: "main()\n   $0", func: "${1:name}(${2:a})\n   local ${3:result};\n   $0\n   return ${3:result};", loop: "set 0, ${1:i};\n${2:loop}-start:\n   gr $1, ${3:10}, \\$0;\n   jmp \\$0, $2-end;\n   $0\n   incr $1;\n   goto $2-start;\n$2-end:", readnum: "readln \\$0;\nto-int \\$0, ${1:n};\nstring-free \\$0;" } },
  bash: { monaco: "shell", file: "main.sh", tab: 2, compiles: false, template: 'read -p "Name: " name\necho "Hello, $name!"\n', snippets: {} },
};

const PIL_BUILTINS = "abs acos acosh add and array-at array-back array-capacity array-clear array-concat array-contains array-copy array-count array-deep-copy array-empty array-erase array-erase-all array-fill array-find array-front array-insert array-iota array-join array-memfree array-new array-pop array-push array-reserve array-resize array-reverse array-set array-shuffle array-size array-slice array-sort asin asinh assert atan atan2 atanh bit-and bit-clear bit-count bit-not bit-or bit-set bit-shl bit-shr bit-test bit-toggle bit-xor call catch cbrt ceil clamp cos cosh date decr div eq error exit exp floor fmod func-arg-match func-arity func-variadic gcd goto gr greq hypot hypot3 incr is-array is-char is-float is-function is-inf is-int is-label is-map is-nan is-null is-num is-reg is-string jmp jmpn jmptable lcm le leeq lerp ln log log10 log2 map-at map-at-or map-clear map-contains map-copy map-deep-copy map-empty map-erase map-keys map-merge map-new map-set map-size map-values max min mod mul neg neq not or pow print printch printf printfln println randf-range randi-range random read readch readln return round seed-random set sign sin sinh sleep sqrt stack-depth stack-file stack-line stack-name step-towards string-at string-back string-capacity string-clear string-concat string-contains string-copy string-count string-empty string-ends-with string-erase string-erase-all string-find string-fmt string-free string-front string-insert string-new string-pop string-push string-repeat string-replace string-replace-all string-reverse string-rfind string-set string-size string-split string-starts-with string-substr string-to-lower string-to-upper string-trim sub sum swap table-contains tan tanh time to-char to-float to-int trunc typeof unix-time valtable warn".split(" ");

export function registerLanguages(monaco) {
  monaco.languages.register({ id: "pil", extensions: [".pil"] });
  monaco.languages.setLanguageConfiguration("pil", {
    comments: { lineComment: "#" },
    brackets: [["(", ")"], ["[", "]"]],
    autoClosingPairs: [{ open: "(", close: ")" }, { open: "[", close: "]" }, { open: '"', close: '"', notIn: ["string"] }, { open: "'", close: "'", notIn: ["string"] }],
    indentationRules: { increaseIndentPattern: /^[\w-]+\(.*\)\s*$|^[\w-]+:\s*$/, decreaseIndentPattern: /^\s*[\w-]+:\s*$/ },
  });
  monaco.languages.setMonarchTokensProvider("pil", {
    builtins: PIL_BUILTINS,
    tokenizer: { root: [
      [/#.*$/, "comment"],
      [/"(?:[^"\\]|\\.)*"/, "string"], [/'(?:[^'\\]|\\.)*'/, "string"],
      [/[rR]?\$\d+/, "variable.predefined"], [/@[\w-]+/, "annotation"],
      [/^[A-Za-z_][\w-]*(?=\s*\()/, "type.identifier"], [/^\s*[A-Za-z_][\w-]*(?=\s*:\s*$)/, "tag"],
      [/\b(local|const|struct|null)\b/, "keyword"], [/-?\d+(\.\d+)?([eE][-+]?\d+)?/, "number"],
      [/^\s+[A-Za-z_][\w-]*/, { cases: { "@builtins": "keyword", "@default": "identifier" } }],
      [/[A-Za-z_][\w-]*/, "identifier"], [/[()[\],;:]/, "delimiter"],
    ] },
  });

  const { CompletionItemKind: Kind, CompletionItemInsertTextRule: Rule } = monaco.languages;
  for (const [id, meta] of Object.entries(LANGUAGE_META)) {
    const extra = id === "pil" ? PIL_BUILTINS : [];
    if (!Object.keys(meta.snippets).length && !extra.length) continue;
    monaco.languages.registerCompletionItemProvider(meta.monaco, {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
        const suggestions = Object.entries(meta.snippets).map(([label, insertText]) => ({ label, kind: Kind.Snippet, detail: "snippet", insertText, insertTextRules: Rule.InsertAsSnippet, range, sortText: "0" + label }));
        for (const name of extra) suggestions.push({ label: name, kind: Kind.Function, insertText: name + " ", range });
        return { suggestions };
      },
    });
  }
}
