# 🤖 Garud AI Robot (v0.1.1)

[![Version](https://img.shields.io/badge/version-0.1.1-cyan.svg)](https://github.com/Preet3627/Garud_AI/releases)
[![Build Status](https://github.com/Preet3627/Garud_AI/actions/workflows/release.yml/badge.svg)](https://github.com/Preet3627/Garud_AI/actions)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue.svg)](https://github.com/Preet3627/Garud_AI)
[![Framework](https://img.shields.io/badge/framework-Electron%20%2B%20React%20%2B%20Python-orange.svg)](https://github.com/Preet3627/Garud_AI)
[![AI SDK](https://img.shields.io/badge/AI%20SDK-Pipecat%20%2B%20Vercel%20%2B%20Ollama-purple.svg)](https://github.com/Preet3627/Garud_AI)

Garud AI is a state-of-the-art, multi-modal robot control system designed for the **Raspbot V2**. It combines a sleek Electron desktop interface with a high-performance Python backend to create a truly seamless human-robot interaction experience.

---

## 🌟 Project Vision

The goal of Garud AI is to bridge the gap between complex robotics and intuitive AI. By integrating advanced voice processing, local LLMs, and real-time computer vision, Garud is not just a robot—it's an intelligent companion.

## 🚀 Key Features

### 🖥️ Native Desktop Experience
Built with **Electron**, the Garud AI dashboard provides a smooth, low-latency control center for your robot across macOS (Intel/Silicon), Windows, and Linux.

### 🎙️ Advanced Voice Intelligence (Pipecat)
- **Full-Duplex Dialogue**: Natural, two-way conversations without needing to wait for the robot to finish speaking.
- **Voice Activity Detection (VAD)**: Smart listening that distinguishes between background noise and intentional commands.
- **Interruption Support**: Stop the robot mid-sentence just by speaking to it.

### 🧠 Local & Cloud AI Fusion
- **Ollama Integration**: Run powerful models like Llama3 or Mistral locally on your machine and pipe their intelligence directly to the robot.
- **Vercel AI SDK**: Provides a unified interface for both local and cloud-based AI providers.
- **Gemini Vision**: High-level scene description and complex reasoning powered by Google's Gemini models.

### 👁️ Real-time Computer Vision
- **Object Detection**: Powered by YOLOv3-tiny for identifying people, cars, books, and more in real-time.
- **Proactive Greeting**: The robot can recognize you and say "Namaste" automatically!
- **Autopilot Modes**: Includes Obstacle Avoidance, Traffic Recognition, and Car Following.

### ⚡ Seamless Automation (v0.1.1)
- **Auto-Discovery**: Uses mDNS (Bonjour) to find your robot on the network instantly—no IP configuration required.
- **Remote Deployment**: Push updates to your robot's Python code with a single click.
- **SSH Control**: Start, stop, and monitor the robot's Python server directly from the desktop app.

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

- [v0.1.1 - Auto-Pilot Update](./release-notes/v0.1.1.md)
- [v0.1.0 - Initial Desktop Release](./release-notes/v0.1.0.md)

---

## 📄 License & Credits

**License**: MIT
**Hardware**: Yahboom Raspbot V2 (Raspberry Pi 4B recommended)
**Developed by**: The Garud AI Team

---
*Built with speed, precision, and Dhurandhar energy.* 🏁
