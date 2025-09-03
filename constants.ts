import type { Step } from './types';
import {
  FolderIcon,
  HardwareIcon,
  SoftwareIcon,
  VisionIcon,
  RobotIcon,
  CalculatorIcon,
  BeakerIcon,
  VideoCameraIcon,
  RemoteControlIcon,
  BrainIcon,
  AutopilotIcon,
  BiohazardIcon,
  HandWavingIcon,
  ExploreIcon,
  ChatBubbleLeftRightIcon,
  MicIcon,
} from './components/Icons';

export const STEPS: Step[] = [
  {
    id: 1,
    title: 'Project Setup & Code Structure',
    icon: FolderIcon,
    description: `This project uses a client-server model. This web page is the client. The robot runs a Python server. First, set up this directory structure on your robot's Raspberry Pi. You can download all the code for these files using the download icon in the header.`,
    code: `garud_ai_robot/
├── .env
├── main.py
├── requirements.txt
├── models/  <-- You will need to download model files here
│   ├── yolov3-tiny.weights
│   └── yolov3-tiny.cfg
├── core/
│   ├── __init__.py
│   ├── camera.py
│   ├── gemini_ai.py
│   ├── ir_remote.py
│   ├── led_control.py
│   ├── motor_control.py
│   ├── object_detector.py
│   ├── ultrasonic.py
│   └── wake_word.py
└── utils/
    ├── __init__.py
    └── text_to_speech.py
`,
  },
  {
    id: 2,
    title: 'Hardware & Environment Setup',
    icon: HardwareIcon,
    description: `Ensure your RASPBOT V2 is correctly assembled. Then, install the required Yahboom drivers and Python libraries. You will also need a USB microphone connected to the Pi and must download the pre-trained object detection model files.`,
    code: `
# Open a terminal on your Raspberry Pi and run these commands:
# 1. Install Yahboom Robot HAT Drivers (CRUCIAL)
git clone https://github.com/yahboomtechnology/Raspbot.git
sudo ./Raspbot/Raspbot/install.sh
# A reboot may be required after installation.

# 2. Install system dependency for microphone audio
sudo apt-get update && sudo apt-get install -y portaudio19-dev

# 3. Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 4. Install core Python libraries
pip install -r requirements.txt

# 5. Download YOLOv3-tiny model files
wget -P ./models https://pjreddie.com/media/files/yolov3-tiny.weights
wget -P ./models https://raw.githubusercontent.com/pjreddie/darknet/master/cfg/yolov3-tiny.cfg
`,
  },
  {
    id: 3,
    title: 'Building the Web API Server',
    icon: SoftwareIcon,
    description: `The robot's backend is a web server built with Flask. The 'main.py' file creates API endpoints to handle movement, AI actions, and streaming. It also manages background threads for continuous object detection and running autopilot modes.`,
    code: `
# This is a simplified version of main.py
from flask import Flask, Response
import threading
from core import object_detector, motor_control

app = Flask(__name__)

# Global state for robot
STATE = {
    "latest_detections": [],
    "autopilot_mode": "off",
    "custom_responses": {},
    "wake_word": "hey garud"
}

def detection_loop():
    # ... continuously runs object detection ...
    pass
    
def autopilot_loop():
    # ... runs autopilot logic ...
    pass
    
def wake_word_loop():
    # ... listens for wake word ...
    pass

if __name__ == '__main__':
    # Start background threads
    threading.Thread(target=detection_loop, daemon=True).start()
    threading.Thread(target=autopilot_loop, daemon=True).start()
    threading.Thread(target=wake_word_loop, daemon=True).start()
    
    app.run(host='0.0.0.0', port=5001, threaded=True)
`,
  },
  {
    id: 4,
    title: 'Live Camera Streaming',
    icon: VideoCameraIcon,
    description: `The Flask server streams video from the camera using OpenCV. A dedicated function captures frames, encodes them as JPEG, and sends them in a multipart response. For this project, we'll draw the object detection bounding boxes onto the video stream so you can see what the robot sees.`,
    code: `
# This code is in 'core/camera.py' and used by 'main.py'
import cv2

def generate_frames_with_detections(camera, detector):
    while True:
        frame = camera.get_frame()
        if frame is not None:
            # Get latest detections and draw them on the frame
            detections = detector.get_latest_detections()
            detector.draw_boxes(frame, detections)
            
            ret, buffer = cv2.imencode('.jpg', frame)
            if ret:
                yield (b'--frame\\r\\n'
                       b'Content-Type: image/jpeg\\r\\n\\r\\n' + buffer.tobytes() + b'\\r\\n')
`,
  },
    {
    id: 5,
    title: 'IR Remote Control',
    icon: RemoteControlIcon,
    description: `The robot can also be controlled using a standard IR remote. The code maps specific IR key codes to motor functions (e.g., arrow keys for movement). This runs in a background thread so it doesn't block the web server or other functions.`,
    code: `
# This code goes in 'core/ir_remote.py'
from yahboom_robot_hat import YahboomRobot
from core import motor_control
import time

def ir_control_loop():
    robot = YahboomRobot()
    while True:
        key = robot.get_ir_remote_code()
        if key is not None:
            if key == robot.IR_REMOTE_UP: motor_control.move_forward()
            elif key == robot.IR_REMOTE_DOWN: motor_control.move_backward()
            elif key == robot.IR_REMOTE_LEFT: motor_control.rotate_left()
            elif key == robot.IR_REMOTE_RIGHT: motor_control.rotate_right()
            elif key == robot.IR_REMOTE_OK: motor_control.stop()
        time.sleep(0.1)

# Start ir_control_loop() in a background thread from main.py.
`,
  },
  {
    id: 6,
    title: 'Core: Object Detection',
    icon: VisionIcon,
    description: `This is the foundation for all advanced autonomous features. We use OpenCV's DNN module with a pre-trained model (like YOLOv3-tiny) to detect objects in the camera's view. This module ('core/object_detector.py') will identify objects like people, cars, books, and traffic signs.`,
    code: `
# Simplified code for 'core/object_detector.py'
import cv2
import numpy as np

class ObjectDetector:
    def __init__(self):
        # Load the pre-trained model and class names
        self.net = cv2.dnn.readNet("models/yolov3-tiny.weights", "models/yolov3-tiny.cfg")
        # e.g., self.classes = ["person", "car", "dog", "book", "stop sign"]

    def detect(self, frame):
        # Pre-process the image and pass it through the network
        blob = cv2.dnn.blobFromImage(frame, 1/255.0, (416, 416), swapRB=True, crop=False)
        self.net.setInput(blob)
        layer_outputs = self.net.forward(self.get_output_layers())
        
        # Post-process the results to get bounding boxes and class IDs
        # ... logic to parse layer_outputs ...
        
        return detected_objects # e.g., [{"label": "person", "box": [x,y,w,h]}]
`,
  },
  {
    id: 7,
    title: 'Implementing Autopilot Modes',
    icon: AutopilotIcon,
    description: `The autopilot logic, running in its own thread, continuously checks the robot's state to decide its actions. We can add different modes like Traffic Recognition, Object Following, and a new 'Explore' mode for random movement.`,
    code: `
# Logic inside the autopilot_loop() in main.py
import random

def autopilot_loop():
    global AUTOPILOT_MODE, LATEST_DETECTIONS
    while True:
        # ... (other modes like traffic, follow) ...
        
        if AUTOPILOT_MODE == 'explore':
            # Move forward for a random duration
            motor_control.move_forward(speed=35)
            time.sleep(random.uniform(1.0, 2.5))
            
            # Choose a random turn
            turn_function = random.choice([motor_control.rotate_left, motor_control.rotate_right])
            turn_function(speed=50)
            time.sleep(random.uniform(0.5, 1.5))
            motor_control.stop()
            time.sleep(1.0) # Pause before next action

        # ... (sleep)
`,
  },
  {
    id: 8,
    title: 'Intelligent Actions & Personality',
    icon: RobotIcon,
    description: `We can trigger special actions and animations. A command can initiate a Google Assistant-style light effect, and other commands can trigger specific behaviors like the Gujarati introduction. The robot can also proactively greet people it sees.`,
    code: `
# Add this command to the handler in main.py
from core import led_control

def handle_command(command):
    # ... other commands
    if command == "wake_word":
        led_control.assistant_wakeup_animation()
        return "Listening..."

# Add this new animation function to core/led_control.py using PWM
def assistant_wakeup_animation():
    # Pulses through Google colors (Blue, Red, Yellow, Green)
    # This requires setting up RPi.GPIO with PWM to control brightness.
    colors = [(0, 26, 100), (100, 0, 0), (100, 92, 23), (0, 59, 0)] # Duty cycles
    
    for _ in range(2): # Repeat animation twice
        for r, g, b in colors:
            # Fade in and out logic using PWM duty cycle changes
            # e.g., for i in range(0, 101, 10): set_color_pwm(...)
            time.sleep(0.25)
    turn_off()
`,
  },
  {
    id: 9,
    title: 'Customizable Wake Word',
    icon: MicIcon,
    description: `Make the robot truly hands-free by implementing a customizable voice wake word. The robot will use its microphone to continuously listen for a specific phrase (e.g., "Hey Garud"). When detected, it will trigger the "listening" LED animation. The wake word can be changed from the web UI.`,
    code: `
# Add to main.py
from core import wake_word

STATE = { "wake_word": "hey garud", ... }

@app.route('/set-wake-word', methods=['POST'])
def set_wake_word():
    word = request.json.get('wake_word', '').lower()
    if word:
        STATE["wake_word"] = word
        return jsonify(status="success")
    return jsonify(status="error")

# In core/wake_word.py
import speech_recognition as sr

def listen_for_wake_word(get_wake_word_func, callback_func):
    r = sr.Recognizer()
    mic = sr.Microphone()
    with mic as source:
        r.adjust_for_ambient_noise(source)
    
    while True:
        with mic as source:
            audio = r.listen(source)
        try:
            text = r.recognize_google(audio).lower()
            if get_wake_word_func() in text:
                callback_func()
        except sr.UnknownValueError:
            pass # Ignore if speech is not understood
`
  },
  {
    id: 10,
    title: 'Customizing AI Responses',
    icon: ChatBubbleLeftRightIcon,
    description: `You can teach Garud new things! The robot's backend can store a dictionary of custom question-and-answer pairs. A dedicated API endpoint allows the web UI to send and update these responses, making the robot's personality fully customizable.`,
    code: `
# In main.py, add a global dictionary
CUSTOM_RESPONSES = {}

# Create a new endpoint to receive updates from the web UI
@app.route('/custom-responses', methods=['POST'])
def handle_custom_responses():
    global CUSTOM_RESPONSES
    data = request.json
    # ... logic to update CUSTOM_RESPONSES dict ...
    return jsonify(status="success")

# Modify your command handler to check for custom questions
def handle_command(command, text):
    if text and text in CUSTOM_RESPONSES:
        answer = CUSTOM_RESPONSES[text]
        text_to_speech.speak(answer)
        return answer
    
    # ... handle other commands
`,
  },
  {
    id: 11,
    title: 'Gemini API for Advanced Queries',
    icon: BrainIcon,
    description: `For tasks that require understanding beyond simple object detection, like describing a complex scene or answering a scanned question, we use the Google Gemini API. This allows the robot to have rich, contextual conversations.`,
    code: `
# This code is in 'core/gemini_ai.py'
import os
import google.generativeai as genai
from PIL import Image

genai.configure(api_key=os.environ["API_KEY"])
model = genai.GenerativeModel('gemini-2.5-flash')

def get_gemini_response(prompt_text, image_path=None):
    if image_path:
        img = Image.open(image_path)
        response = model.generate_content([prompt_text, img])
    else:
        response = model.generate_content(prompt_text)
    return response.text
`,
  },
  {
    id: 12,
    title: 'Avoiding Harmful Creatures',
    icon: BiohazardIcon,
    description: `A key safety feature is the ability to recognize and avoid potential threats. This is implemented within the Autopilot logic. If the object detector identifies a "harmful creature" (e.g., a toy snake, which you would need to train your model to recognize), the robot will immediately stop and move backward.`,
    code: `
# Add this logic to your autopilot_loop in main.py
# This check should take priority over other modes.

def autopilot_loop():
    # ...
    
    # Priority 1: Safety Check
    if any(d['label'] == 'snake' for d in LATEST_DETECTIONS):
        print("Harmful creature detected! Retreating.")
        motor_control.move_backward(speed=70)
        time.sleep(1.5) # Move back for 1.5 seconds
        motor_control.stop()
        # You might want to disable autopilot or send an alert
        continue # Skip other logic for this cycle

    # ... logic for traffic, follow, etc.
`,
  },
  {
    id: 13,
    title: 'Proactive Greetings',
    icon: HandWavingIcon,
    description: `To make the robot more interactive, it will proactively greet people and dogs. The object detection loop continuously scans for faces. When a new face is detected, it says "Namaste" in Gujarati. A set stores the IDs of greeted individuals to prevent repeated greetings, creating a more natural interaction.`,
    code: `
# This logic is added to the main detection loop in main.py
from utils.text_to_speech import speak

SEEN_FACES = set()

def detection_loop():
    # ... inside loop
    detections = detector.detect(frame)
    
    # Check for persons or dogs
    for obj in detections:
        if obj['label'] in ['person', 'dog']:
            # Create a simple unique ID based on position to avoid re-greeting
            obj_id = f"{obj['label']}_{int(obj['box'][0]/50)}"
            if obj_id not in SEEN_FACES:
                print(f"New {obj['label']} detected. Greeting.")
                speak("નમસ્તે", lang='gu')
                SEEN_FACES.add(obj_id)
                # Optional: Add a timeout to forget faces after a while
    # ...
`
  },
  {
    id: 14,
    title: 'Ultrasonic Distance Sensing',
    icon: BeakerIcon,
    description: `The robot is equipped with an ultrasonic sensor to measure distances. This is crucial for the basic obstacle avoidance mode and can be used as a fallback safety measure in other modes. The Yahboom library makes reading from this sensor straightforward.`,
    code: `
# This code goes in 'core/ultrasonic.py'
from yahboom_robot_hat import YahboomRobot

robot = YahboomRobot()

def get_distance():
    """
    Measures the distance using the ultrasonic sensor.
    Returns the distance in centimeters (cm).
    """
    distance = robot.get_distance()
    if distance is not None:
        return distance
    else:
        return -1 # Return an error value
`,
  },
];