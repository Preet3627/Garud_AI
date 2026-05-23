import time
import threading
from backend import robot_controller
from robot_core.vision import vision

class AutonomousAgent:
    def __init__(self):
        self._running = False
        self._thread = None
        self.mode = "manual" # manual or autonomous
        self.use_vision = True

    def start(self):
        if self._running:
            return
        self._running = True
        self.mode = "autonomous"
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("[Autonomy] Agent Loop Started with Vision")

    def stop(self):
        self._running = False
        self.mode = "manual"
        print("[Autonomy] Agent Loop Stopped")

    def _loop(self):
        while self._running:
            if self.mode == "autonomous":
                # 1. Get Physical Sensors (Ultrasonic)
                telemetry = robot_controller.get_robot_telemetry()
                distance = telemetry["sensors"]["distance"]
                
                # 2. Get Vision Data if enabled
                vision_decision = "FORWARD"
                if self.use_vision:
                    frame = robot_controller.get_camera_frame()
                    if frame:
                        vision_decision = vision.analyze_frame(frame)

                # 3. Hybrid Decision Making
                if distance < 30.0 or "STOP" in vision_decision:
                    print(f"[Autonomy] Blocking detected! Distance: {distance:.2f}cm. AI: {vision_decision}")
                    robot_controller.handle_command("stop")
                    time.sleep(0.5)
                    
                    if "RIGHT" in vision_decision:
                        robot_controller.handle_command("turn_right")
                    else:
                        robot_controller.handle_command("turn_left")
                    time.sleep(1.0)
                else:
                    # Clear path
                    robot_controller.handle_command("forward")
            
            # Vision models are slow, so we wait longer between loops
            time.sleep(0.5 if self.use_vision else 0.1)

agent = AutonomousAgent()
