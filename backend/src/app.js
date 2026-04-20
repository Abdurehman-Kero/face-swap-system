const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes (we'll create these next)
// const authRoutes = require('./routes/authRoutes');
// const faceRoutes = require('./routes/faceRoutes');
// const swapRoutes = require('./routes/swapRoutes');

const app = express();

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Face Swap System Backend is running'
    });
});

// Temporary test endpoint
app.get('/api/test', (req, res) => {
    res.json({ message: 'Backend is working!', success: true });
});

// Routes (will uncomment after creating)
// app.use('/api/auth', authRoutes);
// app.use('/api/faces', faceRoutes);
// app.use('/api/swap', swapRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        error: `Route ${req.method} ${req.path} not found` 
    });
});

module.exports = app;

// Database test endpoint
app.get('/api/db-test', async (req, res) => {
    const { promisePool } = require('./models/database');
    try {
        const [rows] = await promisePool.query('SELECT 1 as test, NOW() as time');
        res.json({ 
            success: true, 
            message: 'Database connection successful',
            result: rows[0]
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});
