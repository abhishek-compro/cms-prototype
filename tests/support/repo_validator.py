"""
Loads the orchestrator's REAL placeholder helpers and validate_extra_content straight from its source
(via ast, nothing copied), with the Django/DB bits stubbed, so the prototype's output can be checked
against the repo's own code. Needs only python3 (standard library).

The orchestrator checkout is found via $ORCHESTRATOR_REPO (default ~/repos/sms-ivr-orchestrator).
Stubbed: check_turn_media (a database lookup), so every non-empty media id is accepted.

usage:  python3 -I repo_validator.py parity <cases.json>       compare get_body_params_map etc.
        python3 -I repo_validator.py validate <extra_content.json>   run validate_extra_content
"""
import ast
import json
import os
import re
import sys
from collections import defaultdict

REPO = os.environ.get("ORCHESTRATOR_REPO") or os.path.expanduser("~/repos/sms-ivr-orchestrator")


class ValidationError(Exception):
    pass


def _segments(path, wanted_funcs, wanted_assigns):
    src = open(path, encoding="utf-8").read()
    tree = ast.parse(src)
    out = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in wanted_funcs:
            out.append(ast.get_source_segment(src, node))
        elif isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id in wanted_assigns for t in node.targets
        ):
            out.append(ast.get_source_segment(src, node))
    return out, tree, src


def load():
    # TURN_LANGUAGES = [v for k, v in turnio.VALID_LANGUAGES.items() if len(k) == 3 and k.islower()]
    t_src = open(f"{REPO}/turnio.py", encoding="utf-8").read()
    valid = None
    for node in ast.parse(t_src).body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "VALID_LANGUAGES" for t in node.targets):
            valid = ast.literal_eval(node.value)
    turn_languages = [v for k, v in valid.items() if len(k) == 3 and k.islower()]

    segs, _, _ = _segments(
        f"{REPO}/campaign/models.py",
        {"get_template_vars", "get_body_params_map", "check_whatsapp_template_vars", "validate_required_keys", "validate_extra_content"},
        {"VARS_EXTRACT"},
    )
    ns = {
        "re": re,
        "defaultdict": defaultdict,
        "ValidationError": ValidationError,
        "TURN_LANGUAGES": turn_languages,
        "check_turn_media": lambda val: None,  # DB lookup stubbed: every non-empty media id is accepted
    }
    exec("\n\n".join(segs), ns)
    return ns, turn_languages


if __name__ == "__main__":
    ns, langs = load()
    mode, path = sys.argv[1], sys.argv[2]
    data = json.load(open(path, encoding="utf-8"))
    if mode == "parity":
        res = []
        for text in data:
            res.append({
                "text": text,
                "vars": ns["get_template_vars"](text),
                "map": {k: v for k, v in ns["get_body_params_map"](text).items()},
            })
        print(json.dumps(res))
    elif mode == "validate":
        results = {}
        cases = data if isinstance(data, dict) and all(isinstance(v, dict) for v in data.values()) and "header" not in data else {"export": data}
        for label, ec in cases.items():
            try:
                ns["validate_extra_content"](ec)
                results[label] = "OK"
            except ValidationError as e:
                results[label] = "ValidationError: " + str(e)
            except Exception as e:  # shape problems surface as KeyError/TypeError in the repo code
                results[label] = f"{type(e).__name__}: {e}"
        print(json.dumps(results, indent=1, ensure_ascii=False))
