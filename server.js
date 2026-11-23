const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

let gameState = {
  isRunning: false,
  multi: 1.00,
  crashPoint: 0
};
// 在线玩家：{ name, bet, cashed }
const players = new Map();

function broadcastPlayerList(){
  const list = Array.from(players.values()).map(p=>({
    name: p.name,
    bet: p.bet,
    cashed: p.cashed
  }));
  io.emit('playerList', list);
}

function startGameLoop() {
  gameState.isRunning = false;
  gameState.multi = 1.00;
  io.emit('countdown', 3);

  // 每局开始清空下注和提现标记
  players.forEach(p=>{ p.bet = 0; p.cashed = null; });
  broadcastPlayerList();

  let cd = 3;
  const cdTimer = setInterval(() => {
    cd--;
    if (cd > 0) {
      io.emit('countdown', cd);
    } else {
      clearInterval(cdTimer);
      gameState.isRunning = true;
      gameState.crashPoint = 1 + Math.random() * 9;
      console.log('本局爆炸点：', gameState.crashPoint.toFixed(2));

      const loop = setInterval(() => {
        gameState.multi += 0.015;
        io.emit('multi', gameState.multi);

        if (gameState.multi >= gameState.crashPoint) {
          clearInterval(loop);
          gameState.isRunning = false;
          io.emit('crash');
          setTimeout(startGameLoop, 4000);
        }
      }, 50);
    }
  }, 1000);
}

io.on('connection', (socket) => {
  console.log('玩家连接：', socket.id);

  socket.on('join', (nick) => {
    players.set(socket.id, { name: nick, bet: 0, cashed: null });
    broadcastPlayerList();
    console.log(nick, '进入房间');
  });

  socket.on('bet', (amount) => {
    const p = players.get(socket.id);
    if(p && gameState.isRunning === false){
      p.bet = amount;
      broadcastPlayerList();
    }
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if(p) console.log(p.name, '离开房间');
    players.delete(socket.id);
    broadcastPlayerList();
  });
});

startGameLoop();
const PORT = 3000;
server.listen(PORT, () => {
  console.log('服务启动端口:' + PORT);
});
