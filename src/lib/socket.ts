import { io } from 'socket.io-client';

// Connects to the same origin — Vite proxies /socket.io → localhost:3001
export const socket = io();
