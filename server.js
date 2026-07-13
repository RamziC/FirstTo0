const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
    health: 0,
    maxHealth: 0,
    isGameOver: false,
    winnerId: null, // Tracks the socket.id of the winner
    usedHeavyAttack: {}
};

function updateMaxHealth() {
    const playerCount = io.engine.clientsCount;
    const calculatedMax = Math.max(1, playerCount) * 1500; 
    gameState.maxHealth = calculatedMax;

    if (!gameState.isGameOver) {
        gameState.health = Math.min(gameState.health || calculatedMax, calculatedMax);
    }
}

function resetGame() {
    const playerCount = io.engine.clientsCount;
    gameState.maxHealth = Math.max(1, playerCount) * 1500;
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
        winnerId: gameState.winnerId // Send winner details out to all clients
    });
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    gameState.usedHeavyAttack[socket.id] = false;
    
    updateMaxHealth();
    
    if (gameState.health === 0 && !gameState.isGameOver) {
        gameState.health = gameState.maxHealth;
    }

    broadcastState();

    socket.on('attack', (type) => {
        if (gameState.isGameOver) return;

        if (type === 'light') {
            gameState.health = Math.max(0, gameState.health - 100);
        } 
        else if (type === 'heavy') {
            if (gameState.usedHeavyAttack[socket.id]) return;
            
            gameState.usedHeavyAttack[socket.id] = true;
            gameState.health = Math.max(0, gameState.health - 1400);
            socket.emit('heavyAttackSpent');
        }

        // Check if this specific hit ended the game
        if (gameState.health === 0 && !gameState.isGameOver) {
            gameState.isGameOver = true;
            gameState.winnerId = socket.id; // Mark this connection as the champion
        }

        broadcastState();
    });

    socket.on('requestReset', () => {
        resetGame();
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete gameState.usedHeavyAttack[socket.id];
        updateMaxHealth();
        broadcastState();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
