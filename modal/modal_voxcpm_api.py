import base64
import json
import io
import os
from pathlib import Path
from typing import Literal

import modal


APP_NAME = "voxcpm2-nanovllm-tts-api"
MODEL_ID = os.environ.get("VOXCPM_MODEL_ID", "openbmb/VoxCPM2")
MODEL_DIR = "/models/VoxCPM2"
PUBLIC_BASE_URL = os.environ.get(
    "PUBLIC_BASE_URL",
    "https://reaksabbb3--voxcpm2-nanovllm-tts-api-api.modal.run",
)

GPU_TYPE = os.environ.get("VOXCPM_GPU", "L40S")
# How long a GPU container stays warm after its last request before scaling to
# zero. You pay for every second a container is warm, even when idle, so this is
# the main idle-cost lever. 60s was too aggressive (frequent cold-start timeouts
# for users arriving a minute apart); 600s (10 min) kept far too many idle GPUs
# warm and wasted credit. 300s (5 min) is the current cost/UX balance for bursty
# usage: it bridges users (and multi-segment batches) that arrive within ~5
# minutes while still scaling to zero when truly idle. Measured cold start is
# ~58s vs ~1.2s warm, so a wider window meaningfully cuts perceived latency.
# Raise toward 600 if cold starts still feel frequent; lower to cut idle cost.
SCALEDOWN_WINDOW = int(os.environ.get("VOXCPM_SCALEDOWN_WINDOW", "300"))
MAX_NUM_SEQS = int(os.environ.get("VOXCPM_MAX_NUM_SEQS", "16"))
MAX_NUM_BATCHED_TOKENS = int(os.environ.get("VOXCPM_MAX_NUM_BATCHED_TOKENS", "8192"))
MAX_MODEL_LEN = int(os.environ.get("VOXCPM_MAX_MODEL_LEN", "4096"))
GPU_MEMORY_UTILIZATION = float(os.environ.get("VOXCPM_GPU_MEMORY_UTILIZATION", "0.90"))
# Diffusion/acoustic decoding steps per generation. Lower = faster decode with
# a modest quality tradeoff (higher = smoother but slower). 10 was the upstream
# default; 8 trims ~20% off the decode stage with negligible audible difference
# in testing. Tune with VOXCPM_INFERENCE_TIMESTEPS (requires a Modal redeploy).
INFERENCE_TIMESTEPS = int(os.environ.get("VOXCPM_INFERENCE_TIMESTEPS", "8"))

# ZipEnhancer denoiser (opt-in per request via denoise=True). ModelScope model
# id for acoustic noise suppression; runs on a 16kHz mono pipeline and cleans a
# noisy reference clip before it is encoded into latents for cloning. Loaded
# lazily on first use so it adds no cost to clean-reference clones. Set to an
# empty string to disable the feature entirely at the server.
ZIPENHANCER_MODEL_ID = os.environ.get(
    "VOXCPM_ZIPENHANCER_MODEL_ID", "iic/speech_zipenhancer_ans_multiloss_16k_base"
)

API_KEY_SECRET_NAME = os.environ.get("VOXCPM_API_KEY_SECRET_NAME", "voxcpm-api-key")
API_SECRETS = [modal.Secret.from_name(API_KEY_SECRET_NAME)]


MODEL_CATALOG = [
    {
        "id": "voxcpm2-tts",
        "name": "VoxCPM2 TTS",
        "status": "live",
        "readiness": "model ready",
        "service": "tts",
        "endpoint": "/v1/audio/speech",
        "gpu": "L40S by default",
        "model": "openbmb/VoxCPM2",
        "purpose": "Generate Khmer speech from text with optional voice description or reference audio.",
    },
    {
        "id": "funasr-asr",
        "name": "FunASR SenseVoice / Paraformer",
        "status": "api-live",
        "readiness": "worker not configured",
        "service": "asr",
        "endpoint": "/v1/audio/transcriptions",
        "gpu": "L4, A40, or A100",
        "model": "SenseVoiceSmall / Paraformer",
        "purpose": "Transcribe Chinese and Asian drama audio before translation.",
    },
    {
        "id": "funasr-vad",
        "name": "FunASR FSMN-VAD",
        "status": "api-live",
        "readiness": "worker not configured",
        "service": "vad",
        "endpoint": "/v1/audio/vad",
        "gpu": "CPU or small GPU",
        "model": "fsmn-vad",
        "purpose": "Detect speech windows and catch lines that ASR misses.",
    },
    {
        "id": "rvc",
        "name": "RVC Male/Female Voices",
        "status": "api-live",
        "readiness": "model files required",
        "service": "voice-conversion",
        "endpoint": "/v1/audio/convert",
        "gpu": "L4 or better",
        "model": "User-trained male/female RVC models",
        "purpose": "Convert Edge TTS or model TTS into the trained dubber voices.",
    },
    {
        "id": "demucs-uvr",
        "name": "Demucs / UVR Separation",
        "status": "api-live",
        "readiness": "worker not configured",
        "service": "source-separation",
        "endpoint": "/v1/audio/separate",
        "gpu": "A40 or A100 preferred",
        "model": "Demucs, MDX-Net, RoFormer",
        "purpose": "Separate original voice, music, and background before mixing Khmer dub.",
    },
    {
        "id": "diarization",
        "name": "Speaker Diarization",
        "status": "api-live",
        "readiness": "token/model required",
        "service": "speaker",
        "endpoint": "/v1/audio/diarize",
        "gpu": "L4 or better",
        "model": "pyannote / NeMo",
        "purpose": "Detect who speaks when and keep character voice routing stable.",
    },
    {
        "id": "gender",
        "name": "Voice Type Detection",
        "status": "api-live",
        "readiness": "worker not configured",
        "service": "gender",
        "endpoint": "/v1/audio/gender",
        "gpu": "CPU or small GPU",
        "model": "inaSpeechSegmenter / wav2vec2",
        "purpose": "Route speakers to male or female Khmer voice with manual override.",
    },
    {
        "id": "alignment",
        "name": "Word Alignment",
        "status": "api-live",
        "readiness": "worker not configured",
        "service": "alignment",
        "endpoint": "/v1/audio/align",
        "gpu": "L4 or better",
        "model": "WhisperX / stable-ts",
        "purpose": "Repair word timestamps and protect original speech start times.",
    },
    {
        "id": "validator",
        "name": "Timing Validator",
        "status": "api-live",
        "readiness": "contract ready",
        "service": "validator",
        "endpoint": "/v1/dubber/validate",
        "gpu": "CPU",
        "model": "FFmpeg plus custom timing checks",
        "purpose": "Report missing audio, late starts, overlong clips, and failed segments.",
    },
]

