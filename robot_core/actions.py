from .gpio_emulator import GPIO

gpio = GPIO()

def execute_action(action: str):
    if action == "forward":
        return gpio.forward()
    elif action == "backward":
        return gpio.backward()
    elif action == "turn_left":
        return gpio.turn_left()
    elif action == "turn_right":
        return gpio.turn_right()
    elif action == "stop":
        return gpio.stop()
    else:
        return {"error": f"Unknown action: {action}"}
