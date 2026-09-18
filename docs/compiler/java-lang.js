/* Java: completion data, snippets, template (runs on Wandbox OpenJDK 22) */
const JAVA = (() => {
  const KEYWORDS = "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try var void volatile while true false null record sealed permits yield".split(" ");
  const API = "String Integer Double Boolean Character Long Math Object System Scanner ArrayList List HashMap Map HashSet Set Arrays Collections Random StringBuilder Exception RuntimeException IllegalArgumentException NumberFormatException InputMismatchException Thread Iterator Optional LocalDate BufferedReader InputStreamReader IOException Comparable Comparator Objects Stream IntStream".split(" ");
  const MEMBERS = "System.out.println System.out.print System.out.printf System.err.println System.in Math.max Math.min Math.abs Math.pow Math.sqrt Math.random Math.round Math.floor Math.ceil Math.PI Integer.parseInt Integer.MAX_VALUE Integer.MIN_VALUE Double.parseDouble String.valueOf String.format Arrays.toString Arrays.sort Arrays.fill Arrays.asList Collections.sort Collections.reverse Thread.sleep nextInt nextLine nextDouble next hasNext hasNextInt close length charAt substring indexOf equals equalsIgnoreCase toUpperCase toLowerCase trim split contains replace startsWith endsWith isEmpty toCharArray compareTo add get set remove size clear isEmpty put containsKey keySet values entrySet append toString reverse insert deleteCharAt".split(" ");
  const SNIPPETS = {
    sout: { text: "System.out.println();", cur: -2, k: "System.out.println();" },
    souf: { text: "System.out.printf(\"%n\");", cur: -6, k: "printf" },
    psvm: { text: "public static void main(String[] args) {\n    \n}", cur: { line: 1 }, k: "main method" },
    fori: { text: "for (int i = 0; i < n; i++) {\n    \n}", cur: { line: 1 }, k: "for loop" },
    foreach: { text: "for (int x : arr) {\n    \n}", cur: { line: 1 }, k: "for-each" },
    whilel: { text: "while (true) {\n    \n}", cur: { line: 1 }, k: "while loop" },
    ifel: { text: "if () {\n    \n} else {\n    \n}", cur: { line: 1 }, k: "if / else" },
    sc: { text: "Scanner in = new Scanner(System.in);", cur: 0, k: "Scanner" },
    trycatch: { text: "try {\n    \n} catch (Exception e) {\n    System.out.println(e.getMessage());\n}", cur: { line: 1 }, k: "try / catch" },
    arr: { text: "int[] arr = new int[n];", cur: 0, k: "array" },
    list: { text: "ArrayList<Integer> list = new ArrayList<>();", cur: 0, k: "ArrayList" },
    map: { text: "HashMap<String, Integer> map = new HashMap<>();", cur: 0, k: "HashMap" },
    method: { text: "public static int name(int a) {\n    return a;\n}", cur: 0, k: "method" },
    cls: { text: "public class Main {\n    public static void main(String[] args) {\n        \n    }\n}", cur: { line: 2 }, k: "class" },
  };
  const TEMPLATE = `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        System.out.println("Hello, world!");
    }
}
`;
  const EXAMPLES = [
    { name: "Hello, world", code: TEMPLATE },
    { name: "Input (Scanner)", code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        System.out.print("Your name: ");
        String name = in.nextLine();
        System.out.print("Age: ");
        int age = Integer.parseInt(in.nextLine().trim());
        System.out.printf("Hello, %s! Next year you will be %d.%n", name, age + 1);
    }
}
` },
    { name: "Loops and arrays", code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        int[] arr = {5, 3, 9, 1, 7};
        Arrays.sort(arr);
        int sum = 0;
        for (int x : arr) sum += x;
        System.out.println("array " + Arrays.toString(arr));
        System.out.println("sum = " + sum);
        for (int i = 1; i <= 5; i++) System.out.print(i * i + " ");
        System.out.println();
    }
}
` },
    { name: "Methods and recursion", code: `public class Main {
    static long factorial(int n) {
        return n <= 1 ? 1 : n * factorial(n - 1);
    }

    static int fib(int n) {
        int a = 0, b = 1;
        for (int i = 0; i < n; i++) { int t = a + b; a = b; b = t; }
        return a;
    }

    public static void main(String[] args) {
        System.out.println("5! = " + factorial(5));
        for (int i = 0; i < 10; i++) System.out.print(fib(i) + " ");
        System.out.println();
    }
}
` },
    { name: "Class and objects", code: `import java.util.*;

public class Main {
    static class Student {
        String name; int grade;
        Student(String name, int grade) { this.name = name; this.grade = grade; }
        public String toString() { return name + " (" + grade + ")"; }
    }

    public static void main(String[] args) {
        List<Student> list = new ArrayList<>();
        list.add(new Student("Anna", 9));
        list.add(new Student("Jānis", 7));
        list.add(new Student("Līga", 10));
        list.sort(Comparator.comparingInt(s -> -s.grade));
        System.out.println(list);
    }
}
` },
  ];
  const classNameOf = code => { const m = code.match(/public\s+(?:final\s+|abstract\s+)*class\s+([A-Za-z_$][\w$]*)/) || code.match(/class\s+([A-Za-z_$][\w$]*)[^{]*\{[\s\S]*?static\s+void\s+main/); return m ? m[1] : "Main"; };
  return { KEYWORDS, API, MEMBERS, SNIPPETS, TEMPLATE, EXAMPLES, classNameOf };
})();
