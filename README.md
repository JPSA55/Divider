# Divider — AI Study Set Generator

A beautiful, functional study app that transforms your class materials into 18+ different study formats using Claude AI.

## Features

✨ **18 Study Formats**
- Multiple choice quizzes
- Flashcards with spaced repetition
- Fill-in-the-blank exercises
- Timelines and mind maps
- Mock exams
- Essay prompts
- Vocabulary lists
- And 11 more...

📚 **Upload Anything**
- PDFs
- Word documents
- PowerPoint slides
- Plain text notes

🎨 **Beautiful UI**
- Grain Glass design system
- Light and dark modes
- Responsive (mobile, tablet, desktop)
- Minimal, elegant interface

💾 **Progress Tracking**
- Save your study sets
- Track your performance
- Spaced repetition scheduling
- Activity history

## Getting Started

### For Development (Local)

```bash
# Clone the repo
git clone https://github.com/yourusername/divider.git
cd divider

# Start a local server
python3 -m http.server 3000

# Open http://localhost:3000
```

### For Production (Vercel)

1. Fork this repo on GitHub
2. Sign up at vercel.com
3. Import this repository
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY`
5. Deploy!

## Architecture

**Frontend**: Static HTML/CSS/JS with vanilla JavaScript
- No build step required
- Works in any browser
- ~32KB of source code

**Database**: Supabase (PostgreSQL)
- Free tier: 500MB storage
- Row-level security
- Real-time capable

**AI Backend**: Anthropic Claude API
- Cost: ~$0.01-0.05 per study set
- Generates content on-demand
- No server needed

## File Structure

```
.
├── index.html          # Main app (rename from study.html)
├── engine.js           # Material extraction & generation logic
├── app.js              # UI and state management
├── package.json        # Project metadata
├── vercel.json         # Vercel configuration
├── vendor/             # Vendored libraries
│   ├── pdf.min.js
│   ├── pdf.worker.min.js
│   └── jszip.min.js
└── README.md           # This file
```

## Development

The app is built with vanilla JavaScript — no frameworks, no build step.

**Key modules:**
- `engine.js` — Extracts text from PDFs/Word/PowerPoint, generates study material
- `app.js` — UI shell, navigation, storage, study renderers
- `index.html` — Layout, styles, fonts, component templates

**To modify:**
1. Edit the files locally
2. Test in your browser
3. Commit to GitHub
4. Vercel auto-deploys

## Costs

| Service | Cost |
|---------|------|
| Vercel hosting | **FREE** |
| Supabase database | **FREE** (up to 500MB) |
| Claude API | ~$1-5/month (for personal use) |
| Domain (optional) | $12/year |
| **TOTAL** | **$0-6/month** |

## Environment Variables

When deployed on Vercel, add these:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ANTHROPIC_API_KEY=your-api-key
```

Get them from:
- **Supabase**: Settings → API
- **Anthropic**: console.anthropic.com → Settings → API Keys

## Security

- Supabase row-level security: Users can only see their own data
- API keys stored server-side only (never sent to browser)
- No cookies or tracking
- HTTPS enforced

## License

MIT — Use freely for personal or commercial projects.

## Support

Having issues? 
1. Check the browser console (F12)
2. Verify your environment variables
3. Test with a small file first
4. Check that your API key isn't expired

---

Made with ❤️ using Claude AI.
