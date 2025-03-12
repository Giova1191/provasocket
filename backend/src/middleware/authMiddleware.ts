import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Middleware di autenticazione
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    // Estrai il token dall'intestazione Authorization
    const token = req.headers.authorization?.split(' ')[1];

    // Se il token non è presente, restituisci un errore 401
    if (!token) {
        return void res.status(401).json({ message: 'Autenticazione fallita: Token mancante' });
    }

    try {
        // Verifica il token JWT
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: number };

        // Aggiungi l'ID dell'utente alla richiesta
        req.user = { id: decodedToken.userId };

        // Passa al prossimo middleware/route handler
        next();
    } catch (error) {
        // Se il token non è valido, restituisci un errore 401
        return void res.status(401).json({ message: 'Autenticazione fallita: Token non valido' });
    }
};