import time
import os
import threading
import numpy as np
import io

# We'll use a try-except to allow the code to exist even if pybullet isn't installed yet
try:
    import pybullet as p
    import pybullet_data
    from PIL import Image
    PYBULLET_AVAILABLE = True
except ImportError:
    PYBULLET_AVAILABLE = False
    print("[Simulation] PyBullet or PIL not found. Simulation will run in headless/mock mode.")

class RobotSimulation:
    def __init__(self, use_gui=False):
        self.connected = False
        self.robot_id = None
        self.use_gui = use_gui
        self._running = False
        self._thread = None
        self.obstacles = []
        self.last_frame = None

    def connect(self):
        if not PYBULLET_AVAILABLE:
            return False
        
        mode = p.GUI if self.use_gui else p.DIRECT
        try:
            p.connect(mode)
            p.setAdditionalSearchPath(pybullet_data.getDataPath())
            p.setGravity(0, 0, -9.81)
            
            # Load world
            p.loadURDF("plane.urdf")
            
            # Load a simple robot
            self.robot_id = p.loadURDF("r2d2.urdf", [0, 0, 0.5])
            
            # Add some obstacles
            self._spawn_obstacles()
            
            self.connected = True
            print("[Simulation] Connected to PyBullet")
            return True
        except Exception as e:
            print(f"[Simulation] Failed to connect: {e}")
            return False

    def _spawn_obstacles(self):
        # Add some random cubes as obstacles
        for i in range(5):
            pos = [np.random.uniform(1, 5), np.random.uniform(-3, 3), 0.5]
            visual_id = p.createVisualShape(p.GEOM_BOX, halfExtents=[0.5, 0.5, 0.5], rgbaColor=[0.7, 0.2, 0.2, 1])
            collision_id = p.createCollisionShape(p.GEOM_BOX, halfExtents=[0.5, 0.5, 0.5])
            obs_id = p.createMultiBody(baseMass=0, baseCollisionShapeIndex=collision_id, baseVisualShapeIndex=visual_id, basePosition=pos)
            self.obstacles.append(obs_id)

    def step(self):
        if self.connected:
            p.stepSimulation()
            self._update_frame()

    def _update_frame(self):
        if not self.connected:
            return
        
        # Capture a frame from the simulation
        pos, _ = p.getBasePositionAndOrientation(self.robot_id)
        view_matrix = p.computeViewMatrixFromAt(
            cameraEyePosition=[pos[0] - 3, pos[1], pos[2] + 2],
            cameraTargetPosition=pos,
            cameraUpVector=[0, 0, 1]
        )
        proj_matrix = p.computeProjectionMatrixFOV(fov=60, aspect=1.0, nearVal=0.1, farVal=100.0)
        
        width, height, rgb_img, depth_img, seg_img = p.getCameraImage(
            width=320, height=240,
            viewMatrix=view_matrix,
            projectionMatrix=proj_matrix,
            renderer=p.ER_TINY_RENDERER
        )
        
        # Convert to JPEG
        rgba = np.reshape(rgb_img, (height, width, 4))
        img = Image.fromarray(rgba[:, :, :3].astype('uint8'), 'RGB')
        buf = io.BytesIO()
        img.save(buf, format='JPEG')
        self.last_frame = buf.getvalue()

    def move_robot(self, linear, angular):
        if not self.connected:
            return
        
        # Simple R2D2 control: joint 2 and 3 are wheels
        # Note: In a real URDF these might be different
        max_force = 10
        p.setJointMotorControl2(self.robot_id, 2, p.VELOCITY_CONTROL, targetVelocity=linear + angular, force=max_force)
        p.setJointMotorControl2(self.robot_id, 3, p.VELOCITY_CONTROL, targetVelocity=linear - angular, force=max_force)

    def get_robot_pose(self):
        if self.connected:
            return p.getBasePositionAndOrientation(self.robot_id)
        return ([0, 0, 0], [0, 0, 0, 1])

    def start_loop(self):
        self._running = True
        self._thread = threading.Thread(target=self._simulation_loop, daemon=True)
        self._thread.start()

    def _simulation_loop(self):
        while self._running:
            self.step()
            time.sleep(1./30.) # 30 FPS cap for simulation loop

    def stop(self):
        self._running = False
        if self.connected:
            p.disconnect()
