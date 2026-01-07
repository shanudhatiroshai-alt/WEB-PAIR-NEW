const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require("child_process");
const bodyParser = require("body-parser");
const pino = require("pino");
const mega = require("megajs");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // Serve static files

// Event Emitter Configuration
require('events').EventEmitter.defaultMaxListeners = 500;

// ============================================
// MEGA UPLOAD CONFIGURATION
// ============================================
const megaAuth = {
    email: 'shanudhatirosh2009t@gmail.com',
    password: 'Shanudha2009t',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'
};

/**
 * Upload file to MEGA storage
 * @param {Stream} data - File stream to upload
 * @param {string} name - File name
 * @returns {Promise<string>} - MEGA file URL
 */
function uploadToMega(data, name) {
    return new Promise((resolve, reject) => {
        try {
            const storage = new mega.Storage(megaAuth, () => {
                data.pipe(storage.upload({ name: name, allowUploadBuffering: true }));
                storage.on("add", (file) => {
                    file.link((err, url) => {
                        if (err) {
                            storage.close();
                            return reject(err);
                        }
                        storage.close();
                        resolve(url);
                    });
                });
            });
        } catch (err) {
            reject(err);
        }
    });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Remove file or directory
 * @param {string} filePath - Path to remove
 */
function removeFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
    return true;
}

/**
 * Generate random MEGA ID with ShanuFx prefix
 * @param {number} length - Length of random string
 * @param {number} numberLength - Length of random number
 * @returns {string} - Random ID with ShanuFx~ prefix
 */
function randomMegaId(length = 6, numberLength = 4) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    const number = Math.floor(Math.random() * Math.pow(10, numberLength));
    return `ShanuFx~${result}${number}`;
}

// ============================================
// ROUTES
// ============================================

/**
 * Main route - Serve the pairing page
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

/**
 * Health check route
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Pairing code generation route
 */
app.get('/code', async (req, res) => {
    const num = req.query.number;

    if (!num) {
        return res.status(400).json({ 
            code: 'Error', 
            message: 'Phone number is required' 
        });
    }

    // Validate phone number format
    const cleanNumber = num.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 11) {
        return res.status(400).json({ 
            code: 'Error', 
            message: 'Invalid phone number format' 
        });
    }

    try {
        await generatePairingCode(cleanNumber, res);
    } catch (error) {
        console.error('Pairing error:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                code: 'Service Unavailable',
                message: 'Failed to generate pairing code'
            });
        }
    }
});

// ============================================
// WHATSAPP PAIRING LOGIC
// ============================================

/**
 * Generate WhatsApp pairing code
 * @param {string} phoneNumber - Phone number to pair
 * @param {Object} res - Express response object
 */
async function generatePairingCode(phoneNumber, res) {
    const sessionPath = './session';
    
    // Clean up existing session
    removeFile(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(
                    state.keys, 
                    pino({ level: "fatal" }).child({ level: "fatal" })
                ),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }).child({ level: "fatal" }),
            browser: Browsers.macOS("Safari"),
        });

        // Request pairing code if not registered
        if (!socket.authState.creds.registered) {
            await delay(1500);
            const code = await socket.requestPairingCode(phoneNumber);
            
            if (!res.headersSent) {
                await res.json({ code });
            }
        }

        // Save credentials on update
        socket.ev.on('creds.update', saveCreds);

        // Handle connection updates
        socket.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                await handleSuccessfulConnection(socket, sessionPath);
            } else if (
                connection === "close" && 
                lastDisconnect?.error?.output?.statusCode !== 401
            ) {
                console.log('Connection closed, retrying...');
                await delay(10000);
                generatePairingCode(phoneNumber, res);
            }
        });

    } catch (err) {
        console.error('Socket error:', err);
        
        // Restart service
        exec('pm2 restart ShanuFx-md', (error) => {
            if (error) console.error('PM2 restart error:', error);
        });

        await removeFile(sessionPath);
        
        if (!res.headersSent) {
            res.status(500).json({ code: "Service Unavailable" });
        }
    }
}

/**
 * Handle successful WhatsApp connection
 * @param {Object} socket - WhatsApp socket
 * @param {string} sessionPath - Path to session directory
 */
async function handleSuccessfulConnection(socket, sessionPath) {
    try {
        await delay(10000);

        const credsPath = path.join(sessionPath, 'creds.json');
        
        if (!fs.existsSync(credsPath)) {
            throw new Error('Credentials file not found');
        }

        // Upload session to MEGA
        const megaUrl = await uploadToMega(
            fs.createReadStream(credsPath),
            `${randomMegaId()}.json`
        );

        // Extract session ID from MEGA URL
        const sessionId = megaUrl.replace('https://mega.nz/file/', '');

        // Send session ID to user via WhatsApp
        const userJid = jidNormalizedUser(socket.user.id);
        await socket.sendMessage(userJid, { text: sessionId });

        console.log('Session created successfully:', sessionId);

    } catch (error) {
        console.error('Connection handling error:', error);
        
        // Restart service on error
        exec('pm2 restart ShanuFx-md', (err) => {
            if (err) console.error('PM2 restart error:', err);
        });
    } finally {
        await delay(100);
        removeFile(sessionPath);
        process.exit(0);
    }
}

// ============================================
// ERROR HANDLING
// ============================================

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    exec('pm2 restart ShanuFx-md', (error) => {
        if (error) console.error('PM2 restart error:', error);
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Not Found',
        message: 'The requested resource does not exist'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║  🚀 WhatsApp Pairing Server Started   ║
    ║  📡 Port: ${PORT}                      ║
    ║  🌐 URL: http://localhost:${PORT}     ║
    ╚═══════════════════════════════════════╝
    `);
});

module.exports = app;