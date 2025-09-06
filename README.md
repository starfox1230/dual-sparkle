# 🎮 Neon Quiz Battle - Multiplayer Head-to-Head Quizzes

A real-time multiplayer quiz game with stunning neon aesthetics! Create custom quizzes, challenge friends, and compete in synchronized quiz battles.

![Neon Quiz Battle](https://lovable.dev/opengraph-image-p98pqg.png)

## ✨ Features

- **Real-time Multiplayer**: Challenge friends with shareable invite links
- **Custom Quizzes**: Import quiz JSON or use built-in samples  
- **Synchronized Gameplay**: Perfectly timed rounds across devices
- **Neon Gaming Aesthetic**: Cyberpunk-inspired UI with glowing effects
- **Mobile Optimized**: Touch-friendly interface designed for phones
- **Live Scoring**: Speed + accuracy based point system
- **QR Code Sharing**: Easy match invitations

## 🚀 Quick Start

### 1. Supabase Setup

This app requires Supabase for real-time multiplayer functionality.

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
2. **Get your credentials** from Settings → API
3. **Run the SQL setup** by copying and pasting the contents of `supabase_setup.sql` into your Supabase SQL Editor
4. **Enable Anonymous Auth** in Authentication → Settings → Auth Providers (recommended) or enable Magic Links
5. **Enable Realtime** in Database → Replication for tables: `matches`, `players`, `answers`

### 2. Environment Variables

Set these in your deployment platform:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Deploy

Deploy using Lovable's one-click deployment or any static hosting platform.

## 🎯 How to Play

### Creating a Match
1. Enter your name
2. Paste quiz JSON or load a sample
3. Click "Create Match" 
4. Share the invite link or QR code with a friend

### Quiz Format
```json
{
  "quizName": "Your Quiz Title",
  "questions": [
    {
      "question": "What is the closest planet to the Sun?",
      "options": ["Venus", "Mercury", "Earth", "Mars"],
      "correctAnswer": "Mercury",
      "explanation": "Mercury is the innermost planet in our solar system."
    }
  ]
}
```

### Gameplay Flow
1. **Lobby**: Both players ready up
2. **Question Reveal**: 3-second preview (question only)
3. **Answering**: Timed multiple choice with live countdown
4. **Round Results**: Show correct answers, explanations, and points
5. **Final Results**: Declare winner and show match history

### Scoring System
- **Speed Bonus**: Faster correct answers = more points
- **Base Points**: Get points for correct answers
- **Zero Points**: Wrong answers or timeouts

## 🛠️ Technical Architecture

### Frontend Stack
- **React 18** with TypeScript
- **Tailwind CSS** for styling with custom neon design system
- **Radix UI** components with cyberpunk variants
- **React Router** for navigation
- **Lucide React** for icons

### Backend Stack
- **Supabase** for real-time database and auth
- **PostgreSQL** with Row-Level Security (RLS)
- **Realtime subscriptions** for live game sync
- **Anonymous authentication** for frictionless onboarding

### Database Schema
- `matches` - Game sessions with quiz data and state
- `players` - Two players per match with scores and ready status  
- `answers` - Player responses with server timestamps for fairness

## 🔧 Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production  
npm run build
```

## 🎨 Design System

The app features a comprehensive neon gaming design system:

- **Colors**: Electric blue, purple, cyan, pink gradients
- **Typography**: Orbitron for headers, Roboto for body text
- **Effects**: Glowing borders, pulsing animations, neon shadows
- **Components**: Custom button variants with cyberpunk styling

## 🚀 Deployment Options

### Lovable (Recommended)
1. Click the "Publish" button in Lovable
2. Add your Supabase credentials in project settings
3. Your app is live!

### Other Platforms
- **Vercel**: Connect GitHub repo and add environment variables
- **Netlify**: Deploy from Git with build command `npm run build`
- **GitHub Pages**: Build and deploy to `gh-pages` branch

## 🔒 Security Features

- **Row-Level Security (RLS)** protects user data
- **Server-side timing** prevents cheating via client manipulation
- **Anonymous auth** maintains privacy while enabling multiplayer
- **Rate limiting** through Supabase built-in protections

## 📱 Mobile Experience

Optimized for mobile gameplay:
- Touch-friendly button grid (A/B/C/D layout)
- Responsive design scales to any screen size
- QR code sharing for easy match joining
- Offline-capable quiz history

## 🎮 Game Modes (Future)

Planned features for v2:
- **Tournament Brackets**: Multi-round elimination
- **Spectator Mode**: Watch matches in progress  
- **Private Matches**: Password-protected rooms
- **Custom Themes**: Player-selectable visual styles
- **Voice Chat**: Built-in communication

## 🐛 Troubleshooting

### Common Issues

**Build Errors**
- Ensure all environment variables are set
- Check that Supabase SQL setup completed successfully

**Connection Issues**  
- Verify Supabase credentials are correct
- Check that Realtime is enabled for all tables
- Ensure RLS policies allow your operations

**Auth Problems**
- Enable Anonymous Auth in Supabase Dashboard
- Fallback to Magic Link if anonymous fails

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests.

---

Built with ⚡ by [Lovable](https://lovable.dev) - AI-powered web development