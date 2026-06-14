class RobotVision:
    def __init__(self, model="llava"):
        self.model = model
        print(f"[Vision] Initialized with model: {self.model}")

    def analyze_frame(self, frame_bytes):
        """Analyzes a single frame for obstacle avoidance."""
        if not frame_bytes:
            return "No frame data"

        try:
            import ollama
            prompt = """
            You are a robot navigation assistant. Analyze this image from the robot's front camera.
            Is there an obstacle directly in front of the robot (within 1 meter)?
            Answer with only one of these commands: 'FORWARD', 'STOP_TURN_LEFT', 'STOP_TURN_RIGHT'.
            If path is clear, say 'FORWARD'. If blocked, choose a direction to turn.
            """
            
            response = ollama.generate(
                model=self.model,
                prompt=prompt,
                images=[frame_bytes],
                stream=False
            )
            
            decision = response['response'].strip().upper()
            print(f"[Vision] AI Decision: {decision}")
            return decision
        except Exception as e:
            print(f"[Vision] Error: {e}")
            return "ERROR"

vision = RobotVision()