MODEL_DETAILS = {
    "voxcpm2-tts": {
        "summary": "Model-ready Khmer TTS endpoint for direct text-to-speech generation and reference-audio voice cloning on Modal GPU.",
        "dubber_step": "Use after Khmer translation when the selected TTS mode is VoxCPM.",
        "input": "JSON text input plus optional voice description, reference audio clone, or prompt-audio clone.",
        "output": "audio/wav bytes.",
        "example": {
            "model": "voxcpm2",
            "input": "Khmer text here",
            "voice": "young Khmer male voice, warm and clear tone",
            "response_format": "wav",
        },
        "response_example": {
            "content_type": "audio/wav",
            "body": "WAV_BYTES",
        },
        "clone_example": {
            "model": "voxcpm2",
            "input": "Khmer text here",
            "voice": "same speaker as the reference audio, clear Khmer speech",
            "response_format": "wav",
            "ref_audio_wav_base64": "BASE64_REFERENCE_AUDIO_HERE",
            "ref_audio_wav_format": "wav",
        },
        "prompt_clone_example": {
            "model": "voxcpm2",
            "input": "Khmer text here",
            "response_format": "wav",
            "prompt_wav_base64": "BASE64_REFERENCE_AUDIO_HERE",
            "prompt_wav_format": "wav",
            "prompt_text": "Text spoken in the reference audio",
        },
        "notes": [
            "This is the only model-ready service in the current app.",
            "Voice clone is supported with ref_audio_wav_base64 for simple reference cloning.",
            "Prompt clone is supported with prompt_wav_base64 plus matching prompt_text.",
            "Use clean 5-15 second WAV reference audio for better clone results.",
            "First request can be slower after cold start because the GPU worker and model need to load.",
            "Use this as the cloud TTS option when Edge TTS is unstable.",
        ],
    },
    "funasr-asr": {
        "summary": "ASR endpoint contract for FunASR SenseVoice or Paraformer transcription.",
        "dubber_step": "Use at the transcription stage before translation and TTS.",
        "input": "Audio/video file upload or audio URL, plus source language/options.",
        "output": "Segments with start/end time, text, language, and confidence when available.",
        "example": {
            "model": "SenseVoiceSmall",
            "audio_url": "https://example.com/source.wav",
            "language": "auto",
            "return_segments": True,
        },
        "response_example": {
            "language": "zh",
            "duration": 300.0,
            "segments": [
                {"id": "seg_0001", "start": 1.2, "end": 3.9, "text": "source line"}
            ],
        },
        "notes": [
            "Best target is Chinese and Asian drama audio.",
            "Worker route is live, but the FunASR runtime is not wired yet.",
            "Use Whisper or alignment repair if timestamps are not good enough for dubbing.",
        ],
    },
    "funasr-vad": {
        "summary": "VAD endpoint contract for detecting spoken windows before or after ASR.",
        "dubber_step": "Use before ASR to split long audio, and after ASR to catch missed speech.",
        "input": "Audio file upload or audio URL.",
        "output": "Speech windows with start/end times.",
        "example": {
            "model": "fsmn-vad",
            "audio_url": "https://example.com/source.wav",
            "min_speech_ms": 250,
            "merge_gap_ms": 200,
        },
        "response_example": {
            "speech_windows": [{"start": 1.15, "end": 3.95, "confidence": 0.92}]
        },
        "notes": [
            "This should be cheap compared with ASR and separation.",
            "Use it to prevent missing dialogue in final dubbed output.",
            "Worker route is live, but VAD inference is not wired yet.",
        ],
    },
    "rvc": {
        "summary": "Voice conversion endpoint contract for your trained male/female RVC voices.",
        "dubber_step": "Use after Edge TTS or model TTS generation, before timing fit and final mix.",
        "input": "Input WAV plus target voice id such as male or female.",
        "output": "Converted audio/wav bytes or a converted audio artifact URL.",
        "example": {
            "model": "rvc",
            "voice": "male",
            "audio_url": "https://example.com/edge_tts_segment.wav",
            "pitch_shift": 0,
        },
        "response_example": {
            "audio_url": "https://example.com/converted/seg_0001.wav",
            "voice": "male",
            "duration": 2.7,
        },
        "notes": [
            "This needs your actual RVC model files uploaded or mounted.",
            "Use separate male/female voices and route from speaker/gender detection.",
            "Do duration fitting after conversion because RVC can slightly change audio length.",
        ],
    },
    "demucs-uvr": {
        "summary": "Source separation endpoint contract for voice/music/background splitting.",
        "dubber_step": "Use early when you need to remove original voice or preserve background music.",
        "input": "Video/audio file upload or URL, plus separation mode.",
        "output": "Stem artifact URLs such as vocals, instrumental, speech, music, or background.",
        "example": {
            "model": "demucs",
            "audio_url": "https://example.com/source.wav",
            "stems": ["vocals", "other"],
        },
        "response_example": {
            "stems": {
                "vocals": "https://example.com/stems/vocals.wav",
                "other": "https://example.com/stems/other.wav",
            }
        },
        "notes": [
            "This is one of the slowest steps; do not run it for every fast preview.",
            "A40 or A100 is better for full-quality batch separation.",
            "Worker route is live, but Demucs/UVR inference is not wired yet.",
        ],
    },
    "diarization": {
        "summary": "Speaker diarization endpoint contract for detecting who speaks when.",
        "dubber_step": "Use after ASR/VAD to keep character voice assignment stable.",
        "input": "Audio file plus optional existing speech segments.",
        "output": "Speaker turns such as SPEAKER_01 with start/end times.",
        "example": {
            "model": "pyannote",
            "audio_url": "https://example.com/source.wav",
            "min_speakers": 1,
            "max_speakers": 8,
        },
        "response_example": {
            "speakers": ["SPEAKER_01", "SPEAKER_02"],
            "turns": [{"speaker": "SPEAKER_01", "start": 1.2, "end": 3.9}],
        },
        "notes": [
            "This may require a Hugging Face token depending on the model.",
            "Use manual overrides because overlap and off-camera speech can be wrong.",
            "Worker route is live, but diarization inference is not wired yet.",
        ],
    },
    "gender": {
        "summary": "Voice-type detection endpoint contract for male/female routing.",
        "dubber_step": "Use after speaker grouping to choose Khmer male or female TTS/RVC voice.",
        "input": "Clean speaker audio clip or speaker-level audio samples.",
        "output": "Voice type probabilities and selected route.",
        "example": {
            "model": "inaSpeechSegmenter",
            "audio_url": "https://example.com/speaker_01.wav",
            "labels": ["male", "female", "unknown"],
        },
        "response_example": {
            "speaker": "SPEAKER_01",
            "voice_type": "male",
            "confidence": 0.81,
            "route": "male",
        },
        "notes": [
            "Treat this as voice-type detection, not guaranteed real gender.",
            "Keep unknown/manual override for uncertain speakers.",
            "Worker route is live, but gender inference is not wired yet.",
        ],
    },
    "alignment": {
        "summary": "Word alignment endpoint contract for repairing timestamps.",
        "dubber_step": "Use after ASR when segment starts or word timing are not accurate enough.",
        "input": "Audio plus ASR transcript or segment list.",
        "output": "Aligned segments and word-level timestamps.",
        "example": {
            "model": "whisperx",
            "audio_url": "https://example.com/source.wav",
            "segments": [{"start": 1.2, "end": 3.9, "text": "source line"}],
        },
        "response_example": {
            "segments": [
                {
                    "id": "seg_0001",
                    "start": 1.2,
                    "end": 3.9,
                    "words": [{"word": "source", "start": 1.25, "end": 1.62}],
                }
            ]
        },
        "notes": [
            "Original speech start time should remain the master timeline for dubbing.",
            "Use this to repair bad ASR timing, not to silently invent timing.",
            "Worker route is live, but alignment inference is not wired yet.",
        ],
    },
    "validator": {
        "summary": "Timing validation endpoint contract for final dub quality checks.",
        "dubber_step": "Use after TTS/RVC/timing fit and before final export is called complete.",
        "input": "Segment manifest, generated audio paths, and original timing data.",
        "output": "Validation report with missing audio, drift, overrun, and failed segments.",
        "example": {
            "segments": [
                {
                    "id": "seg_0001",
                    "start": 1.2,
                    "end": 3.9,
                    "dub_audio_url": "https://example.com/seg_0001.wav",
                }
            ]
        },
        "response_example": {
            "passed": False,
            "summary": {"segments": 1, "failed": 1, "missing_audio": 0},
            "issues": [
                {"id": "seg_0001", "type": "too_long", "message": "Dubbed audio exceeds slot."}
            ],
        },
        "notes": [
            "This should run for every export.",
            "Failed segments should be rerun individually instead of regenerating the full video.",
            "Route is live as a contract; full validator logic is not wired yet.",
        ],
    },
}


