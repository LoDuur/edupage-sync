const HEARTBEAT_INTERVAL_MS = 20000;
const SILENCE_TIMEOUT_MS = 45000;
const RETRY_BASE_MS = 600;
const RETRY_MAX_MS = 10000;
const FULL_RETRY_MS = 15000;
const FULL_CLOSE_CODE = 4002;

export class PaintConnection {
  constructor({ url, buildHello, onMessage, onStatus }) {
    this.url = url;
    this.buildHello = buildHello;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.socket = null;
    this.retryCount = 0;
    this.retryTimer = 0;
    this.heartbeatTimer = 0;
    this.lastHeardAt = 0;
    this.isStopped = false;
    this.handleOnline = () => this.reconnectNow();
    this.handleVisibility = () => {
      if (document.visibilityState === "visible") this.reconnectNow();
    };
    addEventListener("online", this.handleOnline);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  get isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect() {
    clearTimeout(this.retryTimer);
    if (this.isStopped || this.socket) return;
    this.onStatus({ state: "connecting", attempt: this.retryCount });
    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.lastHeardAt = Date.now();
      socket.send(JSON.stringify(this.buildHello()));
      this.startHeartbeat();
    });
    socket.addEventListener("message", event => {
      this.lastHeardAt = Date.now();
      if (event.data === "pong") return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "ready") this.retryCount = 0;
      this.onMessage(message);
    });
    socket.addEventListener("close", event => this.handleClose(socket, event.code));
  }

  handleClose(socket, code) {
    if (this.socket !== socket) return;
    this.socket = null;
    clearInterval(this.heartbeatTimer);
    if (this.isStopped) return;
    if (code === FULL_CLOSE_CODE) {
      this.onStatus({ state: "full", retryInMs: FULL_RETRY_MS });
      this.retryTimer = setTimeout(() => this.connect(), FULL_RETRY_MS);
      return;
    }
    this.scheduleRetry();
  }

  scheduleRetry() {
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.retryCount) * (0.75 + Math.random() * 0.5);
    this.retryCount++;
    this.onStatus({ state: navigator.onLine === false ? "offline" : "retrying", retryInMs: delay });
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  reconnectNow() {
    if (this.isStopped || this.socket) return;
    this.connect();
  }

  startHeartbeat() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.isOpen) return;
      if (Date.now() - this.lastHeardAt > SILENCE_TIMEOUT_MS) {
        this.socket.close();
        this.handleClose(this.socket, 1006);
        return;
      }
      this.socket.send("ping");
    }, HEARTBEAT_INTERVAL_MS);
  }

  send(message) {
    if (!this.isOpen) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  stop() {
    this.isStopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.heartbeatTimer);
    removeEventListener("online", this.handleOnline);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.socket?.close(1000, "bye");
    this.socket = null;
  }
}
