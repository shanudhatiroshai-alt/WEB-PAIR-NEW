const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const bodyParser = require('body-parser');
const pino = require('pino');
const mega = require('megajs');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    DisconnectReason
} = require('@whiskeysockets/baileys');

// ============================================
// CONFIGURATION
// ============================================

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Event Emitter Configuration
require('events').EventEmitter.defaultMaxListeners = 500;

// MEGA Configuration
const megaAuth = {
    email: 'shanudhatirosh2009t@gmail.com',
    password: 'Shanudha2009t',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// Active sessions tracking
const activeSessions = new Map();

// Logger
const logger = pino({ 
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname'
        }
    }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Upload file to MEGA storage
 */
function uploadToMega(data, name) {
    return new Promise((resolve, reject) => {
        try {
            const storage = new mega.Storage(megaAuth, () => {
                data.pipe(storage.upload({ 
                    name: name, 
                    allowUploadBuffering: true 
                }));
                
                storage.on('add', (file) => {
                    file.link((err, url) => {
                        storage.close();
                        if (err) return reject(err);
                        resolve(url);
                    });
                });

                storage.on('error', (err) => {
                    storage.close();
                    reject(err);
                });
            });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Remove file or directory safely
 */
function removeFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath, { recursive: true, force: true });
            return true;
        }
    } catch (err) {
        logger.error(`Failed to remove ${filePath}:`, err.message);
    }
    return false;
}

/**
 * Generate random session ID
 */
function generateSessionId(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `ShanuFx_${result}_${Date.now()}`;
}

/**
 * Validate phone number
 */
function validatePhoneNumber(phone) {
    const cleaned = phone.replace(/[^0-9]/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Cleanup old sessions (older than 10 minutes)
 */
function cleanupOldSessions() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [sessionId, session] of activeSessions.entries()) {
        if (now - session.createdAt > maxAge) {
            logger.info(`Cleaning up old session: ${sessionId}`);
            
            if (session.socket) {
                try {
                    session.socket.end();
                } catch (err) {
                    logger.error(`Error closing socket for ${sessionId}:`, err.message);
                }
            }
            
            removeFile(session.sessionPath);
            activeSessions.delete(sessionId);
        }
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldSessions, 5 * 60 * 1000);

// ============================================
// ROUTES
// ============================================

/**
 * Main route - Serve pairing page
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        activeSessions: activeSessions.size,
        timestamp: new Date().toISOString()
    });
});

/**
 * Generate pairing code
 */
app.get('/code', async (req, res) => {
    const phoneNumber = req.query.number;

    // Validate input
    if (!phoneNumber) {
        return res.status(400).json({ 
            success: false,
            message: 'Phone number is required'
        });
    }

    if (!validatePhoneNumber(phoneNumber)) {
        return res.status(400).json({ 
            success: false,
            message: 'Invalid phone number format. Please use international format without + (e.g., 1234567890)'
        });
    }

    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    const sessionId = generateSessionId();

    logger.info(`New pairing request for ${cleanNumber}, session: ${sessionId}`);

    try {
        const result = await initializeWhatsAppSession(cleanNumber, sessionId);
        
        if (result.success) {
            res.json({
                success: true,
                code: result.code,
                message: 'Enter this code in WhatsApp. Your session will be sent to you via WhatsApp message.',
                sessionId: sessionId
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to generate pairing code'
            });
        }
    } catch (error) {
        logger.error('Pairing error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Service temporarily unavailable. Please try again.'
        });
    }
});

// ============================================
// WHATSAPP SESSION LOGIC
// ============================================

/**
 * Initialize WhatsApp session and get pairing code
 */
async function initializeWhatsAppSession(phoneNumber, sessionId) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    
    // Create sessions directory if it doesn't exist
    if (!fs.existsSync(path.join(__dirname, 'sessions'))) {
        fs.mkdirSync(path.join(__dirname, 'sessions'), { recursive: true });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(
                    state.keys,
                    pino({ level: 'silent' })
                )
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Safari'),
            getMessage: async () => undefined
        });

        // Store session info
        activeSessions.set(sessionId, {
            socket,
            phoneNumber,
            sessionPath,
            createdAt: Date.now(),
            status: 'waiting_for_code'
        });

        // Setup event handlers
        setupSocketHandlers(socket, sessionId, phoneNumber, sessionPath, saveCreds);

        // Request pairing code
        if (!socket.authState.creds.registered) {
            await delay(2000);
            const code = await socket.requestPairingCode(phoneNumber);
            
            logger.info(`Pairing code generated for ${phoneNumber}: ${code}`);
            
            // Update session status
            const session = activeSessions.get(sessionId);
            if (session) {
                session.status = 'code_sent';
                session.code = code;
            }

            return { 
                success: true, 
                code: code 
            };
        } else {
            return { 
                success: false, 
                message: 'Phone number already registered' 
            };
        }

    } catch (error) {
        logger.error(`Session initialization error for ${sessionId}:`, error);
        
        // Cleanup on error
        removeFile(sessionPath);
        activeSessions.delete(sessionId);
        
        return { 
            success: false, 
            message: error.message 
        };
    }
}

