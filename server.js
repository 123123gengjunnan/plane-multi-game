const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(__dirname));

// 游戏数据
let gameState = {
  phase: "betting",
  multiplier: 1,
  countdown: 20,
  players: {}
};

io.on('connection', (socket) => {
  console.log('玩家连接', socket.id);

  socket.on("join", (name) => {
    gameState.players[socket.id] = {
      name: name,
      bet: 0,
      cashout: null,
      balance: 1000
    };
    io.emit("state", gameState);
  });

  socket.on("bet", (num) => {
    if(gameState.players[socket.id]){
      gameState.players[socket.id].bet = num;
      io.emit("state", gameState);
    }
  })

  socket.on("cashout", () => {
    const p = gameState.players[socket.id];
    if(p && p.bet>0 && gameState.phase === "flying"){
      p.cashout = gameState.multiplier;
      p.balance += Math.floor(p.bet * gameState.multiplier);
      p.bet = 0;
      io.emit("state", gameState);
    }
  })

  socket.on('disconnect', () => {
    delete gameState.players[socket.id];
    io.emit("state", gameState);
    console.log('玩家离开', socket.id);
  });
});

// 游戏循环
function gameLoop(){
  setInterval(()=>{
    if(gameState.phase === "betting"){
      gameState.countdown -= 0.1;
      if(gameState.countdown <= 0){
        gameState.phase = "flying";
        gameState.multiplier = 1;
      }
    }else if(gameState.phase === "flying"){
      gameState.multiplier += 0.03;
      // 随机爆炸
      if(Math.random() < 0.008){
        gameState.phase = "boom";
        setTimeout(()=>{
          // 重置
          gameState = {
            phase:"betting",
            multiplier:1,
            countdown:20,
            players:gameState.players
          }
          for(let k in gameState.players){
            gameState.players[k].bet = 0;
            gameState.players[k].cashout = null;
          }
        },1500)
      }
    }
    io.emit("state",gameState)
  },100)
}
gameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务启动端口:${PORT}`);
});