image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.1-devel-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install(
        "build-essential",
        "ffmpeg",
        "git",
        "libsndfile1",
        "ninja-build",
    )
    .pip_install(
        "torch==2.7.1",
        "torchaudio==2.7.1",
        "packaging",
        "wheel",
        "setuptools",
        "numpy",
        "soundfile",
    )
    .pip_install("flash-attn==2.8.3", extra_options="--no-build-isolation")
    .pip_install(
        "fastapi[standard]",
        "huggingface_hub",
        "nano-vllm-voxcpm==2.0.1",
        # ZipEnhancer reference-audio denoiser (opt-in). modelscope hosts the
        # iic/speech_zipenhancer_ans_multiloss_16k_base acoustic-noise-suppression
        # model. Only loaded lazily on first denoise=True request so clean-
        # reference clones are unaffected in cold-start cost.
        "modelscope",
    )
)

app = modal.App(APP_NAME, image=image)
model_volume = modal.Volume.from_name("voxcpm2-model-cache", create_if_missing=True)


def _check_bearer(auth_header: str | None) -> None:
    from fastapi import HTTPException

    expected = os.environ.get("VOXCPM_API_KEY", "").strip()
    if not expected:
        return
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth_header.removeprefix("Bearer ").strip()
    if token != expected:
        raise HTTPException(status_code=403, detail="Invalid bearer token")


