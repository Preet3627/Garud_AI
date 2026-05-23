# Garud AI Robot Control Panel

[![Version](https://img.shields.io/badge/version-0.1.5-cyan.svg)](https://github.com/Preet3627/Garud_AI/releases/tag/v0.1.5)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

An advanced, visually stunning Electron-based control panel and **Robotics Operating System Simulator** for the Garud AI Robot. This application serves as the "brain" for the Garud AI hardware, providing a bridge between advanced AI models and physical robot control.

![Garud AI Visuals](assets/icon.png)

## 🆕 Latest Update: v0.1.5
This version introduces a complete **3D Robotics Simulation & Vision AI** suite.
- **3D World (PyBullet)**: Real-time 3D physics simulation with obstacles and URDF robot models.
- **Vision Brain**: Obstacle avoidance powered by local Vision Models (Llava) via Ollama.
- **Live Telemetry**: High-fidelity dashboard for Motor RPM, Battery (12.4V), and CPU metrics.
- **Hardware Guide**: Interactive deployment diagrams for Docker and SSH setup on Raspberry Pi.
- **Read the full [v0.1.5 Release Notes](release-notes/v0.1.5.md)**.

## 🚀 Key Features

### 🤖 Robotics OS & Simulation
- **Physics World**: Built-in PyBullet environment for testing autonomous logic without hardware.
- **Dynamic Obstacles**: Real-time collision detection and AI-based navigation paths.
- **Virtual GPIO**: Emulated Raspberry Pi GPIO layer for seamless code migration to real robots.
- **Telemetry HUD**: futuristic 3D stream overlay with live system vitals.

### 🧠 Intelligence & Vision
- **Multi-Provider AI**: Support for Ollama (local), OpenAI, Gemini, and Claude.
- **Vision Models**: Dynamic selection of LLava/Vision models (1B to 13B+) with live Ollama fetching.
- **Autonomous Function Calling**: A recursive tool-loop allowing the AI to chain multiple system actions.

### 🎙️ Garud Voice Mode (Powered by FastAPI)
- **Hands-Free Wake Word**: Activate the assistant by saying "Hey Garud" (customizable).
- **Advanced Voice-to-Text**: High-accuracy browser-based STT.
- **Natural Persona**: Optimized conversational mode for a more "alive" assistant experience.
- **Stunning UI/UX**: Reactive AI Orb and voice waveforms that respond to your voice and the AI's speech.

### 🐳 Docker Deployment (AI Bridge)
You can now run the Garud AI bridge inside a Docker container for maximum stability:
```bash
# Build the image
docker build -t garud-ai-bridge .

# Run the container
docker run -d -p 5002:5002 --name garud-brain garud-ai-bridge
```

### 🛡️ Security & Stability
- **Command Risk Tiers**: Hardcoded classification (LOW, MEDIUM, HIGH) for all shell commands.
- **Biometric Authentication**: 
  - **macOS**: Touch ID verification required for high-risk commands.
  - **Windows**: Windows Hello / Admin Elevation prompts for system-level changes.
- **Permission Management**: Automated macOS accessibility and camera permission handling to prevent "black screen" issues.

### 🤖 Robot Integration
- **Auto-Discovery**: Automatic detection of Garud AI robots on the local network using Bonjour/mDNS.
- **Remote Execution**: Direct SSH-based deployment and management of robot server logic.
- **Testing Mode**: Full AI and Voice functionality available even without a physical robot connected.

## 🛠️ Technical Stack
- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion (for animations).
- **Desktop**: Electron 34, Preload-bridge for secure IPC communication.
- **AI Integration**: Custom FastAPI implementation supporting OpenAI-compatible APIs and Ollama.
- **Icons**: Lucide React.

## 🚥 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Ollama (optional, for local AI)
- Docker (optional, for containerized deployment)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Preet3627/Garud_AI.git
   cd Garud_AI
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run electron:dev
   ```
---
   ### ⚠️ macOS "Damaged App" Fix
Since this is an unsigned developer build, macOS may flag it. If you get a "damaged" error, run this in Terminal:
---
`sudo xattr -rd com.apple.quarantine /Applications/Garud\ AI\ Robot.app`


## 📜 Licensing
**Copyright (c) 2026 Garud AI Team. All Rights Reserved.**

This project is proprietary and confidential. Unauthorized copying, distribution, or use of this software is strictly prohibited. See the `LICENSE` file for details.

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

---
**Garud AI Team** - *Bringing Intelligence to Motion.*
