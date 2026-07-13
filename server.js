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

// Game State Object
let gameState = {
    health: 0,
    maxHealth: 0,
    isGameOver: false,
    usedHeavyAttack: {} // socket.id -> true/false
};

// Calculates scaling health pool based on active connection footprint
function updateMaxHealth() {
    const playerCount = io.engine.clientsCount;
    // Fallback to 1 player minimum so maxHealth is never 0 if check runs during transition
    const calculatedMax = Math.max(1, playerCount) * 1500; 
    
    gameState.maxHealth = calculatedMax;

    // If the game hasn't ended yet, cap or scale current health cleanly to prevent overflows
    if (!gameState.isGameOver) {
        gameState.health = Math.min(gameState.health || calculatedMax, calculatedMax);
    }
}

function resetGame() {
    const playerCount = io.engine.clientsCount;
    gameState.maxHealth = Math.max(1, playerCount) * 1500;
    gameState.health = gameState.maxHealth;
    gameState.isGameOver = false;
    
    // Clear spent statuses
    Object.keys(gameState.usedHeavyAttack).forEach(id => {
        gameState.usedHeavyAttack[id] = false;
    });

    broadcastState();
    io.emit('resetClientButtons');
    console.log(`Game reset. Dynamic Pool: ${gameState.health} HP (${playerCount} players).`);
}

function broadcastState() {
    io.emit('stateUpdate', { 
        health: gameState.health, 
        maxHealth: gameState.maxHealth,
        gameOver: gameState.isGameOver 
    });
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    gameState.usedHeavyAttack[socket.id] = false;
    
    // Recalculate health envelope for incoming player adjustments
    updateMaxHealth();
    
    // If it's a completely fresh start or a dead room, bring health to full max
    if (gameState.health === 0 && !gameState.isGameOver) {
        gameState.health = gameState.maxHealth;
    }

    // Broadcast setup instantly to everyone so they see the bar size adjust
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

        if (gameState.health === 0) {
            gameState.isGameOver = true;
        }

        broadcastState();
    });

    socket.on('requestReset', () => {
        resetGame();
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete gameState.usedHeavyAttack[socket.id];
        
        // Downscale pool limits when someone bails out mid-game
        updateMaxHealth();
        broadcastState();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));