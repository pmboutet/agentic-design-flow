/**
 * Speechmatics WebSocket Proxy Server
 * 
 * This server proxies WebSocket connections from the browser to Speechmatics,
 * adding the required Authorization header that browsers cannot send.
 * 
 * Usage: node scripts/speechmatics-ws-proxy.js
 * 
 * The proxy listens on ws://localhost:3001/speechmatics-ws
 * Clients connect to this proxy, which then connects to Speechmatics with proper auth.
 */

// Load environment variables from .env.local or .env
require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // Also load .env if it exists

const WebSocket = require('ws');
const http = require('http');

const SPEECHMATICS_API_KEY = process.env.SPEECHMATICS_API_KEY;
const PROXY_PORT = process.env.SPEECHMATICS_PROXY_PORT || 3001;

if (!SPEECHMATICS_API_KEY) {
  console.error('❌ SPEECHMATICS_API_KEY environment variable is not set');
  process.exit(1);
}

// Create HTTP server for WebSocket upgrade
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  path: '/speechmatics-ws'
});

wss.on('connection', (clientWs, request) => {
  console.log('[Proxy] ✅ Client connected');
  
  // Extract language from query parameter (default: fr)
  // Note: Language is configured in the start message, not in the URL
  const url = new URL(request.url, `http://${request.headers.host}`);
  const language = url.searchParams.get('language') || 'fr';
  
  // Try different Speechmatics endpoints - the correct one depends on your region/account
  // Common endpoints:
  // - eu2.rt.speechmatics.com (Europe)
  // - us2.rt.speechmatics.com (US)
  // The URL should be /v2 without the language in the path
  const region = process.env.SPEECHMATICS_REGION || 'eu2';
  const speechmaticsUrl = `wss://${region}.rt.speechmatics.com/v2`;
  
  console.log(`[Proxy] Connecting to Speechmatics: ${speechmaticsUrl}`);
  console.log(`[Proxy] Language will be configured in start message: ${language}`);
  
  // Create WebSocket connection to Speechmatics with Authorization header
  const speechmaticsWs = new WebSocket(speechmaticsUrl, {
    headers: {
      'Authorization': `Bearer ${SPEECHMATICS_API_KEY}`
    }
  });
  
  // Forward messages from client to Speechmatics
  clientWs.on('message', (data, isBinary) => {
    if (speechmaticsWs.readyState === WebSocket.OPEN) {
      // Log text messages for debugging
      if (!isBinary) {
        try {
          const message = data.toString();
          const parsed = JSON.parse(message);
          console.log('[Proxy] 📤 Message to Speechmatics:', JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log('[Proxy] 📤 Non-JSON message to Speechmatics:', data.toString().substring(0, 100));
        }
      } else {
        console.log('[Proxy] 📦 Binary message to Speechmatics (audio data)');
      }
      // Preserve binary/text format
      speechmaticsWs.send(data, { binary: isBinary });
    } else {
      console.log('[Proxy] ⚠️ Speechmatics WebSocket not open, dropping message');
    }
  });
  
  // Forward messages from Speechmatics to client
  speechmaticsWs.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      // Log text messages for debugging
      if (!isBinary) {
        try {
          const message = data.toString();
          const parsed = JSON.parse(message);
          console.log('[Proxy] 📨 Message from Speechmatics:', JSON.stringify(parsed, null, 2));
          // Check for RecognitionStarted
          if (parsed.message === 'RecognitionStarted') {
            console.log('[Proxy] ✅ RecognitionStarted received from Speechmatics');
          }
        } catch (e) {
          console.log('[Proxy] 📨 Non-JSON message from Speechmatics:', data.toString().substring(0, 100));
        }
      } else {
        console.log('[Proxy] 📦 Binary message from Speechmatics (audio data)');
      }
      // Preserve binary/text format
      clientWs.send(data, { binary: isBinary });
    } else {
      console.log('[Proxy] ⚠️ Client WebSocket not open, dropping message');
    }
  });
  
  // Handle Speechmatics connection open
  speechmaticsWs.on('open', () => {
    console.log('[Proxy] ✅ Connected to Speechmatics');
  });
  
  // Handle errors
  speechmaticsWs.on('error', (error) => {
    console.error('[Proxy] ❌ Speechmatics error:', error);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, 'Speechmatics connection error');
    }
  });
  
  clientWs.on('error', (error) => {
    console.error('[Proxy] ❌ Client error:', error);
  });
  
  // Handle close events
  speechmaticsWs.on('close', (code, reason) => {
    console.log(`[Proxy] Speechmatics closed: ${code} ${reason}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason);
    }
  });
  
  clientWs.on('close', (code, reason) => {
    console.log(`[Proxy] Client closed: ${code} ${reason}`);
    if (speechmaticsWs.readyState === WebSocket.OPEN) {
      speechmaticsWs.close();
    }
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`🚀 Speechmatics WebSocket Proxy listening on ws://localhost:${PROXY_PORT}/speechmatics-ws`);
  console.log(`📝 Make sure SPEECHMATICS_API_KEY is set in your environment`);
});

