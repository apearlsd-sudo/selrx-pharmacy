#!/usr/bin/env python3
"""
Convert all turso.execute({ sql: ..., args: ... }) calls
in a given file to turso.execute(sqlRaw(sql, args)) format.

This fixes the silent 0-row return bug with parameterized queries
in the libsql Turso client.
"""
import re
import sys


def convert_file(filepath: str):
    with open(filepath, 'r') as f:
        content = f.read()

    # Pattern: turso.execute({
    #   sql: `...` or '...' or "...",
    #   args: [...],
    # })
    # We'll find each occurrence and replace it.

    # We need to handle nested braces inside the sql string carefully.
    # Strategy: find 'turso.execute({' then match balanced braces, extract sql and args.

    result = []
    i = 0
    changes = 0

    while i < len(content):
        # Look for turso.execute({
        match = re.search(r'turso\.execute\(\{', content[i:])
        if not match:
            result.append(content[i:])
            break

        start = i + match.start()
        # Don't convert if already using sqlRaw
        pre = content[max(0, start - 10):start]
        if 'sqlRaw' in pre:
            result.append(content[i:i + match.end()])
            i += match.end()
            continue

        # Find the matching closing })
        brace_start = i + match.end() - 1  # position of '{'
        depth = 1
        j = brace_start + 1
        in_string = None  # None, "'`, "`"
        while j < len(content) and depth > 0:
            ch = content[j]
            if in_string:
                if ch == in_string:
                    # Check for escaped quote
                    if j > 0 and content[j-1] == '\\':
                        pass
                    else:
                        in_string = None
            elif ch in ("'", '`', '"'):
                in_string = ch
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
            j += 1

        if depth != 0:
            # Unmatched braces, skip
            result.append(content[i:i + match.end()])
            i += match.end()
            continue

        block = content[brace_start + 1:j - 1]  # content between { and }

        # Extract sql value
        sql_match = re.search(r'sql:\s*(`(?:[^`]|``)*`|"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')', block, re.DOTALL)
        if not sql_match:
            result.append(content[i:j])
            i = j
            continue

        sql_val = sql_match.group(1)

        # Extract args value
        args_match = re.search(r'args:\s*(\[[^\]]*\])', block, re.DOTALL)
        if args_match:
            args_val = args_match.group(1)
        else:
            args_val = '[]'

        # Build replacement
        indent_match = re.match(r'(\s*)', content[start:][:20])
        # Determine the prefix before turso.execute
        # Find the start of the line
        line_start = content.rfind('\n', 0, start) + 1
        indent = content[line_start:start]

        replacement = f'turso.execute(sqlRaw({sql_val}, {args_val}))'
        result.append(content[i:start])
        result.append(replacement)
        i = j
        changes += 1

    new_content = ''.join(result)

    if changes > 0:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f'Converted {changes} turso.execute calls in {filepath}')
    else:
        print(f'No changes needed in {filepath}')

    return changes


if __name__ == '__main__':
    files = sys.argv[1:]
    if not files:
        print('Usage: python fix-turso-execute.py <file1> [file2 ...]')
        sys.exit(1)

    total = 0
    for f in files:
        total += convert_file(f)
    print(f'\nTotal conversions: {total}')
