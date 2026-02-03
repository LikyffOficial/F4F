const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Estado do servidor
const players = {};

io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    // 1. Sistema de Skins: Sorteia 1 a 3
    const assignedSkin = Math.floor(Math.random() * 3) + 1;
    
    // Cria o objeto do jogador
    players[socket.id] = {
        x: 0,
        y: 0, 
        z: 0,
        rotation: 0,
        skin: assignedSkin // Salva a skin na sessão
    };

    // Envia para o jogador atual quem já está no jogo
    socket.emit('currentPlayers', players);

    // Avisa os outros que alguém entrou (envia a skin junto)
    socket.broadcast.emit('newPlayer', { 
        id: socket.id, 
        player: players[socket.id] 
    });

    // Sincronização de Movimento
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].rotation = movementData.rotation;
            
            // Otimização: Emitir apenas dados essenciais
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: players[socket.id].x,
                y: players[socket.id].y,
                z: players[socket.id].z,
                rotation: players[socket.id].rotation,
                skin: players[socket.id].skin // Redundância de segurança
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Jogador saiu:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
