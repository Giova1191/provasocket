import { WebSocketServer } from 'ws';
import { Request } from 'express';

declare module 'express' {
  interface Request {
    wss?: WebSocketServer; // Definisci la proprietà personalizzata `wss`
  }
}