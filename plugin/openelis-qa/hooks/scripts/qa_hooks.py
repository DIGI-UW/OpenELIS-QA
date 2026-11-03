#!/usr/bin/env python3
"""Hooks for the openelis-qa plugin.

Subcommands (each reads the hook's JSON from stdin):
  session-start    print the QA context reminder
  jira-create      gate createJiraIssue on a complete "QA checks" section, then ask Casey
  git-guard        refuse `git add -A` / `git add .` / force pushes in the public QA repo
  tracker-reminder on Stop, ask once for a tracker update after Jira or QA-repo writes

Every failure inside a hook exits 0 with no output, so a broken hook never blocks work.
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
TRACKER_ID = "P6HYxRu9vUvfAoXMETKN2h"
CARD_LINES = ["Confirmed", "Searched", "Rulings", "Spec", "Build", "Not checked"]
PLACEHOLDER = re.compile(r"^\s*(tbd|todo|\?+|-|\.\.\.|<.*>)\s*$", re.I)
JIRA_WRITE = re.compile(r"(createJiraIssue|editJiraIssue|transitionJiraIssue|addCommentToJiraIssue)$")
QA_REPO = re.compile(r"openelis-qa", re.I)


def read_input() -> dict:
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj))


def pre_tool(decision: str, reason: str) -> None:
    emit({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                 "permissionDecision": decision,
                                 "permissionDecisionReason": reason}})


# ---------------------------------------------------------------- session-start
def session_start(_: dict) -> None:
    path = os.path.join(ROOT, "hooks", "context.md")
    with open(path, encoding="utf-8") as f:
        sys.stdout.write(f.read())


# ---------------------------------------------------------------- jira-create
def adf_text(node) -> str:
    """Flatten an Atlassian Document Format node (or a JSON string of one) to text."""
    if isinstance(node, str):
        s = node.strip()
        if s.startswith("{"):
            try:
                return adf_text(json.loads(s))
            except Exception:
                return node
        return node
    if isinstance(node, list):
        return "".join(adf_text(n) for n in node)
    if isinstance(node, dict):
        if node.get("type") == "text":
            return node.get("text", "")
        inner = adf_text(node.get("content", []))
        block = node.get("type") in {"paragraph", "heading", "listItem", "bulletList",
                                     "orderedList", "codeBlock", "blockquote", "rule"}
        return inner + ("\n" if block else "")
    return ""


def check_card(description: str) -> list[str]:
    """Return the problems with the QA checks section (empty list = complete)."""
    m = re.search(r"QA checks", description, re.I)
    if not m:
        return ['no "QA checks" section']
    section = description[m.end():]
    problems = []
    for name in CARD_LINES:
        lm = re.search(r"^[\s*\-#>]*\**" + re.escape(name) + r"\**\s*:\**\s*(.*)$",
                       section, re.I | re.M)
        if not lm:
            problems.append(f'missing "{name}:"')
            continue
        value = lm.group(1).strip().strip("*").strip()
        if len(value) < 3 or PLACEHOLDER.match(value):
            problems.append(f'"{name}:" is empty or a placeholder')
    return problems


def jira_create(data: dict) -> None:
    ti = data.get("tool_input") or {}
    summary = str(ti.get("summary") or "")
    description = adf_text(ti.get("description") or "")
    problems = check_card(description)
    extra = ti.get("additional_fields") or {}
    labels = extra.get("labels") or []
    if isinstance(labels, list) and "automated-qa" not in labels and ti.get("issueTypeName", "").lower() == "bug":
        problems.append('labels lack "automated-qa" (the tracker\'s live panel needs it)')
    if "\u2014" in summary or "\u2014" in description:
        problems.append("em dash in the summary or description (org rule: no em dashes)")
    if problems:
        pre_tool("deny",
                 "openelis-qa filing gate: " + "; ".join(problems) +
                 ". Write the filing card first (qa-file-bug skill, references/filing-card.md) "
                 "and put its QA checks section at the end of the description: "
                 + ", ".join(f"{n}:" for n in CARD_LINES) + ".")
        return
    pre_tool("ask", f"Casey approves every QA ticket. Create \"{summary[:120]}\"?")


# ---------------------------------------------------------------- git-guard
GIT_BAD = [
    (re.compile(r"\bgit\s+add\s+(-A|--all)\b"), "git add -A"),
    (re.compile(r"\bgit\s+add\s+(\S+\s+)*\.(\s|$|;|&|\|)"), "git add ."),
    (re.compile(r"\bgit\s+commit\s+(\S+\s+)*-a[mv]*\b"), "git commit -a"),
    (re.compile(r"\bgit\s+push\s+(\S+\s+)*(--force\b|-f\b)(?!-with-lease)"), "git push --force"),
    (re.compile(r"\bgit\s+add\s+(\S+\s+)*\S*\.auth\b"), "adding .auth/"),
]


def git_guard(data: dict) -> None:
    ti = data.get("tool_input") or {}
    text = " ".join(str(ti.get(k) or "") for k in ("command", "script"))
    if "git" not in text:
        return
    in_qa = bool(QA_REPO.search(text) or QA_REPO.search(str(data.get("cwd") or "")))
    if not in_qa:
        return
    for rx, label in GIT_BAD:
        if rx.search(text):
            pre_tool("deny",
                     f"openelis-qa: {label} is not allowed in the QA repo (it is public; "
                     "stage files by name and never commit .auth/). Use `git add <paths>`; "
                     "use --force-with-lease only on your own branch.")
            return


# ---------------------------------------------------------------- tracker-reminder
def tool_uses(transcript_path: str):
    with open(transcript_path, encoding="utf-8") as f:
        for line in f:
            try:
                d = json.loads(line)
            except Exception:
                continue
            content = (d.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue
            for item in content:
                if isinstance(item, dict) and item.get("type") == "tool_use":
                    yield item.get("name") or "", item.get("input") or {}


def is_qa_write(name: str, inp: dict) -> bool:
    if JIRA_WRITE.search(name):
        return True
    text = " ".join(str(inp.get(k) or "") for k in ("command", "script"))
    return bool(QA_REPO.search(text) and re.search(r"\bgh\s+pr\s+(create|merge)\b", text))


def is_tracker_publish(name: str, inp: dict) -> bool:
    return name.endswith("Artifact") and TRACKER_ID in json.dumps(inp)


def tracker_reminder(data: dict) -> None:
    if data.get("stop_hook_active"):
        return
    path = data.get("transcript_path")
    if not path or not os.path.exists(path):
        return
    last_write = last_tracker = -1
    for i, (name, inp) in enumerate(tool_uses(path)):
        if is_qa_write(name, inp):
            last_write = i
        if is_tracker_publish(name, inp):
            last_tracker = i
    if last_write < 0 or last_tracker > last_write:
        return
    state = os.path.join(tempfile.gettempdir(),
                         f"openelis-qa-tracker-{re.sub(r'[^A-Za-z0-9_-]', '', str(data.get('session_id') or 'x'))}")
    try:
        with open(state, encoding="utf-8") as f:
            if int(f.read().strip() or -1) >= last_write:
                return
    except Exception:
        pass
    with open(state, "w", encoding="utf-8") as f:
        f.write(str(last_write))
    emit({"decision": "block",
          "reason": "openelis-qa: Jira or the QA repo changed since the QA tracker was last "
                    "published in this session. Update the tracker now (qa-tracker skill) and "
                    "name the rev in your summary, or say in one line why this round does not "
                    "change what Casey should know."})


COMMANDS = {
    "session-start": session_start,
    "jira-create": jira_create,
    "git-guard": git_guard,
    "tracker-reminder": tracker_reminder,
}

if __name__ == "__main__":
    try:
        COMMANDS[sys.argv[1]](read_input())
    except Exception:
        pass
    sys.exit(0)
