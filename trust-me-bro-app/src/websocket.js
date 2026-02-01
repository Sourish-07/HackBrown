export class GameWebSocket {
  constructor(url, onMessage) {
    this.url = url;
    this.onMessage = onMessage;
    this.ws = null;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('Connected to Backend');
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (this.onMessage) {
        this.onMessage(data);
      }
    };

    this.ws.onclose = () => {
      console.log('Disconnected');
    };
  }

  sendBet(betType) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'BET',
        payload: betType
      }));
    }
  }
}


