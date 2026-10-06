"""Static SQL classification. Mirrors frontend/src/lib/sqlSafety.ts.

Django never executes user SQL; this module only *analyses* it so that the API can
return the same safety verdict the desktop app shows before running a statement.
"""
import re
from dataclasses import dataclass, field

KINDS = {"SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "REPLACE", "SHOW", "DESCRIBE", "EXPLAIN", "USE", "SET", "OTHER"}
READ_ONLY = {"SELECT", "SHOW", "DESCRIBE", "EXPLAIN", "USE"}


def split_statements(sql: str) -> list[str]:
    """Split on ';' outside of quotes/backticks/comments. Comments are removed."""
    out, buf, i, n = [], [], 0, len(sql)
    quote = None
    while i < n:
        c = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""
        if quote:
            buf.append(c)
            if c == "\\" and quote != "`" and i + 1 < n:
                buf.append(nxt)
                i += 1
            elif c == quote:
                if nxt == quote:  # doubled quote escape
                    buf.append(nxt)
                    i += 1
                else:
                    quote = None
        elif c in ("'", '"', "`"):
            quote = c
            buf.append(c)
        elif c == "-" and nxt == "-" and (i + 2 >= n or sql[i + 2] in " \t\r\n"):
            while i < n and sql[i] != "\n":
                i += 1
            continue
        elif c == "#":
            while i < n and sql[i] != "\n":
                i += 1
            continue
        elif c == "/" and nxt == "*":
            end = sql.find("*/", i + 2)
            i = n if end == -1 else end + 2
            buf.append(" ")
            continue
        elif c == ";":
            s = "".join(buf).strip()
            if s:
                out.append(s)
            buf = []
        else:
            buf.append(c)
        i += 1
    s = "".join(buf).strip()
    if s:
        out.append(s)
    return out


def _strip_literals(stmt: str) -> str:
    return re.sub(r"'(?:[^'\\]|\\.|'')*'|\"(?:[^\"\\]|\\.|\"\")*\"|`[^`]*`", "''", stmt)


@dataclass
class Verdict:
    statement: str
    kind: str
    destructive: bool = False
    reasons: list[str] = field(default_factory=list)

    def as_dict(self):
        return {"statement": self.statement, "kind": self.kind, "destructive": self.destructive, "reasons": self.reasons}


def classify(stmt: str) -> Verdict:
    parts = split_statements(stmt)
    stmt = parts[0] if parts else ""
    stripped = _strip_literals(stmt)
    m = re.match(r"\s*\(?\s*(\w+)", stripped)
    word = (m.group(1) if m else "").upper()
    if word == "WITH":
        # CTE: the real verb follows the CTE list; treat as DML if it contains a write verb.
        w = re.search(r"\b(UPDATE|DELETE|INSERT)\b", stripped, re.I)
        word = w.group(1).upper() if w else "SELECT"
    if word == "DESC":
        word = "DESCRIBE"
    kind = word if word in KINDS else "OTHER"
    v = Verdict(statement=stmt, kind=kind)
    has_where = re.search(r"\bWHERE\b", stripped, re.I) is not None
    if kind == "DROP":
        v.destructive, v.reasons = True, ["DROP permanently removes objects."]
    elif kind == "TRUNCATE":
        v.destructive, v.reasons = True, ["TRUNCATE removes every row and cannot be rolled back."]
    elif kind == "ALTER":
        v.destructive, v.reasons = True, ["ALTER changes the schema."]
    elif kind == "DELETE" and not has_where:
        v.destructive, v.reasons = True, ["DELETE without WHERE removes every row."]
    elif kind == "UPDATE" and not has_where:
        v.destructive, v.reasons = True, ["UPDATE without WHERE modifies every row."]
    elif kind == "SELECT" and re.search(r"\bINTO\s+(OUTFILE|DUMPFILE)\b", stripped, re.I):
        v.destructive, v.reasons = True, ["SELECT ... INTO OUTFILE writes to the server filesystem."]
    return v


def analyse(sql: str) -> dict:
    verdicts = [classify(s) for s in split_statements(sql)]
    return {
        "statements": [v.as_dict() for v in verdicts],
        "read_only": all(v.kind in READ_ONLY and not v.destructive for v in verdicts) and bool(verdicts),
        "requires_confirmation": any(v.destructive for v in verdicts),
    }
