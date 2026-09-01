"""Overlay：ElevenLabs Instant Voice Clone（不改 vendor）。

协议对齐 bridge：execute(inputs) → {success, voice_id|error}
依赖：ELEVENLABS_API_KEY；音频公网 URL 或本地路径。
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


def execute(inputs: dict[str, Any]) -> dict[str, Any]:
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        return {"success": False, "error": "No ElevenLabs API key. Voice clone requires ELEVENLABS_API_KEY."}

    audio_url = inputs.get("audio_url") or inputs.get("reference_audio_url")
    audio_path = inputs.get("audio_path")
    name = str(inputs.get("name") or "anygen-clone")[:64]
    if not audio_url and not audio_path:
        return {"success": False, "error": "elevenlabs_voice_clone: audio_url or audio_path required"}

    try:
        import requests
    except Exception as exc:
        return {"success": False, "error": f"requests missing: {exc}"}

    try:
        if audio_path:
            path = Path(str(audio_path))
            data = path.read_bytes()
            filename = path.name
        else:
            res = requests.get(str(audio_url), timeout=60)
            res.raise_for_status()
            data = res.content
            suffix = Path(urlparse(str(audio_url)).path).suffix or ".mp3"
            filename = f"clone{suffix}"
        files = {"files": (filename, data, "application/octet-stream")}
        resp = requests.post(
            "https://api.elevenlabs.io/v1/voices/add",
            headers={"xi-api-key": api_key},
            data={"name": name},
            files=files,
            timeout=120,
        )
        if resp.status_code >= 400:
            return {"success": False, "error": f"ElevenLabs clone HTTP {resp.status_code}: {resp.text[:240]}"}
        body = resp.json()
        voice_id = body.get("voice_id")
        if not voice_id:
            return {"success": False, "error": "ElevenLabs clone returned no voice_id"}
        return {"success": True, "voice_id": voice_id, "data": {"voice_id": voice_id}}
    except Exception as exc:
        return {"success": False, "error": f"ElevenLabs clone failed: {exc}"}
