import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import jwt from 'jsonwebtoken';
import { PrismaClient, User, Message } from '@prisma/client';

const prisma = new PrismaClient();

// Interfaccia per i messaggi WebSocket
interface WebSocketMessage {
    type: string;
    data: any;
}

// Interfaccia per i messaggi di chat
interface ChatMessageData {
    content: string;
    receiverId?: number;
    fileUrl?: string;
}

// Interfaccia per ExtendedWebSocket
interface ExtendedWebSocket extends WebSocket {
    userId?: number;
}

export const handleWebSocketConnection = async (
    wss: WebSocketServer,
    ws: ExtendedWebSocket,
    req: http.IncomingMessage
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            ws.close(4001, 'Unauthorized: Missing or invalid token');
            return;
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            ws.close(4001, 'Unauthorized: Missing token');
            return;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: number };
        ws.userId = decoded.userId;

        // Invia la lista degli utenti online
        const users = await prisma.user.findMany();
        ws.send(JSON.stringify({ type: 'online_users', data: users }));

        // Notifica agli altri utenti che questo utente è online
        wss.clients.forEach((client) => {
            const clientWs = client as ExtendedWebSocket;
            if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN && clientWs.userId) {
                clientWs.send(JSON.stringify({ type: 'user_online', data: { userId: ws.userId } }));
            }
        });

        // Gestisci i messaggi ricevuti
        ws.on('message', async (message) => {
            try {
                const parsedMessage: WebSocketMessage = JSON.parse(message.toString());

                if (parsedMessage.type === 'chat_message') {
                    const { content, receiverId, fileUrl } = parsedMessage.data as ChatMessageData;

                    // Salva il messaggio nel database
                    const savedMessage: Message = await prisma.message.create({
                        data: {
                            content,
                            senderId: ws.userId!,
                            receiverId: receiverId || null,
                            fileUrl: fileUrl || null,
                        },
                        include: {
                            sender: true,
                            receiver: true,
                        },
                    });

                    // Invia il messaggio al destinatario specifico
                    wss.clients.forEach((client) => {
                        const clientWs = client as ExtendedWebSocket;
                        if (clientWs.readyState === WebSocket.OPEN && clientWs.userId === receiverId) {
                            clientWs.send(JSON.stringify({ type: 'new_message', data: savedMessage }));
                        }
                    });
                }
            } catch (error) {
                console.error('Errore durante la gestione del messaggio:', error);
            }
        });

        // Notifica agli altri utenti che questo utente è offline
        ws.on('close', () => {
            wss.clients.forEach((client) => {
                const clientWs = client as ExtendedWebSocket;
                if (clientWs.readyState === WebSocket.OPEN && clientWs.userId) {
                    clientWs.send(JSON.stringify({ type: 'user_offline', data: { userId: ws.userId } }));
                }
            });
        });
    } catch (error) {
        console.error('Errore durante la connessione WebSocket:', error);
        ws.close(500, 'Internal server error');
    }
};