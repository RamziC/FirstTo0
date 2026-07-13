const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Adjusted configuration to allow seamless handshaking on cloud platforms like Render
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['polling', 'websocket'], // Restored polling fallback so Render can establish the initial handshake
    allowEIO3: false,
    pingTimeout: 2000,
    pingInterval: 1000,
    perMessageDeflate: false 
});

app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
    health: 2000, 
    maxHealth: 2000,
    isGameOver: false,
    winnerId: null,
    usedHeavyAttack: {}
};

function updateMaxHealth() {
    const playerCount = Math.max(1, io.engine.clientsCount);
    const newMaxHealth = playerCount * 2000;
    
    if (!gameState.isGameOver) {
        const damageTaken = gameState.maxHealth - gameState.health;
        gameState.maxHealth = newMaxHealth;
        gameState.health = Math.max(1, newMaxHealth - damageTaken);
    } else {
        gameState.maxHealth = newMaxHealth;
    }
}

function resetGame() {
    const playerCount = Math.max(1, io.engine.clientsCount);
    gameState.maxHealth = playerCount * 2000;
    gameState.health = gameState.maxHealth;
    gameState.isGameOver = false;
    gameState.winnerId = null;
    
    Object.keys(gameState.usedHeavyAttack).forEach(id => {
        gameState.usedHeavyAttack[id] = false;
    });

    broadcastState();
    io.emit('resetClientButtons');
}

function broadcastState() {
    io.emit('stateUpdate', { 
        health: gameState.health, 
        maxHealth: gameState.maxHealth,
        gameOver: gameState.isGameOver,
        winnerId: gameState.winnerId
    });
}

io.on('connection', (socket) => {
    gameState.usedHeavyAttack[socket.id] = false;
    
    updateMaxHealth();
    broadcastState();

    socket.on('attack', (type) => {
        if (gameState.isGameOver) return;

        if (type === 'light') {
            gameState.health = Math.max(0, gameState.health - 100);
        } 
        else if (type === 'ability') {
            gameState.health = Math.max(0, gameState.health - 300);
        }
        else if (type === 'heavy') {
            if (gameState.usedHeavyAttack[socket.id]) return;
            
            gameState.usedHeavyAttack[socket.id] = true;
            gameState.health = Math.max(0, gameState.health - 1400);
            socket.emit('heavyAttackSpent');
        }

        if (gameState.health === 0 && !gameState.isGameOver) {
            gameState.isGameOver = true;
            gameState.winnerId = socket.id;
        }

        broadcastState();
    });

    socket.on('requestReset', () => {
        resetGame();
    });

    socket.on('disconnect', () => {
        delete gameState.usedHeavyAttack[socket.id];
        updateMaxHealth();
        broadcastState();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
