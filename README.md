# Garud AI Robot 🤖 (v0.1.0)

A comprehensive control panel and intelligence suite for the Garud AI Robot (Raspbot V2). Now as a powerful cross-platform desktop application.

## 🚀 Key Features

- **Desktop Experience**: Built with Electron for a native performance on macOS, Windows, and Linux.
- **Pipecat Voice Integration**: Full-duplex voice interaction with VAD, ASR, LLM, and TTS.
- **Local AI (Ollama)**: Directly configure and interact with local LLMs (like Llama3) via the UI.
- **Vercel AI SDK**: Seamless streaming and chat capabilities integrated into the robot's intelligence.
- **Advanced Computer Vision**: Live camera feed with object detection (YOLOv3-tiny) and scene description (Gemini).
- **Multi-modal Control**: Manage movement via web API, IR remote, or autonomous autopilot modes.

## 📂 Project Structure

```text
Garud_AI/
├── .github/workflows/   <-- CI/CD for cross-platform releases
├── core/                <-- Robot backend core logic (Python)
├── components/          <-- React UI components
├── electron-main.cjs    <-- Electron entry point
├── voice_agent.py       <-- Pipecat voice interaction agent
└── App.tsx              <-- Main dashboard and control logic
```

## 🛠️ Installation & Setup

### For the Dashboard (Desktop App)

1. **Clone the repo**:
   ```bash
   git clone https://github.com/your-repo/Garud_AI.git
   cd Garud_AI
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Run in Development**:
   ```bash
   npm run electron:dev
   ```
4. **Build Production Binaries**:
   ```bash
   npm run electron:build
   ```

### For the Robot (Raspberry Pi)

Follow the step-by-step guide integrated directly into the dashboard. It covers:
- Driver installation for Raspbot V2.
- Python environment setup.
- YOLO model downloading.
- Pipecat & Voice Agent configuration.

## 🤖 Local AI with Ollama

You can now connect Garud to your local Ollama instance directly from the **AI Settings** panel:
1. Ensure Ollama is running (`ollama serve`).
2. Enter your **Base URL** (default: `http://localhost:11434`).
3. Specify the **Model Name** (e.g., `llama3`).

## 📦 Release v0.1.0 Notes

- Initial release of the Electron desktop application.
- Integrated Pipecat framework for advanced voice capabilities.
- Added Vercel AI SDK for unified AI interaction.
- UI-based configuration for local Ollama models.
- Cross-platform build automation via GitHub Actions.

## 📄 License

MIT - See LICENSE for details.
