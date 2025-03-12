import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// Configura multer per salvare i file in una cartella specifica
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads')); // Cartella dove salvare i file
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Crea la cartella uploads se non esiste
import * as fs from 'fs';
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

export { upload };