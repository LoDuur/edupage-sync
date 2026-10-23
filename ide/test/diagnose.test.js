import test from "node:test";
import assert from "node:assert/strict";
import { diagnose, stripAnsi } from "../public/js/diagnose.js";

test("gcc errors keep line and column", () => {
  const out = stripAnsi("\x1b[1mmain.c:3:12: \x1b[0;1;31merror: \x1b[0muse of undeclared identifier 'x'\n1 error generated.\n");
  assert.deepEqual(diagnose("c", out, { exitCode: 1, file: "main.c" }).map(i => [i.kind, i.line, i.column]), [["error", 3, 12]]);
});

test("python traceback points at the last frame", () => {
  const out = 'Traceback (most recent call last):\n  File "/work/main.py", line 4, in <module>\n    print(1/0)\nZeroDivisionError: division by zero\n';
  const [item] = diagnose("python", out, { exitCode: 1, file: "main.py" });
  assert.equal(item.line, 4);
  assert.equal(item.hint, "Division by zero.");
});

test("java runtime exception uses the stack frame line", () => {
  const out = 'Exception in thread "main" java.lang.ArithmeticException: / by zero\n\tat Main.main(Main.java:7)\n';
  assert.equal(diagnose("java", out, { exitCode: 1, file: "Main.java" })[0].line, 7);
});

test("pil errors are parsed", () => {
  const out = "Error: Expected a semicolon after function call, got Identifier instead at main.pil:3.\nProgram exited with error code 1.\n";
  assert.equal(diagnose("pil", out, { exitCode: 1, file: "main.pil" })[0].line, 3);
});

test("killed processes explain the exit code", () => {
  assert.match(diagnose("python", "", { exitCode: 152, file: "main.py" })[0].message, /CPU time limit/);
  assert.equal(diagnose("python", "", { exitCode: 130, file: "main.py" }).length, 0);
});
