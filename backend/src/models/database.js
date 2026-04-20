const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

// Create connection pool for MAMP
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'face_swap_system',
    port: parseInt(process.env.DB_PORT) || 8889,  // MAMP default port
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Promisify pool for async/await
const promisePool = pool.promise();

// Test connection
const testConnection = async () => {
    try {
        const connection = await promisePool.getConnection();
        console.log('‚úÖ MySQL database connected successfully (MAMP)');
        console.log(`   Host: ${process.env.DB_HOST}:${process.env.DB_PORT || 8889}`);
        console.log(`   Database: ${process.env.DB_NAME}`);
        connection.release();
        return true;
    } catch (error) {
        console.error('‚ùå MySQL connection failed:', error.message);
        console.error('Ì≤° MAMP Troubleshooting:');
        console.error('   1. Make sure MAMP is running');
        console.error('   2. Check MySQL port in MAMP (default: 8889)');
        console.error('   3. Verify credentials: root/root');
        console.error('   4. Try connecting via: mysql -h localhost -P 8889 -u root -p');
        return false;
    }
};

module.exports = { pool, promisePool, testConnection };
