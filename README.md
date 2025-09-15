# Agentic Design Flow

A collective idea emergence and specification system with AI-driven chat and challenge management.

## 🎯 Purpose

Agentic Design Flow enables collective idea generation through AI-driven conversations. Users interact with an AI chatbot that asks questions, and responses feed into a system that generates structured challenges with pains, gains, and KPI estimations.

## 🏗️ System Architecture

### Core Components

- **Chat Interface** (1/3 screen): Handles user interactions with text, audio, image, and document support
- **Challenge Management** (2/3 screen): Displays and allows editing of generated challenges
- **Webhook System**: Integrates with external systems (n8n, AgentForce) for AI processing

### Data Flow

1. External system sends ASK (question) via webhook with user KEY
2. User clicks link and lands on chat interface
3. User responds with various media types
4. Response forwarded to external AI system via webhook
5. AI system analyzes conversation and generates/updates challenges
6. Challenges displayed with visual feedback for updates

## 🚀 Features

### Chat System
- ✅ Multi-media support (text, audio, images, documents)
- ✅ Drag & drop file uploads
- ✅ Audio recording capability
- ✅ Real-time message display
- ✅ Time remaining countdown
- ✅ Session closure detection

### Challenge Management
- ✅ Structured challenge display (Pains & Gains)
- ✅ Inline editing of all elements
- ✅ Flexible JSON KPI format
- ✅ Visual highlight on updates
- ✅ Add/remove challenges, pains, gains, KPIs

### API & Webhooks
- ✅ RESTful API for all operations
- ✅ Webhook endpoints for external integration
- ✅ Key-based session security
- ✅ Real-time data synchronization

## 🛠️ ASK Key Format & Troubleshooting

### Valid ASK Key Format
ASK keys must follow these rules:
- **Length**: 3-100 characters
- **Characters**: Only letters, numbers, dots (.), dashes (-), and underscores (_)
- **Content**: Must contain at least one letter or number
- **No spaces or special characters** like @, #, %, etc.

### Examples
✅ **Valid**: `test-key-123`, `user_session_456`, `ASK-2024-001`, `session.id.789`  
❌ **Invalid**: `ab` (too short), `key with spaces`, `key@domain.com`, `---` (no alphanumeric)

### Testing Your ASK Keys
Visit `/test-key` to validate ASK key formats and debug issues:
```
https://your-domain.com/test-key
```

### Common Issues
1. **"Invalid ASK key format"**: Check that your key meets the format requirements above
2. **"No ASK key provided"**: Ensure your URL includes `?key=your-ask-key`
3. **"Error Loading Session"**: Verify your backend webhook endpoints are configured correctly

## 📡 API Endpoints

### ASK Management
```
GET    /api/ask/[key]        - Retrieve ASK data
POST   /api/ask/[key]        - Create/update ASK
DELETE /api/ask/[key]        - Close ASK session
```

### Messages
```
GET    /api/messages/[key]   - Get conversation messages
POST   /api/messages/[key]   - Send user message
PUT    /api/messages/[key]   - Add AI response
DELETE /api/messages/[key]   - Clear messages
```

### Challenges
```
GET    /api/challenges/[key] - Get challenges
POST   /api/challenges/[key] - Update challenges (webhook)
PUT    /api/challenges/[key] - Update single challenge
DELETE /api/challenges/[key] - Clear challenges
```

## 🔧 Setup & Installation

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/pmboutet/agentic-design-flow.git
cd agentic-design-flow

# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local

# Configure your environment variables
# Edit .env.local with your webhook URLs and secrets

# Run development server
npm run dev
```

### Environment Variables
```env
# Webhook Configuration
WEBHOOK_SECRET=your-webhook-secret-here
WEBHOOK_ENDPOINT=http://localhost:3000/api/webhook

# External System Webhooks
EXTERNAL_ASK_WEBHOOK=https://your-external-system.com/ask-webhook
EXTERNAL_RESPONSE_WEBHOOK=https://your-external-system.com/response-webhook
EXTERNAL_CHALLENGE_WEBHOOK=https://your-external-system.com/challenge-webhook

# Security
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ASK Key Configuration
# ASK keys are used to identify sessions and should follow these rules:
# - At least 3 characters long
# - Less than 100 characters
# - Only letters, numbers, dots (.), dashes (-), and underscores (_)
# - Must contain at least one letter or number
# 
# Valid examples:
# - test-key-123
# - user_session_456  
# - session.id.789
# - ASK-2024-001
#
# Invalid examples:
# - ab (too short)
# - key with spaces (contains spaces)
# - key@domain.com (contains @)
# - --- (no alphanumeric characters)
#
# Test your ASK keys at: http://localhost:3000/test-key
```

## 🌐 Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Configure your production webhook URLs
```

