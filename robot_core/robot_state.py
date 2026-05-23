class RobotState:
    def __init__(self):
        self.x = 0.0
        self.y = 0.0
        self.z = 0.1
        self.orientation = [0, 0, 0, 1] # Quaternion
        self.status = "idle"
        self.battery = 100
        self.sensors = {}

    def update_position(self, pos, orn):
        self.x, self.y, self.z = pos
        self.orientation = orn

    def update_status(self, status):
        self.status = status

    def get_state(self):
        return {
            "position": {"x": self.x, "y": self.y, "z": self.z},
            "orientation": self.orientation,
            "status": self.status,
            "battery": self.battery,
            "sensors": self.sensors
        }
