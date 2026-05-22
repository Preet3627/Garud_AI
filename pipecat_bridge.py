#!/usr/bin/env python3

import argparse
import asyncio
import base64
import importlib
import io
import json
import os
import socketserver
import sys
import traceback
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


DEFAULT_PIPER_VOICE = "en_US-ryan-high"
DEFAULT_WHISPER_MODEL = "Systran/faster-distil-whisper-medium.en"


def add_pipecat_repo(repo_path: str):
  resolved = Path(repo_path).expanduser().resolve()
  src_path = resolved / "src"
  if not src_path.exists():
    raise FileNotFoundError(f"Pipecat src directory not found: {src_path}")
  if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))
  return resolved


class PipecatBridge:
  def __init__(self, repo_path: str):
    self.repo_path = add_pipecat_repo(repo_path)
    self._stt_cache: dict[tuple[str, str], Any] = {}
    self._tts_cache: dict[str, Any] = {}

  def health(self):
    modules = {}
    for key, module_name in {
      "whisper": "pipecat.services.whisper.stt",
      "piper": "pipecat.services.piper.tts",
    }.items():
      try:
        importlib.import_module(module_name)
        modules[key] = True
      except Exception as error:  # noqa: BLE001
        modules[key] = str(error)
    return {
      "ok": True,
      "repoPath": str(self.repo_path),
      "python": sys.executable,
      "modules": modules,
    }

  def _get_stt_service(self, model_name: str, language_code: str):
    cache_key = (model_name, language_code)
    if cache_key in self._stt_cache:
      return self._stt_cache[cache_key]

    whisper_module = importlib.import_module("pipecat.services.whisper.stt")
    language_module = importlib.import_module("pipecat.transcriptions.language")

    WhisperSTTService = whisper_module.WhisperSTTService
    Language = language_module.Language
    language = getattr(Language, language_code.upper(), Language.EN)

    service = WhisperSTTService(model=model_name, language=language)
    self._stt_cache[cache_key] = service
    return service

  def _get_tts_service(self, voice_name: str):
    if voice_name in self._tts_cache:
      return self._tts_cache[voice_name]

    piper_module = importlib.import_module("pipecat.services.piper.tts")
    PiperTTSService = piper_module.PiperTTSService
    service = PiperTTSService(
      settings=PiperTTSService.Settings(
        voice=voice_name,
      )
    )
    self._tts_cache[voice_name] = service
    return service

  async def transcribe(self, payload: dict[str, Any]):
    pcm_base64 = str(payload.get("pcmBase64") or "").strip()
    if not pcm_base64:
      raise ValueError("Missing pcmBase64 payload")

    model_name = str(payload.get("model") or DEFAULT_WHISPER_MODEL).strip()
    language_code = str(payload.get("language") or "en").strip()
    audio_bytes = base64.b64decode(pcm_base64)
    service = self._get_stt_service(model_name, language_code)

    transcript_parts = []
    async for frame in service.run_stt(audio_bytes):
      text = getattr(frame, "text", None)
      if text:
        transcript_parts.append(str(text).strip())

    return {
      "success": True,
      "text": " ".join(part for part in transcript_parts if part).strip(),
      "model": model_name,
      "language": language_code,
    }

  async def synthesize(self, payload: dict[str, Any]):
    text = str(payload.get("text") or "").strip()
    if not text:
      return {"success": True, "audioBase64": "", "skipped": True}

    voice_name = str(payload.get("voice") or DEFAULT_PIPER_VOICE).strip()
    service = self._get_tts_service(voice_name)

    sample_rate = 22050
    channels = 1
    audio_chunks = []

    async for frame in service.run_tts(text, "garud-pipecat"):
      if frame.__class__.__name__ != "TTSAudioRawFrame":
        continue
      sample_rate = getattr(frame, "sample_rate", sample_rate)
      channels = getattr(frame, "num_channels", channels)
      audio_chunks.append(frame.audio)

    if not audio_chunks:
      raise RuntimeError("Pipecat did not return any audio frames")

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
      "channels": channels,
      "voice": voice_name,
    }


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]):
  body = json.dumps(payload).encode("utf-8")
  handler.send_response(status)
  handler.send_header("Content-Type", "application/json")
  handler.send_header("Content-Length", str(len(body)))
  handler.end_headers()
  handler.wfile.write(body)


def make_handler(bridge: PipecatBridge):
  class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
      route = urlparse(self.path).path
      if route == "/health":
        json_response(self, 200, bridge.health())
        return
      json_response(self, 404, {"success": False, "error": f"Unknown route: {route}"})

    def do_POST(self):
      route = urlparse(self.path).path
      content_length = int(self.headers.get("Content-Length", "0"))
      raw = self.rfile.read(content_length) if content_length else b"{}"

      try:
        payload = json.loads(raw.decode("utf-8") or "{}")
        if route == "/transcribe":
          result = asyncio.run(bridge.transcribe(payload))
          json_response(self, 200, result)
          return
        if route == "/synthesize":
          result = asyncio.run(bridge.synthesize(payload))
          json_response(self, 200, result)
          return
        json_response(self, 404, {"success": False, "error": f"Unknown route: {route}"})
      except Exception as error:  # noqa: BLE001
        json_response(
          self,
          500,
          {
            "success": False,
            "error": str(error),
            "traceback": traceback.format_exc(),
          },
        )

    def log_message(self, _format, *args):
      return

  return Handler


class ThreadedHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
  daemon_threads = True


def serve(repo_path: str, port: int):
  bridge = PipecatBridge(repo_path)
  server = ThreadedHTTPServer(("127.0.0.1", port), make_handler(bridge))
  actual_port = server.server_address[1]
  print(json.dumps({"event": "ready", "port": actual_port}), flush=True)
  server.serve_forever()


def main():
  parser = argparse.ArgumentParser(description="Garud AI Pipecat bridge")
  parser.add_argument("command", choices=["serve"])
  parser.add_argument("--repo-path", required=True)
  parser.add_argument("--port", type=int, default=0)
  args = parser.parse_args()

  if args.command == "serve":
    serve(args.repo_path, args.port)


if __name__ == "__main__":
  main()
