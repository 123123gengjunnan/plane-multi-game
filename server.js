const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});
app.use(express.static(__dirname));

const game = {
    phase: "betting",
    countdown: 10,
    mult: 1.00,
    crashAt: 1.00,
    history: [],
    timer: null
};
let players = {};

function genCrash(){
    const r = Math.random();
    if(r < 0.04) return 1.00;
    const c = 0.96/(1-r);
    return Math.min(9999, Number(c.toFixed(2)));
}

function broadcastGameState(){
    io.emit("gameState",{
        phase:game.phase,
        countdown:game.countdown,
        mult:game.mult,
        crashAt:game.crashAt,
        history:game.history
    })
    io.emit("playerList", players);
}

function startBettingPhase(){
    game.phase = "betting";
    game.countdown = 10;
    game.mult = 1.00;
    for(let pid in players){
        players[pid].lockedBet = 0;
        players[pid].cashedOut = false;
    }
    clearInterval(game.timer);
    game.timer = setInterval(()=>{
        game.countdown -= 0.1;
        if(game.countdown <= 0){
            clearInterval(game.timer);
            startFlyPhase();
        }
        broadcastGameState();
    },100);
    broadcastGameState();
}

function startFlyPhase(){
    game.phase = "flying";
    game.crashAt = genCrash();
    game.mult = 1.00;
    clearInterval(game.timer);
    game.timer = setInterval(()=>{
        game.mult = Number(Math.min(9999, Math.pow(Math.E,0.16 * (Date.now()/1000))).toFixed(2));
        if(game.mult >= game.crashAt){
            clearInterval(game.timer);
            crashPhase();
        }
        broadcastGameState();
    }, 100);
    broadcastGameState();
}

function crashPhase(){
    game.phase = "crashed";
    game.history.unshift(game.crashAt);
    if(game.history.length>20) game.history.pop();
    for(let pid in players){
        const p = players[pid];
        if(p.lockedBet>0 && !p.cashedOut){
        }
    }
    broadcastGameState();
    setTimeout(()=>{
        startBettingPhase();
    },2600);
}

io.on('connection', (socket)=>{
    console.log("玩家连接",socket.id);
    socket.on("setNick", (nickname)=>{
        players[socket.id] = {
            nick: nickname || `游客${socket.id.slice(0,4)}`,
            fuel:100,
            bet:10,
            lockedBet:0,
            cashedOut:false
        }
        broadcastGameState();
    })
    socket.on("setBetAmt", (val)=>{
        if(!players[socket.id]) return;
        players[socket.id].bet = Math.max(5, Number(val));
        broadcastGameState();
    })
    socket.on("placeBet", ()=>{
        const p = players[socket.id];
        if(!p) return;
        if(game.phase !== "betting") return;
        if(p.bet > p.fuel) return;
        p.lockedBet = p.bet;
        p.fuel -= p.bet;
        broadcastGameState();
    })
    socket.on("skipBet", ()=>{
        const p = players[socket.id];
        if(!p) return;
        p.lockedBet = 0;
        broadcastGameState();
    })
    socket.on("cashout", ()=>{
        const p = players[socket.id];
        if(!p) return;
        if(game.phase!=="flying") return;
        if(p.lockedBet <=0 || p.cashedOut) return;
        p.cashedOut = true;
        const gain = Math.round(p.lockedBet * game.mult);
        p.fuel += gain;
        broadcastGameState();
    })
    socket.on("disconnect",()=>{
        delete players[socket.id];
        broadcastGameState();
    })
    broadcastGameState();
})

startBettingPhase();
const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>{
    console.log(`服务启动端口:${PORT}`)
})
