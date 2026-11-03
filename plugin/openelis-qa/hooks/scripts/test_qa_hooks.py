#!/usr/bin/env python3
"""Self-tests for qa_hooks.py. Run: python3 hooks/scripts/test_qa_hooks.py (exit 1 on failure)."""
import json
import os
import subprocess
import sys
import tempfile
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
HOOK = os.path.join(HERE, "qa_hooks.py")
FAILS = []

CARD = """**Where:** Order entry
**What happens:** no toast

**QA checks**
- Confirmed: UI clickthrough in Chrome (screenshot) and API x3, 2 Nov
- Searched: open and Done OGC for "Save and next" toast; none found
- Rulings: none apply (R-27 covers the end of order entry, not toasts)
- Spec: OGC-1266 AC 4.2, every save names the order
- Build: testing.openelis-global.org, develop 482eb81c, 2 Nov 2026
- Not checked: other locales, Batch Order Entry
"""


def run(cmd, payload):
    p = subprocess.run([sys.executable, HOOK, cmd], input=json.dumps(payload),
                       capture_output=True, text=True, timeout=20)
    if p.returncode != 0:
        FAILS.append(f"{cmd}: exit {p.returncode}")
    return json.loads(p.stdout) if p.stdout.strip().startswith("{") else p.stdout


def decision(out):
    return out.get("hookSpecificOutput", {}).get("permissionDecision") if isinstance(out, dict) else None


def expect(name, got, want):
    if got != want:
        FAILS.append(f"{name}: got {got!r}, want {want!r}")


def jira(desc, labels=("automated-qa", "qa-found"), summary="Order Entry v4: no save message"):
    return {"tool_name": "mcp__Atlassian__createJiraIssue",
            "tool_input": {"issueTypeName": "Bug", "summary": summary, "description": desc,
                           "additional_fields": {"labels": list(labels)}}}


# jira-create
expect("complete card asks", decision(run("jira-create", jira(CARD))), "ask")
expect("no card denies", decision(run("jira-create", jira("**Where:** x\n**What happens:** y"))), "deny")
expect("missing line denies", decision(run("jira-create", jira(CARD.replace("- Spec: OGC-1266 AC 4.2, every save names the order\n", "")))), "deny")
expect("placeholder denies", decision(run("jira-create", jira(CARD.replace("Build: testing.openelis-global.org, develop 482eb81c, 2 Nov 2026", "Build: TBD")))), "deny")
expect("no automated-qa label denies", decision(run("jira-create", jira(CARD, labels=("qa-found",)))), "deny")
expect("em dash denies", decision(run("jira-create", jira(CARD, summary="Order entry \u2014 no toast"))), "deny")
adf = {"type": "doc", "version": 1, "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": line}]} for line in CARD.splitlines()]}
expect("ADF card asks", decision(run("jira-create", jira(adf))), "ask")
expect("ADF string card asks", decision(run("jira-create", jira(json.dumps(adf)))), "ask")

# git-guard
def bash(cmd, cwd="/home/claude/openelis-qa"):
    return {"tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": cwd}

expect("git add -A in QA repo denied", decision(run("git-guard", bash("git add -A"))), "deny")
expect("git add . in QA repo denied", decision(run("git-guard", bash("cd x && git add . && git commit -m y"))), "deny")
expect("git add by path allowed", decision(run("git-guard", bash("git add RULINGS.md plugin/"))), None)
expect("git add -A elsewhere allowed", decision(run("git-guard", bash("git add -A", cwd="/tmp/other"))), None)
expect("osascript in QA worktree denied", decision(run("git-guard", {"tool_name": "mcp__remote-devices__Control_your_Mac__osascript", "tool_input": {"script": 'do shell script "cd ~/dev/OpenELIS-QA-x && git add --all"'}})), "deny")
expect("force push denied", decision(run("git-guard", bash("git push -f origin main"))), "deny")
expect("force-with-lease allowed", decision(run("git-guard", bash("git push --force-with-lease origin qa/x"))), None)
expect("commit -am denied", decision(run("git-guard", bash("git commit -am wip"))), "deny")

# tracker-reminder
def transcript(entries):
    fd, path = tempfile.mkstemp(suffix=".jsonl")
    with os.fdopen(fd, "w") as f:
        for name, inp in entries:
            f.write(json.dumps({"type": "assistant", "message": {"content": [
                {"type": "tool_use", "name": name, "input": inp}]}}) + "\n")
    return path

sid = str(uuid.uuid4())
t1 = transcript([("mcp__Atlassian__addCommentToJiraIssue", {"issueIdOrKey": "OGC-1"})])
out = run("tracker-reminder", {"transcript_path": t1, "session_id": sid})
expect("jira write without tracker blocks", out.get("decision") if isinstance(out, dict) else None, "block")
out = run("tracker-reminder", {"transcript_path": t1, "session_id": sid})
expect("second stop for same write does not nag", out, "")
out = run("tracker-reminder", {"transcript_path": t1, "session_id": str(uuid.uuid4()), "stop_hook_active": True})
expect("stop_hook_active never blocks", out, "")
t2 = transcript([("mcp__Atlassian__addCommentToJiraIssue", {}),
                 ("Artifact", {"url": "https://claude.ai/artifact/P6HYxRu9vUvfAoXMETKN2h", "file_path": "t.html"})])
expect("tracker after write passes", run("tracker-reminder", {"transcript_path": t2, "session_id": str(uuid.uuid4())}), "")
t3 = transcript([("Bash", {"command": "ls"}), ("Read", {"file_path": "x"})])
expect("no writes passes", run("tracker-reminder", {"transcript_path": t3, "session_id": str(uuid.uuid4())}), "")
t4 = transcript([("mcp__remote-devices__Control_your_Mac__osascript", {"script": "cd ~/dev/OpenELIS-QA-p && gh pr merge 240 --squash"})])
out = run("tracker-reminder", {"transcript_path": t4, "session_id": str(uuid.uuid4())})
expect("QA PR merge without tracker blocks", out.get("decision") if isinstance(out, dict) else None, "block")

# session-start
out = run("session-start", {})
expect("session-start prints context", isinstance(out, str) and "qa-run" in out, True)

# broken input never blocks
p = subprocess.run([sys.executable, HOOK, "jira-create"], input="not json", capture_output=True, text=True)
expect("bad input exits 0", p.returncode, 0)

for path in (t1, t2, t3, t4):
    os.unlink(path)

if FAILS:
    print("qa_hooks self-test FAILED:")
    for f in FAILS:
        print("  " + f)
    sys.exit(1)
print("qa_hooks self-test: all cases pass")