/**
 * Setup socket event handlers
 */
function setupSocketHandlers(socket, sessionId, phoneNumber, sessionPath, saveCreds) {
    
    // Credentials update
    socket.ev.on('creds.update', saveCreds);

    // Connection updates
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const session = activeSessions.get(sessionId);

        logger.info(`Session ${sessionId} - Connection update:`, {
            connection,
            lastDisconnect: lastDisconnect?.error?.message
        });

        if (connection === 'open') {
            logger.info(`Session ${sessionId} - Connected successfully!`);
            
            if (session) {
                session.status = 'connected';
            }

            // Handle successful connection
            await handleSuccessfulConnection(socket, sessionId, sessionPath);
            
        } else if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error?.output?.payload?.error;

            logger.warn(`Session ${sessionId} - Connection closed:`, {
                statusCode,
                reason
            });

            if (session) {
                session.status = 'closed';
            }

            // Handle different disconnect reasons
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                logger.error(`Session ${sessionId} - Logged out or unauthorized`);
            } else if (statusCode === DisconnectReason.restartRequired) {
                logger.info(`Session ${sessionId} - Restart required`);
            }

            // Cleanup
            cleanupSession(sessionId, sessionPath, socket);
        }
    });

    // Messages update (for debugging)
    socket.ev.on('messages.upsert', async ({ messages }) => {
        logger.debug(`Session ${sessionId} - Received ${messages.length} message(s)`);
    });
}

/**
 * Handle successful WhatsApp connection
 */
async function handleSuccessfulConnection(socket, sessionId, sessionPath) {
    try {
        logger.info(`Session ${sessionId} - Processing successful connection...`);
        
        // Wait for session to stabilize
        await delay(5000);

        const credsPath = path.join(sessionPath, 'creds.json');
        
        if (!fs.existsSync(credsPath)) {
            throw new Error('Credentials file not found');
        }

        // Upload to MEGA
        logger.info(`Session ${sessionId} - Uploading to MEGA...`);
        
        const fileName = `${generateSessionId()}.json`;
        const megaUrl = await uploadToMega(
            fs.createReadStream(credsPath),
            fileName
        );

        const sessionCode = megaUrl.replace('https://mega.nz/file/', '');

        logger.info(`Session ${sessionId} - Upload successful. Session code: ${sessionCode}`);

        // Send session code to user via WhatsApp
        const userJid = jidNormalizedUser(socket.user.id);
        
        const message = `✅ *WhatsApp Session Created Successfully!*

🔐 *Your Session ID:*
\`\`\`${sessionCode}\`\`\`

📱 *Phone Number:* ${socket.user.id.split(':')[0]}

⚠️ *Important:*
• Keep this session ID safe and private
• Use this ID to connect your bot
• Do not share with anyone

🔗 *MEGA Link:*
${megaUrl}

Thank you for using ShanuFx WhatsApp Bot!`;

        await socket.sendMessage(userJid, { text: message });
        
        logger.info(`Session ${sessionId} - Session code sent to user`);

        // Wait before cleanup
        await delay(3000);

    } catch (error) {
        logger.error(`Session ${sessionId} - Error handling connection:`, error);
    } finally {
        // Cleanup session
        await delay(2000);
        cleanupSession(sessionId, sessionPath, socket);
    }
}

/**
 * Cleanup session
 */
function cleanupSession(sessionId, sessionPath, socket) {
    logger.info(`Session ${sessionId} - Cleaning up...`);
    
    try {
        if (socket) {
            socket.end();
        }
    } catch (err) {
        logger.error(`Session ${sessionId} - Error closing socket:`, err.message);
    }

    removeFile(sessionPath);
    activeSessions.delete(sessionId);
    
    logger.info(`Session ${sessionId} - Cleanup completed`);
}

// ============================================
// ERROR HANDLING
// ============================================

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
});

process.on('SIGINT', () => {
    logger.info('Shutting down gracefully...');
    
    // Cleanup all active sessions
    for (const [sessionId, session] of activeSessions.entries()) {
        cleanupSession(sessionId, session.sessionPath, session.socket);
    }
    
    process.exit(0);
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false,
        message: 'Endpoint not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    logger.error('Server error:', err);
    res.status(500).json({ 
        success: false,
        message: 'Internal server error'
    });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    logger.info(`
    ╔═══════════════════════════════════════╗
    ║  🚀 WhatsApp Pairing Server Started   ║
    ║  📡 Port: ${PORT.toString().padEnd(27)} ║
    ║  🌐 http://localhost:${PORT.toString().padEnd(18)} ║
    ╚═══════════════════════════════════════╝
    `);
});

module.exports = app;