import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { Server as WebSocketServer } from 'ws';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { upload } from './middleware/uploadMiddleware';

// Carica le variabili d'ambiente
dotenv.config();

// Estendi l'interfaccia Request per includere l'utente
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
      };
    }
  }
}

// Estendi l'interfaccia WebSocket per includere proprietà aggiuntive
interface ExtendedWebSocket extends WebSocket {
  // Rimossa la proprietà url che causava l'errore
  userId?: number;
  username?: string;
}

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

// Middleware per parsare JSON
app.use(express.json());

// Middleware di autenticazione
function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return void res.status(401).json({ message: 'Unauthorized: Missing token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: number };
    req.user = { id: decoded.userId }; // Aggiungi l'ID dell'utente alla richiesta
    next(); // Passa al prossimo middleware/route handler
  } catch (error) {
    return void res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
}

// Endpoint per il login
app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return void res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
    return void res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Errore durante il login:', error);
    return void res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Endpoint per la registrazione
app.post('/api/auth/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password, username } = req.body;

  try {
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existingUser) {
      return void res.status(409).json({ message: 'Email or username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, username },
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
    return void res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Errore durante la registrazione:', error);
    return void res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Endpoint per recuperare i messaggi precedenti
app.get('/api/messages', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { recipientId } = req.query;
  const userId = req.user?.id;

  if (!userId) {
    return void res.status(400).json({ message: 'Missing userId' });
  }

  try {
    let messages;
    if (recipientId) {
      // Messaggi privati tra due utenti
      messages = await prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId, receiverId: Number(recipientId) },
            { senderId: Number(recipientId), receiverId: userId },
          ],
        },
        include: {
          sender: true,
          receiver: true,
        },
        orderBy: { createdAt: 'asc' },
      });
    } else {
      // Messaggi globali (chat pubblica)
      messages = await prisma.message.findMany({
        where: {
          receiverId: null,
        },
        include: {
          sender: true,
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    return void res.json(messages);
  } catch (error) {
    console.error('Errore durante il recupero dei messaggi:', error);
    return void res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Endpoint per ottenere la lista degli utenti online
app.get('/api/users/online', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
      },
    });
    return void res.json(users);
  } catch (error) {
    console.error('Errore durante il recupero degli utenti online:', error);
    return void res.status(500).json({ message: 'Internal Server Error' });
  }
});

try {
  // Percorsi dei certificati
  const keyPath = path.join(__dirname, '../certificati/domain.key');
  const certPath = path.join(__dirname, '../certificati/domain.crt');
  console.log('Percorso della chiave:', keyPath);
  console.log('Percorso del certificato:', certPath);

  // Crea server HTTPS
  const server = https.createServer(
    {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8'),
      passphrase: 'elia',
    },
    app
  );

  
  app.post('/api/upload', upload.single('file'), (req: Request, res: Response): void => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }
      const fileUrl = `/uploads/${req.file.filename}`; // URL relativo del file
      res.json({ fileUrl });
    } catch (error) {
      console.error('Errore durante il caricamento del file:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });

  // Crea server WebSocket
  const wss = new WebSocketServer({ server });

  // Mappa per tenere traccia degli utenti online
  const onlineUsers = new Map<number, { userId: number; username: string }>();

  // Funzione per inviare la lista degli utenti online a tutti i client
  const sendOnlineUsers = () => {
    const onlineUsersList = Array.from(onlineUsers.values());
    console.log('Invio lista utenti online:', onlineUsersList);
    wss.clients.forEach((client) => {
      const clientWs = client as ExtendedWebSocket;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'online_users', data: onlineUsersList }));
      }
    });
  };

  // Gestisci connessioni WebSocket
  wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
    console.log('New WebSocket connection attempt');
    const extWs = ws as ExtendedWebSocket;

    try {
      // Estrai il token dall'URL
      const url = req.url ? new URL(req.url, `https://${req.headers.host}`) : null;
      const token = url?.searchParams.get('token');

      if (!token) {
        console.log('Connessione rifiutata: token mancante');
        ws.close(4001, 'Unauthorized: Missing token');
        return;
      }

      let userId: number;
      let username: string;
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: number };
        userId = decoded.userId;
        
        // Ottieni le informazioni dell'utente dal database
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true },
        });

        if (!user) {
          console.log('Utente non trovato:', userId);
          ws.close(4001, 'User not found');
          return;
        }

        username = user.username;
        extWs.userId = userId;
        extWs.username = username;
        
        // RIMOZIONE RIGA PROBLEMATICA
        // extWs.url = req.url || '';

        // Aggiungi l'utente alla mappa degli utenti online
        onlineUsers.set(userId, { userId, username });
        console.log(`Utente connesso: ${username} (${userId})`);
        console.log('Utenti online:', Array.from(onlineUsers.values()));
        
      } catch (error) {
        console.log('Token non valido:', error);
        ws.close(4001, 'Unauthorized: Invalid token');
        return;
      }

      // Invia immediatamente la lista degli utenti online a questo client
      if (extWs.readyState === WebSocket.OPEN) {
        const onlineUsersList = Array.from(onlineUsers.values());
        extWs.send(JSON.stringify({ type: 'online_users', data: onlineUsersList }));
        console.log('Lista utenti online inviata al nuovo client:', onlineUsersList);
      }
      
      // Invia la notifica a tutti gli altri client che un nuovo utente è online
      wss.clients.forEach((client) => {
        const clientWs = client as ExtendedWebSocket;
        if (clientWs !== extWs && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'user_online',
              data: {
                userId: userId,
                username: username,
              },
            })
          );
        }
      });
      
      // Invia i messaggi globali precedenti
      const messages = await prisma.message.findMany({
        where: {
          receiverId: null,
        },
        include: {
          sender: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (extWs.readyState === WebSocket.OPEN) {
        extWs.send(JSON.stringify({ type: 'messages', data: messages }));
        console.log(`Inviati ${messages.length} messaggi globali al client`);
      }

      // Gestisci i messaggi ricevuti
      extWs.on('message', async (message) => {
        try {
          const parsedMessage = JSON.parse(message.toString());
          console.log('Messaggio ricevuto:', parsedMessage);

          if (parsedMessage.type === 'chat_message') {
            const { content, receiverId } = parsedMessage;

            // Salva il messaggio nel database
            const savedMessage = await prisma.message.create({
              data: {
                content,
                senderId: userId,
                receiverId: receiverId || null,
              },
              include: {
                sender: true,
                receiver: true,
              },
            });

            console.log('Messaggio salvato:', savedMessage);

            // Invia il messaggio a tutti i client se è un messaggio globale
            if (receiverId === null) {
              console.log('Invio messaggio globale a tutti i client');
              wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ type: 'new_message', data: savedMessage }));
                }
              });
            } else {
              // Invia il messaggio al mittente per conferma
              if (extWs.readyState === WebSocket.OPEN) {
                extWs.send(JSON.stringify({ type: 'new_message', data: savedMessage }));
              }

              // Invia il messaggio al destinatario specifico
              let destinatarioTrovato = false;
              wss.clients.forEach((client) => {
                const clientWs = client as ExtendedWebSocket;
                if (clientWs.readyState === WebSocket.OPEN && clientWs !== extWs && clientWs.userId === receiverId) {
                  clientWs.send(JSON.stringify({ type: 'new_message', data: savedMessage }));
                  destinatarioTrovato = true;
                }
              });
              console.log(`Destinatario ${receiverId} ${destinatarioTrovato ? 'trovato' : 'non trovato'}`);
            }
          }
        } catch (error) {
          console.error('Errore durante la gestione del messaggio:', error);
        }
      });

      // Gestisci la disconnessione
      extWs.on('close', () => {
        console.log(`Utente disconnesso: ${username} (${userId})`);
        
        // Rimuovi l'utente dalla mappa degli utenti online
        onlineUsers.delete(userId);
        
        // Invia la lista aggiornata degli utenti online a tutti i client
        sendOnlineUsers();

        // Notifica agli altri utenti che questo utente è offline
        wss.clients.forEach((client) => {
          const clientWs = client as ExtendedWebSocket;
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: 'user_offline',
                data: {
                  userId: userId,
                },
              })
            );
          }
        });
      });
    } catch (error) {
      console.error('Errore durante la gestione della connessione WebSocket:', error);
      ws.close(1011, 'Errore interno del server');
    }
  });

  // Middleware per servire file statici
  app.use(express.static(path.join(__dirname, '../public')));

  // Avvia il server HTTPS
  server.listen(port, () => {
    console.log(`Server in ascolto su https://localhost:${port}`);
  });
} catch (error) {
  console.error('Errore durante l\'avvio del server:', error);
}