def _audio_format_from_mime_or_name(value: str | None, fallback: str = "wav") -> str:
    if not value:
        return fallback
    lower = value.lower()
    if "mp3" in lower or "mpeg" in lower or lower.endswith(".mp3"):
        return "mp3"
    if "wav" in lower or "wave" in lower or lower.endswith(".wav"):
        return "wav"
    if "webm" in lower or lower.endswith(".webm"):
        return "webm"
    if "ogg" in lower or lower.endswith(".ogg"):
        return "ogg"
    if "m4a" in lower or "mp4" in lower or lower.endswith(".m4a"):
        return "m4a"
    return fallback


def _service_not_configured(service_id: str) -> dict:
    item = next(item for item in MODEL_CATALOG if item["id"] == service_id)
    detail = MODEL_DETAILS[item["id"]]
    return {
        "status": "api_live",
        "readiness": item["readiness"],
        "service": item,
        "expected_response": detail.get("response_example", {}),
        "message": (
            "This HTTP route is deployed for the dubber app. The model worker is not wired yet, "
            "so this endpoint returns a contract response instead of running inference."
        ),
    }


def _service_contract_response(service_id: str, payload: dict | None = None) -> dict:
    item = next(item for item in MODEL_CATALOG if item["id"] == service_id)
    detail = MODEL_DETAILS[item["id"]]
    request_payload = payload or {}
    requested_format = (
        request_payload.get("response_format")
        or request_payload.get("output_format")
        or request_payload.get("format")
        or "json"
    )
    response_schema = (
        request_payload.get("response_schema")
        or request_payload.get("output_schema")
        or request_payload.get("schema")
    )
    if response_schema is not None:
        model_response = {
            "format": requested_format,
            "schema": response_schema,
            "data": response_schema,
            "note": "Contract response shaped from the user-provided response_schema.",
        }
    else:
        model_response = {
            "format": requested_format,
            "data": detail.get("response_example", {}),
            "note": "Default contract response. Add response_schema to request a custom output shape.",
        }
    return {
        "status": "api_live",
        "readiness": item["readiness"],
        "service": item,
        "received_request": request_payload,
        "requested_response_format": requested_format,
        "requested_response_schema": response_schema,
        "model_response": model_response,
        "expected_response": detail.get("response_example", {}),
        "local_worker_contract": {
            "mode": "bring-your-own-model",
            "description": (
                "Your app can send this request shape to either this cloud endpoint or a local PC worker "
                "running the same endpoint contract."
            ),
            "custom_output": (
                "Send response_format/output_format for the output type and response_schema/output_schema "
                "when your app needs a specific JSON structure."
            ),
        },
        "message": (
            "The route is live and accepts requests. Connect the real model worker to replace this "
            "contract response with inference output."
        ),
    }


def _model_by_id(model_id: str) -> dict | None:
    return next((item for item in MODEL_CATALOG if item["id"] == model_id), None)


def _render_model_detail_html(model_id: str) -> str:
    item = _model_by_id(model_id)
    if item is None:
        return ""

    detail = MODEL_DETAILS[item["id"]]
    example = json.dumps(detail["example"], indent=2, ensure_ascii=False)
    response_example = json.dumps(detail.get("response_example", {}), indent=2, ensure_ascii=False)
    clone_example = detail.get("clone_example")
    prompt_clone_example = detail.get("prompt_clone_example")
    clone_section = ""
    if clone_example:
        clone_section += f"""
  <h2>Voice Clone Request</h2>
  <p>Use this when you have a short clean reference voice clip and want VoxCPM to speak with a similar voice.</p>
  <pre><code>POST {PUBLIC_BASE_URL}{item['endpoint']}
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json

{json.dumps(clone_example, indent=2, ensure_ascii=False)}</code></pre>
"""
    if prompt_clone_example:
        clone_section += f"""
  <h2>Prompt Clone Request</h2>
  <p>Use this when the reference audio has known matching text. The prompt text helps the model understand the speaker sample.</p>
  <pre><code>POST {PUBLIC_BASE_URL}{item['endpoint']}
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json

{json.dumps(prompt_clone_example, indent=2, ensure_ascii=False)}</code></pre>
"""
    notes = "\n".join(f"<li>{note}</li>" for note in detail["notes"])
    return f"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{item['name']} Detail</title>
  <style>
    :root {{
      color-scheme: light dark;
      --bg: #f6f7f4;
      --panel: #ffffff;
      --text: #19201d;
      --muted: #667169;
      --line: #dce2dc;
      --accent: #176b3a;
      --live-bg: #dff4e6;
      --live-text: #0e5a2d;
      --api-bg: #e3efff;
      --api-text: #174d8d;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.5;
    }}
    main {{ max-width: 980px; margin: 0 auto; padding: 34px 22px 72px; }}
    a {{ color: var(--accent); text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    h1 {{ font-size: clamp(30px, 5vw, 52px); line-height: 1.02; margin: 12px 0 10px; letter-spacing: 0; }}
    h2 {{ font-size: 22px; margin: 28px 0 10px; letter-spacing: 0; }}
    p {{ margin: 0; }}
    .muted {{ color: var(--muted); }}
    .topline {{ display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 22px; }}
    .pill {{
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      font-size: 14px;
    }}
    .status {{
      display: inline-flex;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }}
    .status.live {{ background: var(--live-bg); color: var(--live-text); }}
    .status.api-live {{ background: var(--api-bg); color: var(--api-text); }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }}
    .panel {{
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 14px;
    }}
    .panel strong {{ display: block; margin-bottom: 4px; }}
    pre, code {{ font-family: "Cascadia Mono", Consolas, "SFMono-Regular", monospace; }}
    pre {{
      overflow-x: auto;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      font-size: 13px;
    }}
    ul {{ margin: 0; padding-left: 20px; }}
    li {{ margin: 6px 0; }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #101411;
        --panel: #171d19;
        --text: #edf2ee;
        --muted: #9eaaa2;
        --line: #303a33;
        --accent: #86d69f;
        --live-bg: #143922;
        --live-text: #8ee7a9;
        --api-bg: #183556;
        --api-text: #9ed0ff;
      }}
    }}
  </style>
