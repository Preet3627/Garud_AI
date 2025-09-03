# Garud AI Robot: Web Control Panel & Guide

This repository contains the source code for a web-based **control panel and setup guide** to transform the [Yahboom RASPBOT V2](https://www.yahboom.net/study/RASPBOT-V2) into an intelligent, interactive AI assistant named "Garud". This project is fully compatible with the **RASPBOT V2 Superior kit**.

This project has evolved into a client-server architecture. The web application in this repository is the **frontend (the client)**, which you run in your browser. It communicates with a **Python web server (the backend)** that you will build and run on the robot itself.

This project was developed for **PM SHRI PRATHMIK VIDHYAMANDIR PONSRI**.

## Architecture Overview

1.  **Robot Backend (Python + Flask):** A web server runs on the Raspberry Pi, listening for commands via a local network API. It controls the robot's hardware, runs computer vision models, and communicates with the Google Gemini API.
2.  **Web Frontend (React - This App):** A user-friendly dashboard that runs in your browser. You use it to send commands to the robot, configure its responses, and see a live log of its activities.



## Features

-   🌐 **Web-Based Control**: Operate your robot from any device with a web browser on the same network.
-   📹 **Live Camera Streaming**: View a real-time video feed from the robot's camera directly in the control panel.
-   🔊 **Dual Response System**: The robot provides feedback by **speaking out loud** and simultaneously sending a log message to the **web UI**.
-   🤖 **Advanced Autopilot System**:
    -   🧭 **Explore Mode**: An autonomous mode where the robot will randomly wander around its environment.
    -   🚦 **Traffic Mode**: Activate a mode where the robot recognizes and responds to traffic lights and stop signs.
    -   🚗 **Follow Car Mode**: Command the robot to detect and follow a specific object, like a toy car.
    -   🛡️ **Obstacle Avoidance**: A basic self-driving mode that uses the ultrasonic sensor to navigate and avoid obstacles.
-   🧠 **AI-Powered Vision & Actions**:
    -   🎤 **Customizable Voice Wake Word**: Set a custom wake-up phrase (e.g., "Hey Garud") from the web UI. The robot will listen for this phrase using its microphone to activate.
    -   ✍️ **Editable Custom Responses**: Teach Garud custom replies to your own questions directly from the web UI.
    -   ✨ **Wake Word Effect**: A Google Assistant-style RGB light animation can be triggered to show the robot is 'listening'.
    -   **Object Detection**: The robot can identify multiple objects, people, and animals in its environment.
    -   **Find a Book**: Give the robot a task to search for and locate a book.
    -   **AI Vision**: Command Garud to capture images and describe what it sees out loud using the Gemini API.
    -   **Scan-a-Question**: Point the robot's camera at a written question, and it will use Gemini's multimodal capabilities to read, understand, and answer it.
-   💬 **Interactive & Multilingual Personality**:
    -   **Proactive Greetings**: The robot autonomously detects human or dog faces and greets them with "Namaste" in Gujarati, but only the first time it sees them.
    -   **Gujarati Introduction**: Delivers a pre-defined introduction in **Gujarati**.
-   🕹️ **Omnidirectional Movement Control**: Directly control the robot's mecanum wheels to move and rotate in any direction.
-   📡 **IR Remote Control Ready**: Includes the backend code to allow control of the robot using a standard IR remote.
-   📏 **Ultrasonic Obstacle Detection**: Trigger the ultrasonic sensor to measure distances and detect obstacles.
-   🔴 **Live Action Log**: See real-time status updates and responses from the robot in the control panel.
-   📚 **Guided Setup**: The application itself contains an updated, step-by-step guide to help you build the Python server backend on your robot.
-   📦 **Downloadable Code Bundle**: Get the entire backend server project as a downloadable ZIP file directly from the UI.

## How to Use

1.  **Frontend**: Open the `index.html` file in your browser. This is your control panel.
2.  **Backend**: Follow the "Setup Guide" steps displayed in the web application. You can download the complete code bundle using the download button in the header.
3.  **Connect**: Once the Python server is running on the robot, enter the robot's IP address into the control panel and click "Connect". You can now control your Garud AI Robot!

### Install Yahboom Drivers (Crucial Step)
The `yahboom-robot-hat` library requires drivers to communicate with the hardware. Run the following commands on your Raspberry Pi to install them before running the main server.

```bash
# Clone the official Yahboom repository
git clone https://github.com/yahboomtechnology/Raspbot.git
# Run the installation script
sudo ./Raspbot/Raspbot/install.sh
```
This will install the necessary dependencies and configure the hardware interface. A reboot is recommended after installation.

### Backend Dependencies
Before running the backend server, you may need to install a system-level library for microphone access on your Raspberry Pi:
```bash
sudo apt-get update && sudo apt-get install -y portaudio19-dev
```

### Running on Startup (Recommended)

To make your robot truly autonomous, you should configure the Python server to start automatically whenever the Raspberry Pi boots up. The best way to do this is with a `systemd` service.

1.  **Create a Service File**: Open a new service file using a terminal text editor on your Pi:
    ```bash
    sudo nano /etc/systemd/system/garud-robot.service
    ```

2.  **Add the Service Configuration**: Paste the following content into the file. **Important:** Make sure the `WorkingDirectory` and `ExecStart` paths match the location of your project and its virtual environment on the Pi (the example below assumes it's in `/home/pi/garud_ai_robot`).

    ```ini
    [Unit]
    Description=Garud AI Robot Server
    After=network.target

    [Service]
    User=pi
    Group=pi
    WorkingDirectory=/home/pi/garud_ai_robot
    ExecStart=/home/pi/garud_ai_robot/.venv/bin/gunicorn --workers 3 --bind 0.0.0.0:5001 main:app
    Restart=always

    [Install]
    WantedBy=multi-user.target
    ```
    Save the file and exit the editor (in `nano`, press `Ctrl+X`, then `Y`, then `Enter`).

3.  **Enable and Start the Service**: Now, tell `systemd` to recognize and start your new service:
    ```bash
    # Reload the systemd daemon to recognize the new file
    sudo systemctl daemon-reload

    # Enable the service to start on boot
    sudo systemctl enable garud-robot.service

    # Start the service immediately
    sudo systemctl start garud-robot.service
    ```

4.  **Check the Status**: You can verify that the service is running correctly with:
    ```bash
    sudo systemctl status garud-robot.service
    ```
    If it's working, you should see an "active (running)" status. Now, your robot's server will start automatically every time you turn it on!

## Technology Stack

-   **Frontend (This Guide):** React, TypeScript, Tailwind CSS
-   **Backend (On Robot):** Python, Flask, OpenCV, google-generativeai
-   **Communication:** REST API over local network