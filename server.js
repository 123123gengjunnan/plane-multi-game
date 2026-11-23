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
  phase: 'betting',   // betting 下注阶段 | flying 飞行 | crash 爆炸
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

// 经典Aviator概率
function getCrashPoint() {
  const houseEdge = 0.05;
  const r = Math.random();
  if (r < houseEdge) return 1.00;
  const point = 1 / (1 - r / (1 - houseEdge));
  return Math.min(point, 10000);
}

function startGameLoop() {
  gameState.phase = 'betting';
  gameState.multi = 1.00;
  io.emit('multi', 1.00);

  players.forEach(p=>{ p.bet = 0; p.cashed = null; });
  broadcastPlayerList();

  let betTime = 8; // ==========下注时长8秒，可以修改这个数字==========
  io.emit('betCountdown', betTime);

  const betTimer = setInterval(()=>{
    betTime--;
    io.emit('betCountdown', betTime);
    if(betTime <= 0){
      clearInterval(betTimer);
      // 下注结束，开始起飞
      gameState.phase = 'flying';
      gameState.crashPoint = getCrashPoint();
      console.log('本局爆炸点：', gameState.crashPoint.toFixed(2));
      io.emit('flying');

      const flyLoop = setInterval(() => {
        const add = gameState.multi * 0.022;
        gameState.multi += add;
        io.emit('multi', gameState.multi);

        if (gameState.multi >= gameState.crashPoint) {
          clearInterval(flyLoop);
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
  },1000);
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
    // 只有 betting阶段允许下注
    if(gameState.phase !== 'betting') return;
    amount = Math.floor(Number(amount));
    if(amount <= 0 || amount > p.balance) return;

    p.balance -= amount;
    p.bet = amount;
    p.cashed = null;

    // 912彩蛋
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