</head>
<body>
<main>
  <a href="/">&larr; Back to model hub</a>
  <h1>{item['name']}</h1>
  <p class="muted">{detail['summary']}</p>
  <div class="topline">
    <span class="status {item['status']}">{item['status']}</span>
    <span class="pill">{item['readiness']}</span>
    <span class="pill">{item['service']}</span>
    <span class="pill">{item['gpu']}</span>
  </div>

  <div class="grid">
    <section class="panel"><strong>Endpoint</strong><code>{item['endpoint']}</code></section>
    <section class="panel"><strong>Model</strong>{item['model']}</section>
    <section class="panel"><strong>Dubber Step</strong>{detail['dubber_step']}</section>
    <section class="panel"><strong>Output</strong>{detail['output']}</section>
  </div>

  <h2>Input</h2>
  <p>{detail['input']}</p>

  <h2>Example Request</h2>
  <pre><code>POST {PUBLIC_BASE_URL}{item['endpoint']}
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json

{example}</code></pre>

  {clone_section}

  <h2>Expected Response</h2>
  <pre><code>{response_example}</code></pre>

  <h2>Custom Response Format</h2>
  <p>For API-live model routes, the caller can request the output shape they want. Use <code>response_format</code>, <code>output_format</code>, <code>response_schema</code>, or <code>output_schema</code>. A local PC worker should follow the same contract.</p>
  <pre><code>POST {PUBLIC_BASE_URL}{item['endpoint']}
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json

{{
  "audio_url": "https://example.com/input.wav",
  "response_format": "json",
  "response_schema": {{
    "segments": [
      {{
        "start": 0.0,
        "end": 0.0,
        "text": "",
        "speaker": ""
      }}
    ],
    "summary": {{
      "language": "",
      "duration": 0.0
    }}
  }}
}}</code></pre>

  <h2>Local Worker Mode</h2>
  <p>Your dubber can call the same endpoint contract on a cloud API or on a user's own local PC worker. Keep the request and response shape the same, then switch only the base URL.</p>
  <pre><code>Cloud base URL:
{PUBLIC_BASE_URL}

Local PC base URL:
http://127.0.0.1:8000</code></pre>

  <h2>Notes</h2>
  <ul>{notes}</ul>
