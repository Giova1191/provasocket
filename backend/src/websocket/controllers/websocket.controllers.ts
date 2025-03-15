import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import jwt from 'jsonwebtoken';
import { PrismaClient, User, Message } from '@prisma/client';
import * as path from 'path';
import * as mime from 'mime-types';
import * as fs from 'fs';

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
    fileName?: string;
    fileType?: string;
    fileSize?: number;
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
                    const { content, receiverId } = parsedMessage.data as ChatMessageData;

                    // Verifica se ci sono informazioni sul file
                    const fileData = {
                        fileUrl: parsedMessage.data.fileUrl || null,
                        fileSize: parsedMessage.data.fileSize || null,
                    };

                    console.log('Ricevuto messaggio con file:', fileData);

                    // Salva il messaggio nel database
                    const savedMessage: Message = await prisma.message.create({
                        data: {
                            content,
                            senderId: ws.userId!,
                            receiverId: receiverId || null,
                            fileUrl: fileData.fileUrl,
                            fileSize: fileData.fileSize,
                        },
                        include: {
                            sender: true,
                            receiver: true,
                        },
                    });

                    // Invia il messaggio al destinatario specifico
                    wss.clients.forEach((client) => {
                        const clientWs = client as ExtendedWebSocket;
                        if (clientWs.readyState === WebSocket.OPEN &&
                            (clientWs.userId === receiverId || clientWs.userId === ws.userId)) {
                            clientWs.send(JSON.stringify({
                                type: 'new_message',
                                data: savedMessage
                            }));
                        }
                    });
                } else if (parsedMessage.type === 'file_upload') {
                    // Gestione specifica per l'upload di file
                    console.log('Ricevuta richiesta di upload file');
                    // Qui puoi aggiungere logica specifica per i file
                }
            } catch (error) {
                console.error('Errore durante la gestione del messaggio:', error);
            }
        });
    } catch (error) {
        console.error('Errore durante la gestione della connessione WebSocket:', error);
    }
};
