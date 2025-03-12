import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';

interface AuthenticatedWebSocket extends WebSocket {
    userId?: number;
}

export const websocketAuthMiddleware = (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    try {
        console.log('WebSocket connection attempt');
        console.log('URL:', req.url);
        console.log('Headers:', req.headers);

        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const urlToken = url.searchParams.get('token');
        const headerToken = req.headers.authorization?.split(' ')[1];
        const token = urlToken || headerToken;

        console.log('URL Token:', urlToken);
        console.log('Header Token:', headerToken);

        if (!token) {
            console.log('No token found in URL or headers');
            ws.close(1008, 'Authentication failed: No token provided');
            return;
        }

        try {
            const decodedToken = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: number };
            console.log('Token verified successfully');
            console.log('Decoded token:', decodedToken);
            ws.userId = decodedToken.userId;
        } catch (error) {
            console.error('Token verification error:', error);
            ws.close(1008, 'Authentication failed: Invalid token');
        }
    } catch (error) {
        console.error('WebSocket middleware error:', error);
        ws.close(1011, 'Internal server error');
    }
};