#!/usr/bin/env python3

import asyncio
import base64
import importlib
import io
import os
import sys
import wave
import traceback
import argparse
import json
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# --- CLI args (parsed before anything else) ---
_parser = argparse.ArgumentParser(description="Garud AI Pipecat Bridge")
_parser.add_argument("command", nargs="?", default="serve", help="Command to run")
_parser.add_argument("--repo-path", default=None, help="Path to pipecat repository")
_parser.add_argument("--port", type=int, default=None, help="Port to listen on (0=auto)")
_args = _parser.parse_args()

repo_path = _args.repo_path if _args.repo_path is not None else os.getenv("PIPECAT_REPO_PATH", "../pipecat")
port = _args.port if _args.port is not None else int(os.getenv("PORT", 5002))

DEFAULT_PIPER_VOICE = "en_US-ryan-high"
DEFAULT_WHISPER_MODEL = "Systran/faster-distil-whisper-medium.en"

app = FastAPI(title="Garud AI Pipecat Bridge", version="1.0.0")

def add_pipecat_repo():
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

class AutonomyRequest(BaseModel):
    enable: bool

class RobotCommandRequest(BaseModel):
    command: str

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

@app.post("/robot/command")
async def robot_command(req: RobotCommandRequest):
    try:
        from backend import robot_controller
        result = robot_controller.handle_command(req.command)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/robot/telemetry")
async def robot_telemetry():
    try:
        from backend import robot_controller
        telemetry = robot_controller.get_robot_telemetry()
        return {"success": True, "telemetry": telemetry}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Models ---

class VisionModelRequest(BaseModel):
    model: str

@app.get("/robot/vision/models")
async def list_vision_models():
    try:
        import ollama
        resp = ollama.list()
        if isinstance(resp, dict):
            models = resp.get('models', [])
        else:
            models = getattr(resp, 'models', [])
        return {"success": True, "models": models}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/robot/vision/model")
async def set_vision_model(req: VisionModelRequest):
    try:
        from robot_core.vision import vision
        vision.model = req.model
        return {"success": True, "current_model": vision.model}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/robot/vision/current-model")
async def get_current_vision_model():
    try:
        from robot_core.vision import vision
        return {"success": True, "model": vision.model}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/robot/vision/install")
async def install_vision_model(req: VisionModelRequest):
    try:
        import ollama
        ollama.pull(req.model)
        return {"success": True, "installed": req.model}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/robot/camera")
async def robot_camera():
    try:
        from backend import robot_controller
        from fastapi.responses import Response
        frame = robot_controller.get_camera_frame()
        if frame:
            return Response(content=frame, media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=404, detail="No camera frame available")

@app.post("/robot/autonomy")
async def robot_autonomy(req: AutonomyRequest):
    try:
        from autonomy import agent_loop
        if req.enable:
            agent_loop.agent.start()
        else:
            agent_loop.agent.stop()
        return {"success": True, "autonomous": req.enable}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    async def run_server():
        config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
        server = uvicorn.Server(config)

        server_task = asyncio.create_task(server.serve())

        import time
        deadline = time.time() + 10
        while time.time() < deadline:
            if getattr(server, "started", False):
                break
            await asyncio.sleep(0.05)

        actual_port = port
        if port == 0:
            try:
                actual_port = server.servers[0].sockets[0].getsockname()[1]
            except (IndexError, AttributeError):
                pass

        print(json.dumps({"event": "ready", "port": actual_port}))
        sys.stdout.flush()

        await server_task

    asyncio.run(run_server())
