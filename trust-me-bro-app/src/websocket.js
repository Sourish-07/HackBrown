const resolveWsUrl = () => {
  const envUrl = import.meta?.env?.VITE_WS_URL;
  if (envUrl) return envUrl;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.hostname || 'localhost';
  const port = import.meta?.env?.VITE_BACKEND_PORT || '3000';
  return `${protocol}://${host}:${port}`;
};

export class GameWebSocket {
  constructor(url, onMessage) {
    this.url = url || resolveWsUrl();
    this.onMessage = onMessage;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
  }

  connect() {
    try {
      console.log(`[WebSocket] Attempting to connect to ${this.url}...`);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket] ✓ Connected to Backend');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (this.onMessage) {
            this.onMessage(data);
          }
        } catch (e) {
          console.error('[WebSocket] Error parsing message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] ✗ Connection error:', error);
      };

      this.ws.onclose = (event) => {
        console.log('[WebSocket] ✗ Disconnected', { code: event.code, reason: event.reason });
        this.attemptReconnect();
      };
    } catch (e) {
      console.error('[WebSocket] Failed to create WebSocket:', e);
      this.attemptReconnect();
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('[WebSocket] Max reconnection attempts reached. Give up.');
    }
  }

  sendMessage(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn('[WebSocket] Cannot send message: WebSocket not ready', { state: this.ws?.readyState });
    }
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}


