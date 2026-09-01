#!/usr/bin/env python3
"""JSON bridge: 调用 vendor/openmontage 工具的唯一入口。

用法: echo '{"tool":"seedance_ark","inputs":{...}}' | ./run.py
协议: stdin JSON -> stdout {"ok":bool,"result"|"error": ...}
"""
import json
import sys
from pathlib import Path

BRIDGE_DIR = Path(__file__).resolve().parent
VENDOR = Path(__file__).resolve().parents[2] / "vendor" / "openmontage"
sys.path.insert(0, str(BRIDGE_DIR))
sys.path.insert(0, str(VENDOR))

from tools.tool_registry import registry  # noqa: E402


def main() -> None:
    try:
        req = json.loads(sys.stdin.read())
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"bad json: {e}"}))
        return
    name = req.get("tool")
    inputs = req.get("inputs", {})
    try:
        if name == "elevenlabs_voice_clone":
            from elevenlabs_clone import execute as overlay_clone  # noqa: E402

            out = overlay_clone(inputs)
            print(json.dumps({"ok": True, "result": out}, default=str, ensure_ascii=False))
            return
        registry.discover()
        tool = registry._tools.get(name)
        if tool is None:
            print(json.dumps({"ok": False, "error": f"unknown tool: {name}"}))
            return
        action = req.get("action", "execute")
        if action == "estimate_cost":
            out = {"cost_usd": tool.estimate_cost(inputs)}
        elif action == "get_info":
            out = tool.get_info()
        elif action == "dry_run":
            out = tool.dry_run(inputs)
        else:
            out = tool.execute(inputs)
        def _ser(o):
            if hasattr(o, "__dataclass_fields__"):
                from dataclasses import asdict
                return asdict(o)
            try:
                json.dumps(o)
                return o
            except Exception:
                return str(o)
        print(json.dumps({"ok": True, "result": _ser(out)}, default=str, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}))


if __name__ == "__main__":
    main()
