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

        # Thread-safe shared state — all PyBullet calls stay in the sim thread
        self._lock = threading.Lock()
        self._target_linear = 0.0
        self._target_angular = 0.0
        self._robot_pos = [0, 0, 0]
        self._robot_orn = [0, 0, 0, 1]

    def connect(self):
        if not PYBULLET_AVAILABLE:
            return False
        
        mode = p.GUI if self.use_gui else p.DIRECT
        try:
            p.connect(mode)
            p.setAdditionalSearchPath(pybullet_data.getDataPath())
            p.setGravity(0, 0, -9.81)
            
            p.loadURDF("plane.urdf")
            self.robot_id = p.loadURDF("r2d2.urdf", [0, 0, 0.5])
            self._spawn_obstacles()
            
            self.connected = True
            for joint in [2, 3, 6, 7]:
                p.setJointMotorControl2(self.robot_id, joint, p.VELOCITY_CONTROL, targetVelocity=0, force=100)
            for joint in [8, 9, 11, 13]:
                p.setJointMotorControl2(self.robot_id, joint, p.VELOCITY_CONTROL, targetVelocity=0, force=100)
            print("[Simulation] Connected to PyBullet")
            return True
        except Exception as e:
            print(f"[Simulation] Failed to connect: {e}")
            return False

    def _spawn_obstacles(self):
        for i in range(5):
            pos = [np.random.uniform(1, 5), np.random.uniform(-3, 3), 0.5]
            visual_id = p.createVisualShape(p.GEOM_BOX, halfExtents=[0.5, 0.5, 0.5], rgbaColor=[0.7, 0.2, 0.2, 1])
            collision_id = p.createCollisionShape(p.GEOM_BOX, halfExtents=[0.5, 0.5, 0.5])
            obs_id = p.createMultiBody(baseMass=0, baseCollisionShapeIndex=collision_id, baseVisualShapeIndex=visual_id, basePosition=pos)
            self.obstacles.append(obs_id)

    def move_robot(self, linear=0, angular=0):
        with self._lock:
            self._target_linear = linear
            self._target_angular = angular

    def get_robot_pose(self):
        with self._lock:
            return (list(self._robot_pos), list(self._robot_orn))

    def _apply_velocity(self, linear, angular):
        if not self.connected:
            return
        for joint in [2, 3]:
            p.setJointMotorControl2(self.robot_id, joint, p.VELOCITY_CONTROL, targetVelocity=linear + angular, force=100)
        for joint in [6, 7]:
            p.setJointMotorControl2(self.robot_id, joint, p.VELOCITY_CONTROL, targetVelocity=linear - angular, force=100)
        pos, orn = p.getBasePositionAndOrientation(self.robot_id)
        rot = p.getMatrixFromQuaternion(orn)
        fwd = [rot[0], rot[3], rot[6]]
        p.resetBaseVelocity(self.robot_id, [fwd[0] * linear, fwd[1] * linear, 0], [0, 0, angular])

    def step(self):
        if self.connected:
            p.stepSimulation()
            self._update_frame()

    def _update_frame(self):
        if not self.connected:
            return
        pos, _ = p.getBasePositionAndOrientation(self.robot_id)
        view_matrix = p.computeViewMatrix(
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
        rgba = np.reshape(rgb_img, (height, width, 4))
        img = Image.fromarray(rgba[:, :, :3].astype('uint8'), 'RGB')
        buf = io.BytesIO()
        img.save(buf, format='JPEG')
        self.last_frame = buf.getvalue()

    def start_loop(self):
        self._running = True
        self._thread = threading.Thread(target=self._simulation_loop, daemon=True)
        self._thread.start()

    def _simulation_loop(self):
        while self._running:
            with self._lock:
                lin = self._target_linear
                ang = self._target_angular
            self._apply_velocity(lin, ang)
            self.step()
            with self._lock:
                if self.connected:
                    pos, orn = p.getBasePositionAndOrientation(self.robot_id)
                    self._robot_pos = list(pos)
                    self._robot_orn = list(orn)
            time.sleep(1./240.)

    def stop(self):
        self._running = False
        if self.connected:
            p.disconnect()