## 🔗 Integration Guide

### External System Integration

#### 1. Sending an ASK
```javascript
// POST to your deployed URL
const response = await fetch('https://your-app.vercel.app/api/ask/your-unique-key', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    askKey: 'your-unique-key',
    question: 'What challenges do you face in your daily work?',
    endDate: '2024-12-31T23:59:59Z'
  })
});
```

#### 2. Receiving User Responses
Your webhook will receive:
```javascript
{
  askKey: 'your-unique-key',
  message: {
    id: 'msg-123',
    content: 'User response text or file data',
    type: 'text|audio|image|document',
    sender: 'user',
    timestamp: '2024-01-01T12:00:00Z',
    metadata: { fileName: 'document.pdf', fileSize: 1024 }
  },
  allMessages: [/* conversation history */]
}
```

#### 3. Sending Challenges Update
```javascript
// POST to challenges endpoint
const response = await fetch('https://your-app.vercel.app/api/challenges/your-unique-key', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    askKey: 'your-unique-key',
    action: 'update', // or 'replace'
    challenges: [
      {
        id: 'challenge-1',
        name: 'Communication Efficiency',
        pains: [
          {
            id: 'pain-1',
            name: 'Slow Email Response',
            description: 'Team members take too long to respond to emails',
            kpiEstimations: [
              {
                description: 'Average response time',
                value: { metric: 4, unit: 'hours', target: 2 }
              }
            ]
          }
        ],
        gains: [
          {
            id: 'gain-1',
            name: 'Faster Decision Making',
            description: 'Quicker responses lead to faster decisions',
            kpiEstimations: [
              {
                description: 'Decision speed improvement',
                value: { improvement: '50%', timeframe: 'monthly' }
              }
            ]
          }
        ]
      }
    ]
  })
});
```

## 🔒 Security

- **Key-based Access**: All data is accessible only with valid ASK keys
- **Webhook Validation**: Optional webhook secret validation
- **Input Sanitization**: All user inputs are validated and sanitized
- **File Upload Security**: File type and size validation
- **No Persistent Storage**: Demo uses in-memory storage (implement database for production)

## 🎨 Customization

### Styling
- Built with Tailwind CSS for easy customization
- CSS variables for color themes
- Responsive design with mobile support
- Dark mode ready (implement theme toggle as needed)

### Components
- Modular component architecture
- TypeScript for type safety
- Reusable UI components in `/src/components/ui/`
- Business logic components in `/src/components/chat/` and `/src/components/challenge/`

## 🧪 Testing

```bash
# Run type checking
npm run lint

# Build for production
npm run build

# Test the build
npm start

# Test ASK key validation
# Visit http://localhost:3000/test-key
```

## 📚 Usage Examples

### Creating an ASK Session
1. External system generates unique key: `ask-session-12345`
2. System posts ASK data to API
3. User receives link: `https://your-app.com/?key=ask-session-12345`
4. User clicks link and conversation begins

### File Upload Example
Users can drag & drop or click to upload:
- **Images**: JPG, PNG, GIF, WebP
- **Audio**: MP3, WAV, OGG, MP4
- **Documents**: PDF, DOC, DOCX, TXT

### Challenge Structure Example
```json
{
  "id": "challenge-1",
  "name": "Team Productivity",
  "pains": [
    {
      "id": "pain-1",
      "name": "Meeting Overload",
      "description": "Too many unproductive meetings",
      "kpiEstimations": [
        {
          "description": "Weekly meeting hours",
          "value": {
            "current": 15,
            "target": 8,
            "unit": "hours",
            "impact": "high"
          }
        }
      ]
    }
  ],
  "gains": [
    {
      "id": "gain-1", 
      "name": "Focused Work Time",
      "description": "More time for deep work",
      "kpiEstimations": [
        {
          "description": "Productivity increase",
          "value": {
            "expected": 30,
            "unit": "percent",
            "timeframe": "monthly"
          }
        }
      ]
    }
  ]
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 📞 Support

For issues and questions:
1. Check the GitHub Issues
2. Review the API documentation above
3. Test your ASK keys at `/test-key`
4. Create a new issue with detailed description

---

Built with ❤️ using Next.js, TypeScript, and Tailwind CSS
