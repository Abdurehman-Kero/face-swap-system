const app = require('./app');
const { testConnection } = require('./models/database');

const PORT = process.env.PORT || 3001;

// Test database connection before starting server
const startServer = async () => {
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
        console.error('âŒ Cannot start server: Database connection failed');
        console.log('í²¡ Please check your MySQL credentials in .env file');
        process.exit(1);
    }
    
    app.listen(PORT, () => {
        console.log(`íº€ Server running on port ${PORT}`);
        console.log(`í³ Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`í´— API URL: http://localhost:${PORT}`);
        console.log(`âœ… Health check: http://localhost:${PORT}/api/health`);
    });
};

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\ní»‘ Shutting down server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\ní»‘ Shutting down server...');
    process.exit(0);
});

startServer();
