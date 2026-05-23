class GPIO:
    def __init__(self):
        print("[GPIO] Initialized Robot GPIO Emulator")

    def forward(self):
        print("[GPIO] MOTOR FORWARD")
        return {"status": "moving_forward"}

    def backward(self):
        print("[GPIO] MOTOR BACKWARD")
        return {"status": "moving_backward"}

    def turn_left(self):
        print("[GPIO] TURNING LEFT")
        return {"status": "turning_left"}

    def turn_right(self):
        print("[GPIO] TURNING RIGHT")
        return {"status": "turning_right"}

    def stop(self):
        print("[GPIO] STOP")
        return {"status": "stopped"}
