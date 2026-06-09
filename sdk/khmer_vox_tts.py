from __future__ import annotations

import base64
import time
from pathlib import Path
from typing import Any, Iterable

import requests


class KhmerVoxTTS:
    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    def speech(self, text: str, output_path: str | Path, voice: str | None = None, model: str = "voxcpm2") -> None:
        payload = {"input": text, "model": model}
        if voice:
            payload["voice"] = voice
        response = requests.post(
            f"{self.base_url}/api/v1/audio/speech",
            headers={**self.headers, "Content-Type": "application/json"},
            json=payload,
            timeout=600,
        )
        response.raise_for_status()
        Path(output_path).write_bytes(response.content)

    def clone(
        self,
        text: str,
        sample_path: str | Path,
        output_path: str | Path,
        voice: str = "match the reference speaker clearly",
        model: str = "voxcpm2",
    ) -> None:
        response = requests.post(
            f"{self.base_url}/api/v1/audio/clone",
            headers={**self.headers, "Content-Type": "application/json"},
            json={
                "input": text,
                "voice": voice,
                "model": model,
                "voice_consent": True,
                "clone_audio_base64": base64.b64encode(Path(sample_path).read_bytes()).decode("utf-8"),
                "clone_audio_mime_type": "audio/wav",
            },
            timeout=600,
        )
        response.raise_for_status()
        Path(output_path).write_bytes(response.content)

    def batch_speech(
        self,
        lines: Iterable[str | dict[str, Any]],
        output_zip_path: str | Path,
        voice: str | None = None,
        model: str = "voxcpm2",
        webhook_url: str | None = None,
        external_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict:
        payload = {"input": list(lines), "model": model}
        if voice:
            payload["voice"] = voice
        if webhook_url:
            payload["webhook_url"] = webhook_url
        if external_id:
            payload["external_id"] = external_id
        if metadata is not None:
            payload["metadata"] = metadata
        response = requests.post(
            f"{self.base_url}/api/v1/audio/batch",
            headers={**self.headers, "Content-Type": "application/json"},
            json=payload,
            timeout=600,
        )
        response.raise_for_status()
        job = response.json()["job"]
        return self.wait_and_download(job["id"], output_zip_path)

    def batch_clone(
        self,
        lines: Iterable[str | dict[str, Any]],
        sample_path: str | Path,
        output_zip_path: str | Path,
        voice: str = "match the reference speaker clearly",
        model: str = "voxcpm2",
        webhook_url: str | None = None,
        external_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict:
        payload = {
            "input": list(lines),
            "voice": voice,
            "model": model,
            "voice_consent": True,
            "clone_audio_base64": base64.b64encode(Path(sample_path).read_bytes()).decode("utf-8"),
            "clone_audio_mime_type": "audio/wav",
        }
        if webhook_url:
            payload["webhook_url"] = webhook_url
        if external_id:
            payload["external_id"] = external_id
        if metadata is not None:
            payload["metadata"] = metadata
        response = requests.post(
            f"{self.base_url}/api/v1/audio/batch/clone",
            headers={**self.headers, "Content-Type": "application/json"},
            json=payload,
            timeout=600,
        )
        response.raise_for_status()
        job = response.json()["job"]
        return self.wait_and_download(job["id"], output_zip_path)

    def wait_and_download(self, job_id: str, output_zip_path: str | Path, interval_seconds: float = 2.5) -> dict:
        while True:
            status_response = requests.get(
                f"{self.base_url}/api/v1/audio/batch/jobs/{job_id}",
                headers=self.headers,
                timeout=60,
            )
            status_response.raise_for_status()
            data = status_response.json()
            if data["job"]["status"] in {"completed", "partial", "failed", "needs_review"}:
                break
            time.sleep(interval_seconds)

        zip_response = requests.get(
            f"{self.base_url}/api/v1/audio/batch/jobs/{job_id}/download",
            headers=self.headers,
            timeout=600,
        )
        zip_response.raise_for_status()
        Path(output_zip_path).write_bytes(zip_response.content)
        return data
