import random

class Sensors:
    def get_ultrasonic_distance(self):
        # In a real robot, this would read GPIO pins
        # Here we'll eventually sync it with PyBullet
        return random.uniform(2.0, 400.0)

    def get_imu_data(self):
        return {
            "accel": [random.uniform(-1, 1) for _ in range(3)],
            "gyro": [random.uniform(-1, 1) for _ in range(3)]
        }

    def get_all_sensors(self):
        return {
            "distance": self.get_ultrasonic_distance(),
            "imu": self.get_imu_data()
        }
