# WhatsApp Pairing Server 🚀

A modern, beautiful WhatsApp pairing code generator with glassmorphism UI effects and animated backgrounds.

## ✨ Features

- 🎨 **Modern Glassmorphism UI** - Beautiful glass effect design
- 🌈 **Animated Background** - Smooth gradient animations with floating particles
- 📱 **Responsive Design** - Works perfectly on all devices
- ⚡ **Bootstrap 5** - Modern, mobile-first framework
- 🔒 **Secure Pairing** - Safe WhatsApp device linking
- 📤 **MEGA Upload** - Automatic session backup to MEGA
- 🎯 **Easy to Use** - Simple, intuitive interface

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- MEGA account (for session storage)
- PM2 (optional, for production)

## 🚀 Installation

1. **Clone or download the repository**

2. **Install dependencies**
```bash
npm install
```

3. **Configure MEGA credentials**

Open `server.js` and update the MEGA credentials:

```javascript
const megaAuth = {
    email: 'your-mega-email@example.com',
    password: 'your-mega-password',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};
```

4. **Create directory structure**
```bash
mkdir public
```

5. **Move the HTML file**
- Save the HTML artifact as `public/pair.html`

## 📁 Project Structure

```
whatsapp-pairing-server/
├── server.js           # Main server file (consolidated backend)
├── public/
│   └── pair.html      # Frontend UI
├── package.json       # Dependencies
├── session/           # Temporary session files (auto-created)
└── README.md         # Documentation
```

## 🎮 Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Using PM2 (Recommended for Production)

```bash
# Start the server
npm run pm2:start

# View logs
npm run pm2:logs

# Restart server
npm run pm2:restart

# Stop server
npm run pm2:stop
```

## 🌐 Accessing the Application

Once the server is running, open your browser and navigate to:

```
http://localhost:8000
```

## 📱 How to Use

1. **Enter Your Phone Number**
   - Include your country code (e.g., +1234567890)
   - Click "Generate Pairing Code"

2. **Wait for Code Generation**
   - The system will generate your unique pairing code
   - This typically takes 5-10 seconds

3. **Copy Your Code**
   - Click on the code to copy it to clipboard
   - The code will be highlighted in green

4. **Link Your Device**
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices
   - Tap "Link a Device"
   - Enter the pairing code

5. **Session Backup**
   - Your session is automatically backed up to MEGA
   - The session ID will be sent to your WhatsApp

## 🔧 Configuration

### Port Configuration

Change the port in `server.js` or use environment variable:

```bash
PORT=3000 npm start
```

### MEGA Configuration

Update these settings in `server.js`:

```javascript
const megaAuth = {
    email: 'your-email@example.com',
    password: 'your-password',
    userAgent: 'Mozilla/5.0...'
};
```

## 🎨 Customization

### Changing Colors

Edit the CSS in `public/pair.html`:

```css
/* Background gradient colors */
background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);

/* WhatsApp green color */
.logo-icon {
    color: #25D366;
}
```

### Adjusting Animations

Modify animation speeds:

```css
/* Background animation speed */
animation: gradientBG 15s ease infinite;

/* Particle float speed */
animation: float 20s infinite;
```

## 🛠️ API Endpoints

### GET `/`
Returns the main pairing interface

### GET `/code?number={phone_number}`
Generates a pairing code for the specified phone number

**Parameters:**
- `number` - Phone number with country code (digits only)

**Response:**
```json
{
    "code": "ABCD-1234"
}
```

### GET `/health`
Health check endpoint

**Response:**
```json
{
    "status": "ok",
    "timestamp": "2025-01-07T12:00:00.000Z"
}
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 8000
kill -9 $(lsof -ti:8000)
```

### Session Issues
```bash
# Remove session directory
rm -rf session/
```

### MEGA Upload Errors
- Verify your MEGA credentials
- Check your MEGA account storage space
- Ensure stable internet connection

## 📦 Dependencies

- **@whiskeysockets/baileys** - WhatsApp Web API
- **express** - Web server framework
- **body-parser** - Request body parsing
- **pino** - Fast logging
- **megajs** - MEGA cloud storage

## 🔒 Security Notes

- Never share your MEGA credentials
- Keep your pairing codes private
- Don't commit credentials to version control
- Use environment variables for sensitive data

## 📝 Environment Variables

Create a `.env` file:

```env
PORT=8000
MEGA_EMAIL=your-email@example.com
MEGA_PASSWORD=your-password
NODE_ENV=production
```

Then update `server.js` to use:
```javascript
require('dotenv').config();

const megaAuth = {
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD,
    userAgent: 'Mozilla/5.0...'
};
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## ⚠️ Disclaimer

This tool is for educational purposes only. Use responsibly and in accordance with WhatsApp's Terms of Service.

## 📞 Support

If you encounter any issues:
1. Check the troubleshooting section
2. Review the logs: `npm run pm2:logs`
3. Open an issue on the repository

---

Made with ❤️ using Node.js, Express, and Bootstrap