</main>
</body>
</html>
"""


def _render_docs_html() -> str:
    live_count = sum(1 for item in MODEL_CATALOG if item["status"] == "live")
    api_live_count = sum(1 for item in MODEL_CATALOG if item["status"] == "api-live")
    rows = "\n".join(
        f"""
        <tr>
          <td><span class="status {item['status']}">{item['status']}</span></td>
          <td><a class="model-link" href="/models/{item['id']}"><strong>{item['name']}</strong></a><small>{item['model']}</small><small>{item['readiness']}</small></td>
          <td>{item['service']}</td>
          <td><code>{item['endpoint']}</code></td>
          <td>{item['gpu']}</td>
          <td>{item['purpose']}</td>
        </tr>
        """
        for item in MODEL_CATALOG
    )
    cards = "\n".join(
        f"""
        <section class="model">
          <div class="model-top">
            <h3><a class="model-link" href="/models/{item['id']}">{item['name']}</a></h3>
            <span class="status {item['status']}">{item['status']}</span>
          </div>
          <p>{item['purpose']}</p>
          <dl>
            <div><dt>Endpoint</dt><dd><code>{item['endpoint']}</code></dd></div>
            <div><dt>Readiness</dt><dd>{item['readiness']}</dd></div>
            <div><dt>Model</dt><dd>{item['model']}</dd></div>
            <div><dt>GPU</dt><dd>{item['gpu']}</dd></div>
          </dl>
        </section>
        """
        for item in MODEL_CATALOG
    )
    return f"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dubber AI Model API Hub</title>
  <style>
    :root {{
      color-scheme: light dark;
      --bg: #f6f7f4;
      --panel: #ffffff;
      --text: #19201d;
      --muted: #667169;
      --line: #dce2dc;
      --accent: #176b3a;
      --live-bg: #dff4e6;
      --live-text: #0e5a2d;
      --api-bg: #e3efff;
      --api-text: #174d8d;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.5;
    }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 34px 22px 72px; }}
    header {{ display: grid; gap: 12px; margin-bottom: 26px; }}
    h1 {{ font-size: clamp(30px, 5vw, 56px); line-height: 1.02; margin: 0; letter-spacing: 0; }}
    h2 {{ font-size: 22px; margin: 32px 0 12px; letter-spacing: 0; }}
    h3 {{ font-size: 16px; margin: 0; letter-spacing: 0; }}
    p {{ margin: 0; max-width: 860px; }}
    .muted {{ color: var(--muted); }}
    .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }}
    .stat, .pill {{
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--text);
      font-size: 14px;
    }}
    pre, code {{ font-family: "Cascadia Mono", Consolas, "SFMono-Regular", monospace; }}
    pre {{
      overflow-x: auto;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      font-size: 13px;
    }}
    code {{ font-size: 13px; }}
    table {{
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      overflow: hidden;
    }}
    th, td {{ padding: 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }}
    th {{ font-size: 13px; color: var(--muted); font-weight: 650; }}
    td small {{ display: block; color: var(--muted); margin-top: 3px; }}
    tr:last-child td {{ border-bottom: 0; }}
    .status {{
      display: inline-flex;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }}
    .status.live {{ background: var(--live-bg); color: var(--live-text); }}
    .status.api-live {{ background: var(--api-bg); color: var(--api-text); }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }}
    .model {{
      min-height: 218px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: var(--panel);
      display: grid;
      gap: 10px;
    }}
    .model-top {{ display: flex; justify-content: space-between; gap: 10px; align-items: start; }}
    dl {{ display: grid; gap: 8px; margin: 0; }}
    dt {{ color: var(--muted); font-size: 12px; }}
    dd {{ margin: 0; font-size: 14px; }}
    a {{ color: var(--accent); }}
    @media (max-width: 760px) {{
      table, thead, tbody, th, td, tr {{ display: block; }}
      thead {{ display: none; }}
      tr {{ border-bottom: 1px solid var(--line); }}
      td {{ border: 0; padding: 9px 12px; }}
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #101411;
        --panel: #171d19;
        --text: #edf2ee;
        --muted: #9eaaa2;
        --line: #303a33;
        --accent: #86d69f;
        --live-bg: #143922;
        --live-text: #8ee7a9;
        --api-bg: #183556;
        --api-text: #9ed0ff;
      }}
    }}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Dubber AI Model API Hub</h1>
    <p class="muted">One place for the model APIs used by the video dubber. VoxCPM2 is model-ready now; the other routes are deployed as live API contracts and can be wired to model workers one by one.</p>
    <div class="stats">
      <span class="stat">{live_count} live service</span>
      <span class="stat">{api_live_count} API-live routes</span>
      <span class="stat">Auth: Bearer token</span>
      <span class="stat">Base: {PUBLIC_BASE_URL}</span>
    </div>
  </header>

  <h2>Live TTS Endpoint</h2>
  <pre><code>POST {PUBLIC_BASE_URL}/v1/audio/speech
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json

{{
  "model": "voxcpm2",
  "input": "Khmer text here",
  "voice": "young Khmer male voice, warm and clear tone",
  "response_format": "wav"
}}</code></pre>

  <h2>Model Services</h2>
  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Model</th>
        <th>Service</th>
        <th>Endpoint</th>
        <th>GPU</th>
        <th>Purpose</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>

  <h2>Cards</h2>
  <div class="grid">{cards}</div>

  <h2>Machine APIs</h2>
  <pre><code>GET {PUBLIC_BASE_URL}/health
GET {PUBLIC_BASE_URL}/info
GET {PUBLIC_BASE_URL}/v1/models
GET {PUBLIC_BASE_URL}/docs</code></pre>
</main>
</body>
</html>
"""


