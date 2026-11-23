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
// 在线玩家表
const players = new Map();

function broadcastPlayerList(){
  const names = Array.from(players.values());
  io.emit('playerList', names);
}

function startGameLoop() {
  gameState.isRunning = false;
  gameState.multi = 1.00;
  io.emit('countdown', 3);

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
    players.set(socket.id, nick);
    broadcastPlayerList();
    console.log(nick, '进入房间');
  });

  socket.on('bet', (amount) => {
    const nick = players.get(socket.id);
    console.log(nick, '下注', amount);
  });

  socket.on('disconnect', () => {
    const nick = players.get(socket.id);
    players.delete(socket.id);
    broadcastPlayerList();
    console.log(nick, '离开房间');
  });
});

startGameLoop();
const PORT = 3000;
server.listen(PORT, () => {
  console.log('服务启动端口:' + PORT);
});
