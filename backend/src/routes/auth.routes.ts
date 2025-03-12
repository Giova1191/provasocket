import express from 'express';
import { body } from 'express-validator';
import { register, login, logout } from '../controllers/auth.controller';

const router = express.Router();

router.post(
    '/register',
    [
        body('email').isEmail(),
        body('password').isLength({ min: 6 }),
        body('username').isLength({ min: 3 }),
    ],
    register
);

router.post(
    '/login',
    [
        body('email').isEmail(),
        body('password').isLength({ min: 6 }),
    ],
    login
);

router.post('/logout', logout);

export default router;