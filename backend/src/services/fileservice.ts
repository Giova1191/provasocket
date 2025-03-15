import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Directory per salvare i file caricati
const UPLOAD_DIR = path.join(__dirname, '../../public/uploads');

// Assicurati che la directory esista
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const saveFile = async (
    fileBuffer: Buffer,
    fileName: string
): Promise<{ fileUrl: string; fileSize: number }> => {
    // Genera un nome file unico per evitare collisioni
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(fileName);
    const safeFileName = `${uniqueId}${extension}`;
    const filePath = path.join(UPLOAD_DIR, safeFileName);
    
    // Salva il file
    await fs.promises.writeFile(filePath, fileBuffer);
    
    // Calcola la dimensione del file
    const stats = await fs.promises.stat(filePath);
    
    // Restituisci l'URL relativo e la dimensione
    return {
        fileUrl: `/uploads/${safeFileName}`,
        fileSize: stats.size
    };
};