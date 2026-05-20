# 🤖 Garud AI Robot (v0.1.2)

[![Version](https://img.shields.io/badge/version-0.1.2-cyan.svg)](https://github.com/Preet3627/Garud_AI/releases)
[![Build Status](https://github.com/Preet3627/Garud_AI/actions/workflows/release.yml/badge.svg)](https://github.com/Preet3627/Garud_AI/actions)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue.svg)](https://github.com/Preet3627/Garud_AI)
[![Framework](https://img.shields.io/badge/framework-Electron%20%2B%20React%20%2B%20Python-orange.svg)](https://github.com/Preet3627/Garud_AI)
[![AI SDK](https://img.shields.io/badge/AI%20SDK-Ollama%20%2B%20OpenAI%20%2B%20Gemini%20%2B%20Claude-purple.svg)](https://github.com/Preet3627/Garud_AI)

Garud AI is a state-of-the-art, multi-modal robot control system designed for the **Raspbot V2**. It combines a sleek Electron desktop interface with a high-performance Python backend to create a truly seamless human-robot interaction experience.

---

## 🌟 Project Vision

The goal of Garud AI is to bridge the gap between complex robotics and intuitive AI. By integrating advanced voice processing, local LLMs, and real-time computer vision, Garud is not just a robot—it's an intelligent companion.

## 🚀 Key Features

### 🖥️ Native Desktop Experience
Built with **Electron**, the Garud AI dashboard provides a smooth, low-latency control center for your robot across macOS (Intel/Silicon), Windows, and Linux.

### 🎙️ Voice AI Assistant (NEW in v0.1.2)
- **Hands-Free Mode**: Always-listening with custom wake word support (e.g., "Hey Jarvis", "Hello Garud")
- **Push-to-Talk**: Quick voice queries without wake word
- **Automatic Speech Recognition** via browser's native Web Speech API
- **Text-to-Speech** responses for natural voice interaction
- **Stunning AI Orb Animation**: Rotating rings, scanning beam, particle bursts, orbit dots
- **Voice Waveform Equalizer**: Animated bars that pulse with speech activity
- **Floating Voice Panel**: Real-time listening status overlay

### 🧠 Multi-Provider AI Brain
- **5 AI Providers**: Ollama, OpenAI, Gemini, Claude, Custom API
- **Live Ollama model fetching** from local `/api/tags` endpoint
- **Real API calls** with proper authentication for all providers
- **AI Chat Interface** with typing animations and glowing text reveals
- **Temperature control** for response creativity

### 🧪 Testing Mode (NEW in v0.1.2)
Use ALL AI features without a physical robot. Perfect for development and experimentation.

### 📷 Device Camera (Vision Lab)
- **Real WebRTC camera** with live FPS counter
- **Multiple camera support** — select from dropdown
- **Real FPS measurement** (not hardcoded)

### 👁️ Real-time Computer Vision (Robot)
- **Object Detection**: Powered by YOLOv3-tiny for identifying people, cars, books, and more
- **Proactive Greeting**: Recognizes faces and greets in Gujarati
- **Autopilot Modes**: Obstacle Avoidance, Traffic Recognition, Car Following, Explore

### ⚡ Robot Connectivity
- **Auto-Discovery**: Uses mDNS (Bonjour) to find your robot on the network
- **Real connection health checks** with periodic keepalive pings
- **Subnet scanning** for robots without Bonjour
- **SSH Remote Deployment**: Start, stop, and monitor the robot's server
- **Real** (not simulated) connection status

---

## 🛠️ Installation & Setup

### Dashboard (Desktop App)

1. **Clone & Install**:
   ```bash
   git clone https://github.com/Preet3627/Garud_AI.git
   cd Garud_AI
   npm install
   ```
2. **Launch**:
   ```bash
   npm run electron:dev
   ```
3. **Build Installer**:
   ```bash
   npm run electron:build
   ```

### Robot (Raspberry Pi)

Everything you need to set up your Pi is included in the **Setup Guide** directly within the app. It will guide you through:
- Installing Yahboom drivers.
- Setting up the Python 3.10+ environment.
- Running the `main.py` Flask server.

---

## ⚠️ macOS Troubleshooting

If you encounter the "Damaged App" error due to the unsigned developer build:
1. Move the app to `/Applications`.
2. Run this in Terminal:
   ```bash
   sudo xattr -rd com.apple.quarantine "/Applications/Garud AI Robot.app"
   ```

---

## 📂 Repository Structure

- `core/`: Python source for robot hardware control and vision.
- `utils/`: Utility functions for TTS and networking.
- `components/`: React UI components for the dashboard.
- `release-notes/`: Detailed history of every version update.
- `electron-main.cjs`: The "brain" of the desktop application.
- `voice_agent.py`: The Pipecat-powered voice interaction layer.

## 📦 Release History

- [v0.1.2 - Voice AI & Testing Mode](./release-notes/v0.1.2.md)
- [v0.1.1 - Auto-Pilot Update](./release-notes/v0.1.1.md)
- [v0.1.0 - Initial Desktop Release](./release-notes/v0.1.0.md)

---

## 📄 License & Credits

**License**: MIT
**Hardware**: Yahboom Raspbot V2 (Raspberry Pi 4B recommended)
**Developed by**: The Garud AI Team

---

*Built with speed, precision, and Dhurandhar energy.* 🏁