#!/usr/bin/env python3
"""
Generates one CODEMAP.md per directory: file -> exported symbols -> one-line
signature + summary, no function bodies. Goal: an agent reads CODEMAP.md
instead of every source file to find where something lives.

Python: parsed with `ast` (accurate). JS/TS/JSX/TSX: regex-based (best-effort).
Anything else: listed as unsupported, not read.
"""
import ast
import os
import re
import sys

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", "venv", ".venv", "dist", "build",
    ".next", "target", ".claude", "coverage", ".mypy_cache", ".pytest_cache",
}
PY_EXT = {".py"}
JS_EXT = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
SUPPORTED_EXT = PY_EXT | JS_EXT


def first_line(doc):
    if not doc:
        return ""
    return doc.strip().splitlines()[0].strip()


def summarize_python(path):
    """Return list of (kind, signature, summary) for top-level defs/classes."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            src = f.read()
        tree = ast.parse(src)
    except (SyntaxError, UnicodeDecodeError, OSError):
        return None  # unparseable, caller notes it

    entries = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            args = [a.arg for a in node.args.args]
            prefix = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
            sig = f"{prefix} {node.name}({', '.join(args)})"
            entries.append(("fn", sig, first_line(ast.get_docstring(node))))
        elif isinstance(node, ast.ClassDef):
            bases = [b.id for b in node.bases if isinstance(b, ast.Name)]
            sig = f"class {node.name}" + (f"({', '.join(bases)})" if bases else "")
            entries.append(("class", sig, first_line(ast.get_docstring(node))))
            for sub in node.body:
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    args = [a.arg for a in sub.args.args if a.arg != "self"]
                    sig = f"  .{sub.name}({', '.join(args)})"
                    entries.append(("method", sig, first_line(ast.get_docstring(sub))))
    return entries


JS_FN = re.compile(
    r"^\s*(export\s+)?(default\s+)?(async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)\s*\(([^)]*)\)"
)
JS_ARROW = re.compile(
    r"^\s*(export\s+)?(const|let)\s+([A-Za-z0-9_$]+)\s*=\s*(async\s*)?\(([^)]*)\)\s*=>"
)
JS_CLASS = re.compile(r"^\s*(export\s+)?(default\s+)?class\s+([A-Za-z0-9_$]+)")


def summarize_js(path):
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except OSError:
        return None

    entries = []
    for i, line in enumerate(lines):
        m = JS_FN.match(line)
        if m:
            exported = "export " if m.group(1) else ""
            entries.append(("fn", f"{exported}function {m.group(4)}({m.group(5)})", ""))
            continue
        m = JS_ARROW.match(line)
        if m:
            exported = "export " if m.group(1) else ""
            entries.append(("fn", f"{exported}{m.group(2)} {m.group(3)} = ({m.group(5)}) =>", ""))
            continue
        m = JS_CLASS.match(line)
        if m:
            exported = "export " if m.group(1) else ""
            entries.append(("class", f"{exported}class {m.group(3)}", ""))
    return entries


def build_dir_map(dirpath, filenames):
    lines = [f"# {os.path.relpath(dirpath) or '.'}", ""]
    wrote_any = False
    for fn in sorted(filenames):
        ext = os.path.splitext(fn)[1]
        full = os.path.join(dirpath, fn)
        if ext in PY_EXT:
            entries = summarize_python(full)
        elif ext in JS_EXT:
            entries = summarize_js(full)
        else:
            continue
        wrote_any = True
        lines.append(f"## {fn}")
        if entries is None:
            lines.append("- unparseable")
        elif not entries:
            lines.append("- (no top-level symbols found)")
        else:
            for kind, sig, summary in entries:
                suffix = f" — {summary}" if summary else ""
                lines.append(f"- `{sig}`{suffix}")
        lines.append("")
    return "\n".join(lines) if wrote_any else None


def main(root):
    written = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        source_files = [f for f in filenames if os.path.splitext(f)[1] in SUPPORTED_EXT]
        if not source_files:
            continue
        content = build_dir_map(dirpath, source_files)
        if content is None:
            continue
        out_path = os.path.join(dirpath, "CODEMAP.md")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
        written.append((out_path, os.path.getsize(out_path)))

    for path, size in written:
        print(f"{path}\t{size}B")
    print(f"Total: {len(written)} CODEMAP.md files, {sum(s for _, s in written)}B")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
