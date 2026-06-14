from robot_core.actions import execute_action
from robot_core.robot_state import RobotState
from robot_core.sensors import Sensors
from simulation.pybullet_world import RobotSimulation

state = RobotState()
sensors = Sensors()
sim = RobotSimulation(use_gui=False) # Start headless by default for bridge

def init_controller():
    print("[RobotController] Initializing...")
    if sim.connect():
        sim.start_loop()
    else:
        print("[RobotController] Simulation not available, running in virtual mode.")

def handle_command(command: str):
    print(f"[RobotController] Received command: {command}")
    result = execute_action(command)
    
    # Sync with simulation if available
    if sim.connected:
        if command == "forward":
            sim.move_robot(10.0, 0)
        elif command == "backward":
            sim.move_robot(-10.0, 0)
        elif command == "turn_left":
            sim.move_robot(0, 4.0)
        elif command == "turn_right":
            sim.move_robot(0, -4.0)
        elif command == "stop":
            sim.move_robot(0, 0)
        
        pos, orn = sim.get_robot_pose()
        state.update_position(pos, orn)

    state.update_status(result.get("status", "unknown"))
    return {
        "action_result": result,
        "current_state": state.get_state()
    }

def get_robot_telemetry():
    if sim.connected:
        pos, orn = sim.get_robot_pose()
        state.update_position(pos, orn)
    
    # Simulate some realistic stats
    import random
    stats = {
        "motor_rpm": [random.randint(100, 150) for _ in range(2)],
        "battery_voltage": round(random.uniform(11.1, 12.6), 2),
        "cpu_temp": round(random.uniform(45.0, 55.0), 1),
        "wifi_signal": -random.randint(30, 60),
        "is_simulated": sim.connected
    }
        
    return {
        "state": state.get_state(),
        "sensors": sensors.get_all_sensors(),
        "stats": stats
    }

def get_camera_frame():
    if sim.connected and sim.last_frame is not None:
        return sim.last_frame
    return None

# Initialize on import
init_controller()
