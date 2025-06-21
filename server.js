const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Store connected users
const connectedUsers = new Map();
const rooms = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user joining
  socket.on('join', (data) => {
    const { username, roomId } = data;
    
    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    
    // Add user to room
    rooms.get(roomId).add(socket.id);
    connectedUsers.set(socket.id, { username, roomId });
    
    socket.join(roomId);
    
    // Notify others in the room
    socket.to(roomId).emit('userJoined', { 
      userId: socket.id, 
      username 
    });
    
    // Send current users in room to the new user
    const usersInRoom = Array.from(rooms.get(roomId))
      .filter(id => id !== socket.id)
      .map(id => ({
        userId: id,
        username: connectedUsers.get(id)?.username
      }));
    
    socket.emit('roomUsers', usersInRoom);
    
    console.log(`${username} joined room ${roomId}`);
  });

  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
  });

  socket.on('iceCandidate', (data) => {
    socket.to(data.target).emit('iceCandidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // Handle user leaving
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      const { roomId } = user;
      
      // Remove user from room
      if (rooms.has(roomId)) {
        rooms.get(roomId).delete(socket.id);
        
        // Remove room if empty
        if (rooms.get(roomId).size === 0) {
          rooms.delete(roomId);
        }
      }
      
      // Notify others
      socket.to(roomId).emit('userLeft', { userId: socket.id });
      
      // Remove user from connected users
      connectedUsers.delete(socket.id);
      
      console.log(`User ${user.username} left room ${roomId}`);
    }
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.keys()).map(roomId => ({
    id: roomId,
    userCount: rooms.get(roomId).size
  }));
  res.json(roomList);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the voice chat`);
}); 