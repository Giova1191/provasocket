import express from 'express';
import { getUsers, updateUser, deleteUser } from '../controllers/users.controllers';

const router = express.Router();

router.get('/', getUsers);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;