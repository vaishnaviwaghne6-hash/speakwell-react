# Speakwell – English Tutor (React + Vite)

Works fully offline. **No API key, no server, no internet needed** for the tutor.

Chat tutor with grammar corrections, 30-day plans for 3 levels (with unlocking), vocabulary cards
with Hindi meanings, pronunciation scoring, listen/slow audio, and a hands-free voice call with Ava.

## Quick start (Windows)
1. Install Node.js 18+ from https://nodejs.org
2. Double-click `start.bat` (or run `npm install` then `npm run dev`).

## Notes
- Use Chrome or Edge for voice input, pronunciation and the call feature; allow the microphone.
- Progress (days, XP) is saved in the browser.
- Everything the tutor knows lives in `src/ai.js`:
  - `RULES` – grammar corrections (add a line `[regex, replacement, reason]`).
  - `KB` – answers to grammar questions such as "difference between make and do".
  - `THEMES` / `GLOSS` – vocabulary with Hindi meanings; "what does X mean?" and "X ka matlab" use these.
  - `TOPICS` – follow-up questions for casual chat (family, food, cricket, ...).
  - `HINGLISH` – Hindi/Hinglish sentences that Ava turns into correct English.
- The tutor answers direct questions (name, meaning, pronunciation, simple sums, capitals, date/time, grammar),
  repeats the last question when you say "I don't understand", and never makes up answers it does not know.
