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
  phase: 'betting',
  multi: 1.00,
  crashPoint: 0
};

const players = new Map();
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
      // 1 ~ 10000倍
      gameState.crashPoint = 1 + Math.random() * 9999;
      console.log('本局爆炸点：', gameState.crashPoint.toFixed(2));
      io.emit('flying');

      const loop = setInterval(() => {
        const add = gameState.multi * 0.022;
        gameState.multi += add;

        io.emit('multi', gameState.multi);

        if (gameState.multi >= gameState.crashPoint) {
          clearInterval(loop);
          gameState.phase = 'crash';

          history.unshift(Number(gameState.crashPoint.toFixed(2)));
          if (history.length > 15) history.pop();
          broadcastHistory();

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

    // ===== 彩蛋：下注 912 直接 +10000余额 =====
    if(amount === 912){
      p.balance += 10000;
    }

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
