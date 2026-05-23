#!/usr/bin/env python3

import asyncio
import base64
import importlib
import io
import os
import sys
import wave
import traceback
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Configuration
DEFAULT_PIPER_VOICE = "en_US-ryan-high"
DEFAULT_WHISPER_MODEL = "Systran/faster-distil-whisper-medium.en"

app = FastAPI(title="Garud AI Pipecat Bridge", version="1.0.0")

def add_pipecat_repo():
    repo_path = os.getenv("PIPECAT_REPO_PATH", "../pipecat")
    resolved = Path(repo_path).expanduser().resolve()
    src_path = resolved / "src"
    if not src_path.exists():
        print(f"Warning: Pipecat src directory not found at {src_path}")
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))
    return resolved

REPO_PATH = add_pipecat_repo()

# Simple Cache
services_cache = {
    "stt": {},
    "tts": {}
}

# --- Models ---

class TranscribeRequest(BaseModel):
    pcmBase64: str
    model: Optional[str] = DEFAULT_WHISPER_MODEL
    language: Optional[str] = "en"

class SynthesizeRequest(BaseModel):
    text: str
    voice: Optional[str] = DEFAULT_PIPER_VOICE

# --- Services ---

def get_stt_service(model_name: str, language_code: str):
    cache_key = (model_name, language_code)
    if cache_key in services_cache["stt"]:
        return services_cache["stt"][cache_key]

    whisper_module = importlib.import_module("pipecat.services.whisper.stt")
    language_module = importlib.import_module("pipecat.transcriptions.language")
    
    WhisperSTTService = whisper_module.WhisperSTTService
    Language = language_module.Language
    language = getattr(Language, language_code.upper(), Language.EN)

    service = WhisperSTTService(model=model_name, language=language)
    services_cache["stt"][cache_key] = service
    return service

def get_tts_service(voice_name: str):
    if voice_name in services_cache["tts"]:
        return services_cache["tts"][voice_name]

    piper_module = importlib.import_module("pipecat.services.piper.tts")
    PiperTTSService = piper_module.PiperTTSService
    service = PiperTTSService(
        settings=PiperTTSService.Settings(voice=voice_name)
    )
    services_cache["tts"][voice_name] = service
    return service

# --- Routes ---

@app.get("/health")
async def health():
    modules = {}
    for key, module_name in {"whisper": "pipecat.services.whisper.stt", "piper": "pipecat.services.piper.tts"}.items():
        try:
            importlib.import_module(module_name)
            modules[key] = True
        except Exception as e:
            modules[key] = str(e)
    
    return {
        "status": "healthy",
        "repo_path": str(REPO_PATH),
        "python": sys.executable,
        "modules": modules
    }

@app.post("/transcribe")
async def transcribe(req: TranscribeRequest):
    try:
        audio_bytes = base64.b64decode(req.pcmBase64)
        service = get_stt_service(req.model, req.language)

        transcript_parts = []
        async for frame in service.run_stt(audio_bytes):
            text = getattr(frame, "text", None)
            if text:
                transcript_parts.append(str(text).strip())

        return {
            "success": True,
            "text": " ".join(part for part in transcript_parts if part).strip(),
            "model": req.model
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{str(e)}\n{traceback.format_exc()}")

@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    if not req.text.strip():
        return {"success": True, "audioBase64": "", "skipped": True}

    try:
        service = get_tts_service(req.voice)
        sample_rate, channels, audio_chunks = 22050, 1, []

        async for frame in service.run_tts(req.text, "garud-pipecat"):
            if frame.__class__.__name__ != "TTSAudioRawFrame":
                continue
            sample_rate = getattr(frame, "sample_rate", sample_rate)
            channels = getattr(frame, "num_channels", channels)
            audio_chunks.append(frame.audio)

        if not audio_chunks:
            raise RuntimeError("No audio frames generated")

        output = io.BytesIO()
        with wave.open(output, "wb") as wav_file:
            wav_file.setnchannels(channels)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(b"".join(audio_chunks))

        return {
            "success": True,
            "audioBase64": base64.b64encode(output.getvalue()).decode("ascii"),
            "sampleRate": sample_rate,
            "voice": req.voice
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5002))
    uvicorn.run(app, host="0.0.0.0", port=port)
