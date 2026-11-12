export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export const GRAVITY = 20;
export const PLAYER_RADIUS = 0.35;
export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.1;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 0.95;
export const HEAD_SIZE = 0.32;
export const STEP_HEIGHT = 0.45;
export const GROUND_PROBE = 0.08;
export const GROUND_NORMAL_MIN = 0.7;
export const WALL_NORMAL_MAX = 0.3;

export const RUN_SPEED = 8.5;
export const CROUCH_SPEED = 3.4;
export const GROUND_ACCEL = 10;
export const GROUND_FRICTION = 6;
export const STOP_SPEED = 2.6;

export const AIR_ACCEL = 10;
export const AIR_WISH_CAP = 0.8;
export const AIR_CONTROL = 55;
export const AIR_DRAG_START = 24;
export const AIR_DRAG = 0.35;

export const JUMP_SPEED = 7;
export const JUMP_MAX_VERTICAL = 11;
export const JUMP_BUFFER = 0.1;
export const COYOTE_TIME = 0.08;

export const SLIDE_MIN_SPEED = 7;
export const SLIDE_END_SPEED = 4;
export const SLIDE_BOOST = 2.2;
export const SLIDE_FRICTION = 0.55;
export const SLIDE_STOP_SPEED = 1;
export const SLIDE_COOLDOWN = 0.9;
export const SLIDE_STEER_ACCEL = 1.4;

export const WALLJUMP_WINDOW = 0.25;
export const WALLJUMP_PUSH = 5;
export const WALLJUMP_UP = 6.8;
export const WALLJUMP_MAX = 2;
export const WALL_PROBE = 0.3;

export const DASH_SPEED = 13;
export const DASH_EXTRA = 2;
export const DASH_COOLDOWN = 0.9;
export const DASH_LIFT = 1.5;

export const PAD_COOLDOWN = 0.3;

export const MAX_HEALTH = 100;
export const MAX_OVERHEAL = 150;
export const MAX_ARMOR = 100;
export const ARMOR_ABSORB = 0.66;
export const RESPAWN_DELAY = 2.5;
export const SPAWN_PROTECTION = 1;
export const PICKUP_RADIUS = 1;
export const FALL_KILL_Y = -30;

export const BUTTON = Object.freeze({ JUMP: 1, CROUCH: 2, DASH: 4, FIRE: 8, ALT: 16, RELOAD: 32 });
export const BUTTON_MASK = 63;

export const MODES = Object.freeze({ ffa: { name: "Visi pret visiem", fragLimit: 25, timeLimit: 600 }, tdm: { name: "Komandu cīņa", fragLimit: 50, timeLimit: 600 } });