@app.cls(
    gpu=GPU_TYPE,
    volumes={"/models": model_volume},
    timeout=60 * 30,
    scaledown_window=SCALEDOWN_WINDOW,
    secrets=API_SECRETS,
)
class VoxCPM2TTS:
    @modal.enter()
    def load(self) -> None:
        from huggingface_hub import snapshot_download
        from nanovllm_voxcpm import VoxCPM

        if not os.path.exists(os.path.join(MODEL_DIR, "config.json")):
            snapshot_download(MODEL_ID, local_dir=MODEL_DIR)
            model_volume.commit()

        self.server = VoxCPM.from_pretrained(
            model=MODEL_DIR,
            devices=[0],
            inference_timesteps=INFERENCE_TIMESTEPS,
            max_num_batched_tokens=MAX_NUM_BATCHED_TOKENS,
            max_num_seqs=MAX_NUM_SEQS,
            max_model_len=MAX_MODEL_LEN,
            gpu_memory_utilization=GPU_MEMORY_UTILIZATION,
        )
        self.info = self.server.get_model_info()
        # ZipEnhancer pipeline is loaded lazily on the first denoise=True request
        # (see _get_denoiser) so clean-reference clones never pay for it.
        self._denoiser = None

    def _get_denoiser(self):
        """Lazily build the ModelScope ZipEnhancer acoustic-noise-suppression
        pipeline. Returns None if denoising is disabled or unavailable so the
        caller can gracefully fall back to the raw reference audio."""
        if not ZIPENHANCER_MODEL_ID:
            return None
        if self._denoiser is not None:
            return self._denoiser
        try:
            from modelscope.pipelines import pipeline
            from modelscope.utils.constant import Tasks

            self._denoiser = pipeline(
                Tasks.acoustic_noise_suppression,
                model=ZIPENHANCER_MODEL_ID,
            )
        except Exception as exc:  # noqa: BLE001 - never fail a clone over denoise
            print(f"[denoise] failed to load ZipEnhancer ({exc}); skipping denoise")
            self._denoiser = None
        return self._denoiser

    def _denoise_wav_bytes(self, wav_bytes: bytes) -> bytes:
        """Run ZipEnhancer on raw WAV bytes and return denoised WAV bytes. On any
        failure the original bytes are returned unchanged (denoise is best-effort,
        it must never break a clone)."""
        denoiser = self._get_denoiser()
        if denoiser is None:
            return wav_bytes
        import tempfile

        in_path = out_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as in_f:
                in_f.write(wav_bytes)
                in_path = in_f.name
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as out_f:
                out_path = out_f.name
            denoiser(in_path, output_path=out_path)
            with open(out_path, "rb") as fh:
                return fh.read()
        except Exception as exc:  # noqa: BLE001
            print(f"[denoise] enhance failed ({exc}); using original reference")
            return wav_bytes
        finally:
            for p in (in_path, out_path):
                if p and os.path.exists(p):
                    try:
                        os.unlink(p)
                    except OSError:
                        pass

    @modal.exit()
    def shutdown(self) -> None:
        server = getattr(self, "server", None)
        if server is not None:
            server.stop()

    @modal.method()
    def health(self) -> dict:
        return {"status": "ok", "model_loaded": True}

    @modal.method()
    def model_info(self) -> dict:
        return dict(self.info)

    @modal.method()
    def synthesize(
        self,
        text: str,
        *,
        response_format: Literal["wav"] = "wav",
        prompt_wav_base64: str | None = None,
        prompt_wav_format: str = "wav",
        prompt_text: str = "",
        ref_audio_wav_base64: str | None = None,
        ref_audio_wav_format: str = "wav",
        max_generate_length: int = 2000,
        temperature: float = 1.0,
        cfg_value: float = 2.0,
        voice_description: str | None = None,
        denoise: bool = False,
    ) -> bytes:
        import numpy as np
        import soundfile as sf

        if response_format != "wav":
            raise ValueError("Only wav response_format is supported in this Modal wrapper.")

        target_text = text.strip()
        if not target_text:
            raise ValueError("text is required")
        if voice_description:
            target_text = f"({voice_description.strip()}){target_text}"

        prompt_latents = None
        if prompt_wav_base64:
            if not prompt_text.strip():
                raise ValueError("prompt_text is required when prompt_wav_base64 is provided")
            prompt_wav_bytes = base64.b64decode(prompt_wav_base64)
            if denoise:
                prompt_wav_bytes = self._denoise_wav_bytes(prompt_wav_bytes)
            prompt_latents = self.server.encode_latents(
                prompt_wav_bytes,
                prompt_wav_format,
            )

        ref_audio_latents = None
        if ref_audio_wav_base64:
            ref_wav_bytes = base64.b64decode(ref_audio_wav_base64)
            if denoise:
                ref_wav_bytes = self._denoise_wav_bytes(ref_wav_bytes)
            ref_audio_latents = self.server.encode_latents(
                ref_wav_bytes,
                ref_audio_wav_format,
            )

        chunks = []
        for chunk in self.server.generate(
            target_text=target_text,
            prompt_latents=prompt_latents,
            prompt_text=prompt_text,
            max_generate_length=max_generate_length,
            temperature=temperature,
            cfg_value=cfg_value,
            ref_audio_latents=ref_audio_latents,
        ):
            chunks.append(chunk)

        if not chunks:
            raise RuntimeError("Model returned no audio")

        wav = np.concatenate(chunks, axis=0)
        out = io.BytesIO()
        sf.write(out, wav, int(self.info["sample_rate"]), format="WAV")
        return out.getvalue()


