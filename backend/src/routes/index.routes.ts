import express from 'express';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';
import chatRoutes from './chat.routes';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/chat', chatRoutes);

export default router;