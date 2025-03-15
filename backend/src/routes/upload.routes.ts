import express from 'express';
import multer from 'multer';
import { authMiddleware } from "../middleware/authMiddleware";
import { saveFile } from '../services/fileservice';
import { Request, Response } from 'express';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Endpoint per caricare un file
router.post('/', authMiddleware, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'Nessun file caricato' });
            return; // Ensure no value is returned
        }

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;

        const fileData = await saveFile(fileBuffer, fileName);
        
        res.status(200).json(fileData); // Ensure this does not return a value
    } catch (error) {
        console.error('Errore durante il caricamento del file:', error);
        res.status(500).json({ message: 'Errore durante il caricamento del file' });
    }
});

export default router;
