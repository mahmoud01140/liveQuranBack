import dotenv from 'dotenv';
dotenv.config();

import './utils/logger.js'; // silences console.log in production

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';
import { initSocket } from './config/socket.js';
import { protect } from './middleware/auth.middleware.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import groupRoutes from './routes/group.routes.js';
import examRoutes from './routes/exam.routes.js';
import liveRoutes from './routes/live.routes.js';
import curriculumRoutes from './routes/curriculum.routes.js';
import studyPlanRoutes from './routes/studyPlan.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import recordingRoutes from './routes/recording.routes.js';
import discussionRoutes from './routes/discussion.routes.js';
import dailyRecordRoutes from './routes/dailyRecord.routes.js';
import sessionFeedbackRoutes from './routes/sessionFeedback.routes.js';
import resourceRoutes from './routes/resource.routes.js';
import studentRecitationRoutes from './routes/studentRecitation.routes.js';
import parentRoutes from './routes/parent.routes.js';
import calendarRoutes from './routes/calendar.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import dailyTaskRoutes from './routes/dailyTask.routes.js';
import ijazahRoutes from './routes/ijazah.routes.js';


// Parse allowed origins (supports comma-separated CLIENT_URL for multiple domains)
const parseOrigins = () => {
  const raw = process.env.CLIENT_URL || 'http://localhost:5173';
  const origins = raw.split(',').map(o => o.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: parseOrigins(),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 10000,
});

// Make io accessible in routes/controllers
app.set('io', io);
initSocket(io);

// Connect to MongoDB
connectDB();

// Ensure MongoDB connection in Serverless environments
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/socket.io'), // Don't rate-limit socket.io polling
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many auth attempts, please try again later.' },
});
app.use('/api/auth/', authLimiter);

// CORS
app.use(
  cors({
    origin: parseOrigins(),
    credentials: true,
  })
);

// Body parsing (skip for stripe webhook)
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static files (uploads) — protected: require auth, serve via sendFile
app.use('/uploads', protect, express.static(path.join(__dirname, '..', 'uploads'), {
  // prevent direct indexing / caching of user content
  setHeaders: (res) => res.setHeader('Cache-Control', 'private, max-age=3600'),
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/curriculum', curriculumRoutes);
app.use('/api/study-plans', studyPlanRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/daily-records', dailyRecordRoutes);
app.use('/api/session-feedback', sessionFeedbackRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/student-recitations', studentRecitationRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/daily-tasks', dailyTaskRoutes);
app.use('/api/ijazah', ijazahRoutes);


// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`🕌 Quran Platform Server running on port ${PORT}`);
    console.log(`📡 Socket.io ready`);
    console.log(`🌐 Client URL: ${process.env.CLIENT_URL}`);
  });
}

export default app;

// ─── Graceful Shutdown ──────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);
  try {
    // End all active live sessions
    const LiveSession = (await import('./models/LiveSession.js')).default;
    const activeSessions = await LiveSession.find({ status: 'live' });
    for (const session of activeSessions) {
      session.status = 'ended';
      session.endedAt = new Date();
      await session.save();
      io.to(`group:${session.group}`).emit('broadcast-ended', { sessionId: session._id });
    }
    if (activeSessions.length > 0) {
      console.log(`  📴 Ended ${activeSessions.length} active live sessions`);
    }

    // Notify all connected sockets
    io.emit('server-shutdown', { message: 'Server is restarting' });

    // Close Socket.io
    io.close();

    // Close HTTP server
    server.close(() => {
      console.log('  ✅ HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('  ⚠️  Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } catch (err) {
    console.error('Shutdown error:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
