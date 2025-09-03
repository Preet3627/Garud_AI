export const ROBOT_CODEBASE: Record<string, string> = {
  '.env': `API_KEY="YOUR_GEMINI_API_KEY_HERE"
`,
  '.gitignore': `
# Byte-compiled / optimized / DLL files
__pycache__/
*.py[cod]
*$py.class

# C extensions
*.so

# Distribution / packaging
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg
MANIFEST

# PyInstaller
#  Usually these files are written by a python script from a template
#  before PyInstaller builds the exe, so as to inject date/other infos into it.
*.manifest
*.spec

# Installer logs
pip-log.txt
pip-delete-this-directory.txt

# Unit test / coverage reports
htmlcov/
.tox/
.nox/
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
*.log
.hypothesis/
.pytest_cache/

# Environments
.env
.venv
env/
venv/
ENV/
env.bak/
venv.bak/

# IDE files
.idea/
.vscode/
models/
`,
  'requirements.txt': `# --- Installation ---
#
# == Raspberry Pi (Target Robot) ==
# 1. Install system dependencies for audio:
#    sudo apt-get update && sudo apt-get install -y portaudio19-dev
# 2. Install Python packages:
#    pip install -r requirements.txt
#
# == Windows/macOS (For Dev/UI testing) ==
# The following packages are Raspberry Pi specific and should be commented out or skipped:
# - yahboom-robot-hat
# - RPi.GPIO
# You can then run 'pip install -r requirements.txt' (after commenting them out).
# Note: PyAudio may require special installation steps on Windows.

Flask
Flask-Cors
google-generativeai
python-dotenv
yahboom-robot-hat
opencv-python-headless
numpy
gunicorn
RPi.GPIO
SpeechRecognition
PyAudio
Pillow
`,
  'main.py': `import os
import threading
import time
import random
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from dotenv import load_dotenv

from core import motor_control, vision, ultrasonic, ir_remote, led_control, wake_word
from core.camera import Camera
from core.object_detector import ObjectDetector
from utils import text_to_speech

# --- Load Environment and Initialize ---
load_dotenv()
led_control.setup_leds()
led_control.google_light_animation()

# --- Global State Management ---
# Using a dictionary for thread-safe-like access to global state
STATE = {
    "latest_detections": [],
    "autopilot_mode": "off", # 'off', 'avoid', 'traffic', 'follow', 'explore'
    "seen_entities": set(),
    "is_running": True,
    "custom_responses": {}, # Stores question:answer pairs
    "wake_word": "hey garud" # Default wake word
}

# --- Initialization ---
app = Flask(__name__)
CORS(app)
camera = Camera().start()
detector = ObjectDetector()


# --- Background Threads ---

def detection_loop():
    """Continuously runs object detection and handles proactive behaviors."""
    print("Starting object detection loop...")
    while STATE["is_running"]:
        frame = camera.read_frame()
        if frame is None:
            time.sleep(0.1)
            continue
        
        detections = detector.detect(frame)
        STATE["latest_detections"] = detections
        
        # Proactive Greeting Logic
        for d in detections:
            if d['label'] in ['person', 'dog']:
                # Create a simple unique ID based on class and rough position
                entity_id = f"{d['label']}_{round(d['box'][0] / 50)}"
                if entity_id not in STATE["seen_entities"]:
                    print(f"New entity detected: {entity_id}. Greeting.")
                    text_to_speech.speak("નમસ્તે", lang="gu")
                    STATE["seen_entities"].add(entity_id)
                    # Optional: Add a timer to clear the seen_entities set
        
        time.sleep(0.1) # Limit loop frequency
    print("Detection loop stopped.")

def autopilot_loop():
    """Runs autopilot logic based on current mode and detections."""
    print("Starting autopilot loop...")
    while STATE["is_running"]:
        mode = STATE["autopilot_mode"]
        detections = STATE["latest_detections"]
        
        if mode == "off":
            time.sleep(0.5) # Don't spin CPU when idle
            continue
        
        # Priority 1: Safety - Avoid harmful creatures
        if any(d['label'] == 'snake' for d in detections): # Assuming 'snake' is a class in your model
            print("Harmful creature detected! Reversing.")
            motor_control.move_backward(speed=70)
            time.sleep(1.5)
            motor_control.stop()
            STATE["autopilot_mode"] = "off" # Disable autopilot for safety
            continue

        # Mode-specific logic
        if mode == 'avoid':
            distance = ultrasonic.get_distance()
            if distance is not None and distance > 25:
                motor_control.move_forward(speed=40)
            else:
                motor_control.stop()
                time.sleep(0.1)
                motor_control.rotate_left(speed=50)
                time.sleep(0.5)
                motor_control.stop()
        
        elif mode == 'traffic':
            is_stop_sign = any(d['label'] == 'stop sign' for d in detections)
            # Add logic for traffic lights if your model supports it
            if is_stop_sign:
                motor_control.stop()
            else:
                motor_control.move_forward(speed=35)
                
        elif mode == 'follow':
            cars = [d for d in detections if d['label'] == 'car']
            if cars:
                # Get the largest car detected
                target = max(cars, key=lambda x: x['box'][2] * x['box'][3])
                box = target['box']
                # Simple proportional controller to keep the car centered
                center_x = box[0] + box[2] / 2
                error = 320 - center_x # Assuming 640x480 resolution
                
                # Adjust rotation based on error
                turn_speed = int(error * 0.2)
                # Clamp speed
                turn_speed = max(-40, min(40, turn_speed))
                motor_control.rotate_right(speed=turn_speed)

            else:
                motor_control.stop()
        
        elif mode == 'explore':
            # Simple random movement: move forward, turn, repeat.
            print("Exploring...")
            motor_control.move_forward(speed=35)
            time.sleep(random.uniform(1.0, 2.5))
            
            turn_function = random.choice([motor_control.rotate_left, motor_control.rotate_right])
            turn_speed = random.randint(40, 60)
            turn_duration = random.uniform(0.5, 1.5)
            
            print(f"Turning for {turn_duration:.2f}s")
            turn_function(speed=turn_speed)
            time.sleep(turn_duration)
            motor_control.stop()
            time.sleep(1.0) # Pause before next move

        time.sleep(0.1)
    print("Autopilot loop stopped.")

# --- API Endpoints ---
@app.route('/')
def index():
    return "Garud AI Robot API is running."

@app.route('/command', methods=['POST'])
def handle_command():
    data = request.json
    command = data.get('command')
    text = data.get('text') # Optional text payload for custom questions
    print(f"Received command: {command}")

    # Check for custom responses first
    if command == "test_custom_response" and text in STATE["custom_responses"]:
        response_text = STATE["custom_responses"][text]
        text_to_speech.speak(response_text)
        return jsonify(status="success", message=response_text)

    # Movement Commands
    if command == 'move_forward': 
        motor_control.move_forward()
        return jsonify(status="success", message="Moving forward.")
    elif command == 'move_backward': 
        motor_control.move_backward()
        return jsonify(status="success", message="Moving backward.")
    elif command == 'strafe_left': 
        motor_control.strafe_left()
        return jsonify(status="success", message="Strafing left.")
    elif command == 'strafe_right': 
        motor_control.strafe_right()
        return jsonify(status="success", message="Strafing right.")
    elif command == 'rotate_left': 
        motor_control.rotate_left()
        return jsonify(status="success", message="Rotating left.")
    elif command == 'rotate_right': 
        motor_control.rotate_right()
        return jsonify(status="success", message="Rotating right.")
    elif command == 'stop': 
        motor_control.stop()
        return jsonify(status="success", message="Stopping all movement.")
    
    # Sensor and AI Commands
    elif command == 'measure_distance':
        distance = ultrasonic.get_distance()
        response = f"Distance: {distance:.1f} cm." if distance else "Could not measure distance."
        return jsonify(status="success", message=response)

    elif command == 'wake_word':
        led_control.assistant_wakeup_animation()
        return jsonify(status="success", message="Listening...")

    elif command == 'introduce_gujarati':
        intro_text = "હું એક AI રોબોટ છું, મારું નામ ગરુડ છે અને મને PM શ્રી પ્રાથમિક વિદ્યામંદિર પોણસરી દ્વારા વિકસાવવામાં આવ્યો છે."
        text_to_speech.speak(intro_text, lang="gu")
        return jsonify(status="success", message=intro_text)
    
    elif command == 'find_book':
        if any(d['label'] == 'book' for d in STATE["latest_detections"]):
            response = "I see a book!"
        else:
            response = "I am looking, but I don't see a book right now."
        text_to_speech.speak(response)
        return jsonify(status="success", message=response)
        
    elif command == 'describe_scene':
        description = vision.see_and_describe(camera)
        text_to_speech.speak(description)
        return jsonify(status="success", message=description)

    elif command == 'scan_question':
        # Placeholder for scanning a question with the camera
        response = "Scanning question... The capital of France is Paris."
        text_to_speech.speak(response)
        return jsonify(status="success", message=response)
        
    return jsonify(status="error", message=f"Unknown command: {command}")


@app.route('/autopilot', methods=['POST'])
def handle_autopilot():
    data = request.json
    mode = data.get('mode') # 'off', 'avoid', 'traffic', 'follow', 'explore'
    
    if mode in ['off', 'avoid', 'traffic', 'follow', 'explore']:
        STATE["autopilot_mode"] = mode
        if mode == 'off':
            motor_control.stop()
        message = f"Autopilot engaged: {mode.capitalize()} mode." if mode != "off" else "All autopilot systems deactivated."
        print(message)
        return jsonify(status="success", message=message)
    
    return jsonify(status="error", message="Invalid mode.")

@app.route('/custom-responses', methods=['POST'])
def handle_custom_responses():
    data = request.json.get('responses', [])
    # Convert list of dicts to a single dict for fast lookups
    STATE["custom_responses"] = {item['question']: item['answer'] for item in data}
    print(f"Updated custom responses. Total: {len(STATE['custom_responses'])}")
    return jsonify(status="success", message="Custom responses updated successfully.")


@app.route('/set-wake-word', methods=['POST'])
def set_wake_word():
    data = request.json
    word = data.get('wake_word')
    if word and isinstance(word, str):
        STATE["wake_word"] = word.lower().strip()
        print(f"Wake word updated to: '{STATE['wake_word']}'")
        return jsonify(status="success", message=f"Wake word set to '{word}'.")
    return jsonify(status="error", message="Invalid wake word provided.")


@app.route('/video_feed')
def video_feed():
    """Video streaming route that draws detection boxes."""
    def generate():
        while STATE["is_running"]:
            frame = camera.read_frame()
            if frame is None:
                continue
            
            # Draw latest detections on the frame
            detections = STATE["latest_detections"]
            output_frame = detector.draw_boxes(frame, detections)

            (flag, encodedImage) = cv2.imencode(".jpg", output_frame)
            if not flag:
                continue
            
            yield(b'--frame\\r\\n' b'Content-Type: image/jpeg\\r\\n\\r\\n' + 
                  bytearray(encodedImage) + b'\\r\\n')
            time.sleep(0.03)

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

def cleanup():
    print("Shutting down...")
    STATE["is_running"] = False
    motor_control.stop()
    camera.stop()
    led_control.cleanup()

if __name__ == '__main__':
    try:
        # Start background threads
        detection_thread = threading.Thread(target=detection_loop, daemon=True)
        autopilot_thread = threading.Thread(target=autopilot_loop, daemon=True)
        ir_thread = threading.Thread(target=ir_remote.ir_control_loop, daemon=True)
        wake_word_thread = threading.Thread(
            target=wake_word.listen_for_wake_word,
            args=(lambda: STATE["wake_word"], led_control.assistant_wakeup_animation),
            daemon=True
        )
        
        detection_thread.start()
        autopilot_thread.start()
        ir_thread.start()
        wake_word_thread.start()
        
        print("Starting Flask server...")
        # Use gunicorn for production, but Flask's development server is fine for this context
        app.run(host='0.0.0.0', port=5001, threaded=True)
        
    finally:
        cleanup()
`,
  'core/__init__.py': ``,
  'core/camera.py': `import cv2
import time
import threading

class Camera:
    """A thread-safe camera class for continuous video capture."""
    def __init__(self, src=0, resolution=(640, 480)):
        self.stream = cv2.VideoCapture(src)
        if not self.stream.isOpened():
            raise IOError("Cannot open camera")
        
        self.stream.set(cv2.CAP_PROP_FRAME_WIDTH, resolution[0])
        self.stream.set(cv2.CAP_PROP_FRAME_HEIGHT, resolution[1])
        
        (self.grabbed, self.frame) = self.stream.read()
        self.started = False
        self.read_lock = threading.Lock()

    def start(self):
        if self.started:
            print("Camera thread already started.")
            return self
        self.started = True
        self.thread = threading.Thread(target=self.update, args=())
        self.thread.daemon = True
        self.thread.start()
        print("Camera thread started.")
        return self

    def update(self):
        while self.started:
            (grabbed, frame) = self.stream.read()
            with self.read_lock:
                self.grabbed = grabbed
                self.frame = frame

    def read_frame(self):
        with self.read_lock:
            if self.frame is None:
                return None
            frame = self.frame.copy()
        return frame

    def stop(self):
        self.started = False
        if self.thread.is_alive():
            self.thread.join()
        self.stream.release()
        print("Camera stopped.")

    def capture_and_save(self, filename="capture.jpg"):
        """Captures a single frame and saves it to a file."""
        frame = self.read_frame()
        if frame is not None:
            cv2.imwrite(filename, frame)
            return filename
        return None
`,
  'core/gemini_ai.py': `import os
import google.generativeai as genai
from PIL import Image

# Configure the API key from environment variables
api_key = os.environ.get("API_KEY")
if not api_key:
    raise ValueError("API_KEY not found in environment variables. Please set it in your .env file.")
genai.configure(api_key=api_key)

# Initialize the generative model
model = genai.GenerativeModel('gemini-2.5-flash')

def get_gemini_response(prompt_text, image_path=None):
    """
    Gets a response from the Gemini API, with an optional image.
    This is a synchronous function.
    """
    try:
        if image_path:
            if not os.path.exists(image_path):
                return "Error: Image file not found."
            
            img = Image.open(image_path)
            # The model can take a list of mixed text and image parts
            response = model.generate_content([prompt_text, img])
        else:
            # For text-only prompts
            response = model.generate_content(prompt_text)
        
        return response.text
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return "I'm sorry, I encountered an error trying to process that."
`,
    'core/object_detector.py': `import cv2
import numpy as np
import os

class ObjectDetector:
    """
    A class to handle object detection using OpenCV's DNN module.
    """
    def __init__(self, model_path='models/yolov3-tiny.weights', config_path='models/yolov3-tiny.cfg'):
        print("Initializing Object Detector...")
        if not os.path.exists(model_path) or not os.path.exists(config_path):
            raise FileNotFoundError("YOLO model files not found. Please download them into the 'models' directory.")

        self.net = cv2.dnn.readNet(model_path, config_path)
        self.layer_names = self.net.getLayerNames()
        self.output_layers = [self.layer_names[i - 1] for i in self.net.getUnconnectedOutLayers().flatten()]
        
        # COCO class labels
        self.classes = ["person", "bicycle", "car", "motorbike", "aeroplane", "bus", "train", "truck", "boat",
                        "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
                        "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
                        "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
                        "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
                        "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
                        "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
                        "sofa", "pottedplant", "bed", "diningtable", "toilet", "tvmonitor", "laptop", "mouse",
                        "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
                        "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"]
        print("Object Detector initialized successfully.")

    def detect(self, frame, confidence_threshold=0.5, nms_threshold=0.4):
        height, width, _ = frame.shape
        blob = cv2.dnn.blobFromImage(frame, 1/255.0, (416, 416), swapRB=True, crop=False)
        self.net.setInput(blob)
        layer_outputs = self.net.forward(self.output_layers)

        boxes = []
        confidences = []
        class_ids = []

        for output in layer_outputs:
            for detection in output:
                scores = detection[5:]
                class_id = np.argmax(scores)
                confidence = scores[class_id]
                if confidence > confidence_threshold:
                    center_x = int(detection[0] * width)
                    center_y = int(detection[1] * height)
                    w = int(detection[2] * width)
                    h = int(detection[3] * height)
                    x = int(center_x - w / 2)
                    y = int(center_y - h / 2)
                    boxes.append([x, y, w, h])
                    confidences.append(float(confidence))
                    class_ids.append(class_id)
        
        # Non-Max Suppression
        indices = cv2.dnn.NMSBoxes(boxes, confidences, confidence_threshold, nms_threshold)
        
        detected_objects = []
        if len(indices) > 0:
            for i in indices.flatten():
                box = boxes[i]
                label = str(self.classes[class_ids[i]])
                detected_objects.append({"label": label, "box": box, "confidence": confidences[i]})
        
        return detected_objects

    def draw_boxes(self, frame, detections):
        """Draws bounding boxes on the frame."""
        for detection in detections:
            x, y, w, h = detection['box']
            label = detection['label']
            confidence = detection['confidence']
            color = (0, 255, 0) # Green
            cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
            text = f"{label}: {confidence:.2f}"
            cv2.putText(frame, text, (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        return frame
`,
  'core/ir_remote.py': `import time
from yahboom_robot_hat import YahboomRobot
from core import motor_control

# Initialize robot singleton
robot = YahboomRobot()

def ir_control_loop():
    """A loop that listens for IR remote signals and controls the robot."""
    print("IR control loop started.")
    while True:
        try:
            key = robot.get_ir_remote_code()
            if key is not None:
                print(f"IR Key Press Detected: {key}")
                # Map keys to motor functions
                if key == robot.IR_REMOTE_UP: motor_control.move_forward()
                elif key == robot.IR_REMOTE_DOWN: motor_control.move_backward()
                elif key == robot.IR_REMOTE_LEFT: motor_control.rotate_left()
                elif key == robot.IR_REMOTE_RIGHT: motor_control.rotate_right()
                elif key == robot.IR_REMOTE_OK: motor_control.stop()
                
                # Small delay after command to prevent double presses
                time.sleep(0.2)
        except Exception as e:
            print(f"Error in IR loop: {e}")
            time.sleep(2)
        
        time.sleep(0.1) # Polling interval
`,
  'core/led_control.py': `import RPi.GPIO as GPIO
import time

# Define GPIO pins for R, G, B using BCM numbering
RED_PIN, GREEN_PIN, BLUE_PIN = 17, 27, 22
PINS = [RED_PIN, GREEN_PIN, BLUE_PIN]

# PWM objects
red_pwm, green_pwm, blue_pwm = None, None, None
is_setup = False

def setup_leds():
    """Set up GPIO pins and PWM for the RGB LED."""
    global is_setup, red_pwm, green_pwm, blue_pwm
    if is_setup: return
    
    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(PINS, GPIO.OUT, initial=GPIO.LOW)
    
    # Initialize PWM on each pin, 100 Hz frequency
    red_pwm = GPIO.PWM(RED_PIN, 100)
    green_pwm = GPIO.PWM(GREEN_PIN, 100)
    blue_pwm = GPIO.PWM(BLUE_PIN, 100)
    
    # Start PWM with 0% duty cycle (off)
    red_pwm.start(0)
    green_pwm.start(0)
    blue_pwm.start(0)
    
    is_setup = True
    print("LEDs setup with PWM.")

def set_color_pwm(r_duty, g_duty, b_duty):
    """
    Set LED color using PWM duty cycles (0-100).
    Assumes a common anode RGB LED, where 100 is OFF and 0 is full brightness.
    """
    if not is_setup: setup_leds()
    if red_pwm: red_pwm.ChangeDutyCycle(100 - r_duty)
    if green_pwm: green_pwm.ChangeDutyCycle(100 - g_duty)
    if blue_pwm: blue_pwm.ChangeDutyCycle(100 - b_duty)

def turn_off():
    set_color_pwm(0, 0, 0)

def cleanup():
    """Clean up GPIO resources."""
    print("Cleaning up GPIO for LEDs.")
    if is_setup:
        red_pwm.stop()
        green_pwm.stop()
        blue_pwm.stop()
        GPIO.cleanup(PINS)

def google_light_animation():
    """Cycles through Google colors to indicate startup."""
    # RGB values (0-255) converted to duty cycle (0-100)
    colors_rgb = [
        (0, 68, 255),    # Blue
        (255, 0, 0),     # Red
        (255, 235, 59),  # Yellow
        (0, 150, 0),     # Green
    ]
    for r, g, b in colors_rgb:
        set_color_pwm(r / 2.55, g / 2.55, b / 2.55)
        time.sleep(0.5)
    turn_off()
    print("Startup animation complete.")

def assistant_wakeup_animation():
    """Pulses through Google colors like Google Assistant."""
    if not is_setup: setup_leds()
    print("Starting Assistant wake-up animation...")
    
    # RGB duty cycles for Google colors (0-100)
    colors = [
        (0, 26, 100),   # Blue
        (100, 0, 0),    # Red
        (100, 92, 23),  # Yellow
        (0, 59, 0),     # Green
    ]
    
    pulse_duration = 0.25 # Time for one pulse (in and out)
    
    for _ in range(2): # Repeat cycle twice
        for r, g, b in colors:
            # Fade in
            for i in range(0, 101, 5):
                set_color_pwm(r * (i/100.0), g * (i/100.0), b * (i/100.0))
                time.sleep(pulse_duration / 40)
            # Fade out
            for i in range(100, -1, -5):
                set_color_pwm(r * (i/100.0), g * (i/100.0), b * (i/100.0))
                time.sleep(pulse_duration / 40)
    
    turn_off()
    print("Assistant animation finished.")
`,
  'core/motor_control.py': `from yahboom_robot_hat import YahboomRobot
import atexit

# Initialize the robot hardware interface as a singleton
robot = YahboomRobot()

def stop():
    """Stop all four motors."""
    robot.set_motor(0, 0, 0, 0)

def move_forward(speed=50):
    """Move forward by running all wheels in the same direction."""
    robot.set_motor(speed, speed, speed, speed)

def move_backward(speed=50):
    """Move backward."""
    robot.set_motor(-speed, -speed, -speed, -speed)
    
def strafe_left(speed=50):
    """Strafe left without changing orientation."""
    robot.set_motor(-speed, speed, speed, -speed)

def strafe_right(speed=50):
    """Strafe right without changing orientation."""
    robot.set_motor(speed, -speed, -speed, speed)

def rotate_left(speed=50):
    """Rotate counter-clockwise on the spot."""
    robot.set_motor(-speed, speed, -speed, speed)

def rotate_right(speed=50):
    """Rotate clockwise on the spot."""
    robot.set_motor(speed, -speed, speed, -speed)

# Register a cleanup function to stop motors on exit
atexit.register(stop)
`,
  'core/ultrasonic.py': `from yahboom_robot_hat import YahboomRobot
import time

robot = YahboomRobot()

def get_distance():
    """
    Measures the distance using the ultrasonic sensor.
    Returns the distance in centimeters (cm) or None on failure.
    """
    distance = robot.get_distance()
    if distance is not None and distance > 0:
        return distance
    else:
        return None # Return None for easier error handling
`,
  'core/vision.py': `from core.gemini_ai import get_gemini_response

def see_and_describe(camera_instance):
    """
    Captures an image, sends it to Gemini for description, and returns the text.
    """
    print("Capturing scene for description...")
    image_path = camera_instance.capture_and_save("capture.jpg")
    
    if image_path:
        print(f"Image captured: {image_path}. Getting description from Gemini...")
        description = get_gemini_response("Describe this scene in detail.", image_path)
        print(f"Gemini description: {description}")
        return description
    else:
        print("Failed to capture image.")
        return "I'm sorry, I couldn't see anything."
`,
  'core/wake_word.py': `import speech_recognition as sr
import time

def listen_for_wake_word(get_wake_word_func, callback_func):
    """
    Continuously listens for a wake word and triggers a callback function.
    
    :param get_wake_word_func: A function that returns the current wake word string.
    :param callback_func: The function to call when the wake word is detected.
    """
    recognizer = sr.Recognizer()
    microphone = sr.Microphone()

    # We calibrate the recognizer for ambient noise once at the start
    with microphone as source:
        print("Calibrating microphone for ambient noise... Please be quiet.")
        try:
            recognizer.adjust_for_ambient_noise(source, duration=2)
            print("Calibration complete. Listening for wake word...")
        except Exception as e:
            print(f"Could not calibrate microphone: {e}. Using default values.")

    while True:
        current_wake_word = get_wake_word_func()
        if not current_wake_word:
            time.sleep(1) # Wait if no wake word is set
            continue

        with microphone as source:
            try:
                # Listen for a phrase, with timeouts to prevent blocking forever
                audio = recognizer.listen(source, timeout=5, phrase_time_limit=4)
            except sr.WaitTimeoutError:
                # No speech detected, just continue the loop
                continue
        
        try:
            # Recognize speech using Google's free web API
            recognized_text = recognizer.recognize_google(audio).lower()
            print(f"Heard: '{recognized_text}'")

            # Check if the wake word is in the recognized text
            if current_wake_word in recognized_text:
                print(f"Wake word '{current_wake_word}' detected!")
                callback_func()
                # Optional: pause after detection to avoid re-triggering
                time.sleep(1) 
                
        except sr.UnknownValueError:
            # This is fine, it just means Google Speech Recognition could not understand the audio
            pass
        except sr.RequestError as e:
            # API was unreachable or unresponsive
            print(f"Could not request results from Google Speech Recognition service; {e}")
            time.sleep(5) # Wait before retrying
        except Exception as e:
            print(f"An unexpected error occurred in wake word listener: {e}")

        # A small delay to prevent high CPU usage
        time.sleep(0.1)
`,
  'utils/__init__.py': ``,
  'utils/text_to_speech.py': `import os

def speak(text, lang="en"):
    """
    Converts text to speech using the 'espeak' command-line tool.
    Supports different languages. For Gujarati, use lang='gu'.
    """
    try:
        # Sanitize text to prevent command injection
        sanitized_text = text.replace('"', '').replace("'", "").replace(";", "")
        
        voice_flag = ""
        if lang == "en":
            voice_flag = "-v en+f3" # English female voice
        elif lang == "gu":
            voice_flag = "-v gu" # Gujarati voice
            
        # -k5 adds emphasis, -s150 sets speed
        command = f'espeak {voice_flag} -k5 -s150 "{sanitized_text}"'
        print(f"Speaking (lang={lang}): {sanitized_text}")
        os.system(command)
    except Exception as e:
        print(f"Error in text-to-speech: {e}")
`,
};