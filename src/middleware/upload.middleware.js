import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// On Vercel / serverless environments, file system is read-only except for /tmp
const isServerless = Boolean(process.env.VERCEL);
export const uploadDir = isServerless
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(__dirname, '..', '..', 'uploads');

// Create upload directories if they don't exist
['audio', 'video', 'images', 'documents'].forEach((dir) => {
  const dirPath = path.join(uploadDir, dir);
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err) {
    console.warn(`⚠️ Could not create upload directory ${dirPath}:`, err.message);
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'documents';
    if (file.mimetype.startsWith('audio/')) subDir = 'audio';
    else if (file.mimetype.startsWith('video/')) subDir = 'video';
    else if (file.mimetype.startsWith('image/')) subDir = 'images';
    cb(null, path.join(uploadDir, subDir));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/mp4',
    'video/webm', 'video/mp4',
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`نوع الملف غير مسموح: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
  },
});

export const uploadAudio = upload.single('audio');
export const uploadVideo = upload.single('video');
export const uploadImage = upload.single('image');
export const uploadDocument = upload.single('document');
export const uploadReceipt = upload.single('receipt');
export const uploadResource = upload.single('resource');
export const uploadMultipleAudio = upload.array('recordings', 10);
export const uploadHomeworkFiles = upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'files', maxCount: 5 }
]);

export const getFileUrl = (req, filePath) => {
  if (!filePath) return null;
  const relativePath = filePath.replace(uploadDir, '').replace(/\\/g, '/');
  return `${req.protocol}://${req.get('host')}/uploads${relativePath}`;
};

export default upload;