@app.function(
    image=modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]"),
    secrets=API_SECRETS,
)
@modal.asgi_app()
def api():
    from fastapi import Body, FastAPI, Header, HTTPException
    from fastapi.responses import HTMLResponse, Response
    from pydantic import BaseModel, Field

    web = FastAPI(title="VoxCPM2 Nano-vLLM TTS API", version="1.0.0")
    model = VoxCPM2TTS()

    class SpeechRequest(BaseModel):
        model: str = Field(default=MODEL_ID)
        input: str
        voice: str | None = Field(
            default=None,
            description="Natural-language voice description. Example: young Khmer male, warm tone",
        )
        response_format: Literal["wav"] = "wav"
        speed: float = Field(default=1.0, ge=0.5, le=2.0)
        prompt_wav_base64: str | None = None
        prompt_wav_format: str = "wav"
        prompt_text: str = ""
        ref_audio_wav_base64: str | None = None
        ref_audio_wav_format: str = "wav"
        clone_audio_base64: str | None = None
        clone_audio_mime_type: str | None = None
        reference_audio_base64: str | None = None
        reference_audio_mime_type: str | None = None
        reference_audio_filename: str | None = None
        max_generate_length: int = Field(default=2000, ge=100, le=8192)
        temperature: float = Field(default=1.0, ge=0.1, le=2.0)
        # CFG hard-capped at 2.0: higher guidance scale (e.g. 3) makes VoxCPM2
        # over-adhere and produce broken/distorted audio. Reject above 2 at the
        # API boundary as defense-in-depth (the app layer also clamps to 2.0).
        cfg_value: float = Field(default=2.0, ge=0.1, le=2.0)
        # Opt-in ZipEnhancer denoise of the reference/prompt audio before cloning.
        # Default off: only helps noisy reference uploads and can slightly alter a
        # clean voice, so the app/UI gates it behind an explicit toggle.
        denoise: bool = False

    @web.get("/", response_class=HTMLResponse)
    async def docs_page():
        return _render_docs_html()

    @web.get("/v1/models")
    async def models():
        return {
            "base_url": PUBLIC_BASE_URL,
            "live_services": [item for item in MODEL_CATALOG if item["status"] == "live"],
            "api_live_services": [item for item in MODEL_CATALOG if item["status"] == "api-live"],
        }

    @web.get("/v1/models/{model_id}")
    async def model_detail(model_id: str):
        item = _model_by_id(model_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Unknown model")
        return {"base_url": PUBLIC_BASE_URL, "service": item, "detail": MODEL_DETAILS[item["id"]]}

    @web.get("/models/{model_id}", response_class=HTMLResponse)
    async def model_detail_page(model_id: str):
        html = _render_model_detail_html(model_id)
        if not html:
            raise HTTPException(status_code=404, detail="Unknown model")
        return html

    @web.get("/health")
    async def health(authorization: str | None = Header(default=None)):
        _check_bearer(authorization)
        return await model.health.remote.aio()

    @web.get("/info")
    async def info(authorization: str | None = Header(default=None)):
        _check_bearer(authorization)
        return await model.model_info.remote.aio()

    @web.post("/v1/audio/speech")
    async def speech(payload: SpeechRequest, authorization: str | None = Header(default=None)):
        _check_bearer(authorization)
        if payload.model not in {MODEL_ID, "openbmb/VoxCPM2", "voxcpm2"}:
            raise HTTPException(status_code=400, detail=f"Unsupported model: {payload.model}")

        voice_description = payload.voice
        if payload.speed != 1.0:
            speed_text = "faster" if payload.speed > 1.0 else "slower"
            speed_control = f"speaking {speed_text}, speed {payload.speed:.2f}x"
            voice_description = (
                f"{voice_description}, {speed_control}" if voice_description else speed_control
            )

        reference_audio_base64 = (
            payload.ref_audio_wav_base64
            or payload.clone_audio_base64
            or payload.reference_audio_base64
        )
        reference_audio_format = payload.ref_audio_wav_format
        if not payload.ref_audio_wav_base64:
            reference_audio_format = _audio_format_from_mime_or_name(
                payload.clone_audio_mime_type
                or payload.reference_audio_mime_type
                or payload.reference_audio_filename,
                payload.ref_audio_wav_format,
            )

        wav_bytes = await model.synthesize.remote.aio(
            payload.input,
            response_format=payload.response_format,
            prompt_wav_base64=payload.prompt_wav_base64,
            prompt_wav_format=payload.prompt_wav_format,
            prompt_text=payload.prompt_text,
            ref_audio_wav_base64=reference_audio_base64,
            ref_audio_wav_format=reference_audio_format,
            max_generate_length=payload.max_generate_length,
            temperature=payload.temperature,
            cfg_value=payload.cfg_value,
            voice_description=voice_description,
            denoise=payload.denoise,
        )
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"X-Model": MODEL_ID},
        )

    @web.post("/v1/audio/transcriptions")
    async def transcriptions(
        payload: dict | None = Body(default=None),
        authorization: str | None = Header(default=None),
    ):
        _check_bearer(authorization)
        return _service_contract_response("funasr-asr", payload)

    @web.post("/v1/audio/vad")
    async def vad(
        payload: dict | None = Body(default=None),
        authorization: str | None = Header(default=None),
    ):
        _check_bearer(authorization)
        return _service_contract_response("funasr-vad", payload)

    @web.post("/v1/audio/convert")
    async def convert_voice(
        payload: dict | None = Body(default=None),
        authorization: str | None = Header(default=None),
    ):
        _check_bearer(authorization)
        return _service_contract_response("rvc", payload)

    @web.post("/v1/audio/separate")
    async def separate_audio(
        payload: dict | None = Body(default=None),
        authorization: str | None = Header(default=None),
    ):
        _check_bearer(authorization)
        return _service_contract_response("demucs-uvr", payload)

    @web.post("/v1/audio/diarize")
    async def diarize(
        payload: dict | None = Body(default=None),
        authorization: str | None = Header(default=None),
    ):
        _check_bearer(authorization)
        return _service_contract_response("diarization", payload)

    @web.post("/v1/audio/gender")
    async def detect_gender(
        payload: dict | None = Body(default=None),
        authorization: str | None = Header(default=None),
    ):
        _check_bearer(authorization)
        return _service_contract_response("gender", payload)

    @web.post("/v1/audio/align")
    async def align_audio(
        payload: dict | None = Body(default=None),
        authorization: str | None = Header(default=None),
    ):
        _check_bearer(authorization)
        return _service_contract_response("alignment", payload)

    @web.post("/v1/dubber/validate")
    async def validate_dubber(
        payload: dict | None = Body(default=None),
        authorization: str | None = Header(default=None),
    ):
        _check_bearer(authorization)
        return _service_contract_response("validator", payload)

    return web


@app.local_entrypoint()
def test(
    text: str = "សួស្តី នេះគឺជាការសាកល្បងសំឡេងខ្មែរពី VoxCPM2។",
    voice: str = "young Khmer male voice, warm and clear tone",
    out: str = "khmer_voxcpm2_modal_test.wav",
):
    """Run one cloud GPU synthesis job and save the WAV locally."""
    wav_bytes = VoxCPM2TTS().synthesize.remote(
        text,
        voice_description=voice,
        response_format="wav",
    )
    out_path = Path(out).resolve()
    out_path.write_bytes(wav_bytes)
    print(f"saved {out_path} ({out_path.stat().st_size:,} bytes)")
