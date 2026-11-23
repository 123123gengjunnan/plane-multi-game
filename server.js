const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

let gameState = {
  phase: 'betting',   // betting | flying | crash
  multi: 1.00,
  crashPoint: 0
};

// 玩家：{ name, bet, cashed, balance }
const players = new Map();
// 历史坠机倍率，保留最近 15 条
let history = [];

function broadcastPlayerList(){
  const list = Array.from(players.values()).map(p=>({
    name: p.name, bet: p.bet, cashed: p.cashed
  }));
  io.emit('playerList', list);
}
function broadcastHistory(){
  io.emit('history', history);
}

function startGameLoop() {
  gameState.phase = 'betting';
  gameState.multi = 1.00;

  players.forEach(p=>{ p.bet = 0; p.cashed = null; });
  broadcastPlayerList();
  io.emit('countdown', 3);

  let cd = 3;
  const cdTimer = setInterval(() => {
    cd--;
    if (cd > 0) {
      io.emit('countdown', cd);
    } else {
      clearInterval(cdTimer);
      gameState.phase = 'flying';
      gameState.crashPoint = 1 + Math.random() * 100000;
      console.log('本局爆炸点：', gameState.crashPoint.toFixed(2));
      io.emit('flying');

      const loop = setInterval(() => {
        gameState.multi += 0.015;
        io.emit('multi', gameState.multi);

        if (gameState.multi >= gameState.crashPoint) {
          clearInterval(loop);
          gameState.phase = 'crash';

          // 记录历史倍率
          history.unshift(Number(gameState.crashPoint.toFixed(2)));
          if (history.length > 15) history.pop();
          broadcastHistory();

          // 未提现的玩家输掉下注
          players.forEach(p=>{ p.bet = 0; p.cashed = null; });
          broadcastPlayerList();

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
    players.set(socket.id, { name: nick, bet: 0, cashed: null, balance: 100 });
    socket.emit('balance', 100);
    broadcastPlayerList();
    broadcastHistory();
    console.log(nick, '进入房间');
  });

  socket.on('bet', (amount) => {
    const p = players.get(socket.id);
    if(!p) return;
    if(gameState.phase !== 'betting') return;
    amount = Math.floor(Number(amount));
    if(amount <= 0 || amount > p.balance) return;
    p.balance -= amount;
    p.bet = amount;
    p.cashed = null;
    socket.emit('balance', p.balance);
    broadcastPlayerList();
  });

  socket.on('cashout', () => {
    const p = players.get(socket.id);
    if(!p) return;
    if(gameState.phase !== 'flying' || p.bet <= 0 || p.cashed) return;
    p.cashed = Number(gameState.multi.toFixed(2));
    p.balance += Math.floor(p.bet * gameState.multi);
    p.bet = 0;
    socket.emit('balance', p.balance);
    broadcastPlayerList();
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
