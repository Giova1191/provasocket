import express from 'express';
import { handleWebSocketConnection } from '../websocket/controllers/websocket.controllers';

const router = express.Router();

router.ws('/chat', (ws, req) => {
    const wss = (req as any).wss;
    handleWebSocketConnection(wss, ws, req);
});

export default router;