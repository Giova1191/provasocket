import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const saltRounds = 10;

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ errors: errors.array() });
            return;
        }

        const { email, password, username } = req.body;

        const existingUser = await prisma.user.findFirst({
            where: { OR: [{ email }, { username }] },
        });

        if (existingUser) {
            res.status(409).json({ message: 'Email or username already exists' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const user = await prisma.user.create({
            data: { email, password: hashedPassword, username },
        });

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
        res.status(201).json({ token, user: { id: user.id, email: user.email, username: user.username } });
    } catch (error) {
        console.error('Errore durante la registrazione:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ errors: errors.array() });
            return;
        }

        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' })
        res.status(200).json({ token, user: { id: user.id, email: user.email, username: user.username } });
    } catch (error) {
        console.error('Errore durante il login:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const logout = (req: Request, res: Response): void => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            res.status(500).send('Could not log out.');
        } else {
            res.status(200).send('Logged out successfully.');
        }
    });
};