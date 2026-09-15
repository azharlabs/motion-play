export const CONTROL_PROFILES = {
  runner: {
    id: "runner",
    label: "Runner / Subway-style",
    description: "Lean to change lanes, jump to jump, crouch to slide.",
    keys: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", duck: "ArrowDown" },
    autoAccelerate: false,
  },
  racer: {
    id: "racer",
    label: "Racing / car game",
    description: "Lean to steer. MotionPlay keeps acceleration held while you are in frame.",
    keys: { left: "ArrowLeft", right: "ArrowRight", accelerate: "ArrowUp", brake: "ArrowDown" },
    autoAccelerate: true,
  },
  platformer: {
    id: "platformer",
    label: "Platform game",
    description: "Lean to move left or right, jump with a real jump, crouch for down.",
    keys: { left: "ArrowLeft", right: "ArrowRight", jump: "Space", duck: "ArrowDown" },
    autoAccelerate: false,
  },
};

export const profileById = (id) => CONTROL_PROFILES[id] ?? CONTROL_PROFILES.runner;
