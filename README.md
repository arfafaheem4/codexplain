# Codexplain

**Don't just fix the bug — understand it.**

An AI-powered code review tool that teaches instead of just fixing. Built for OpenAI Build Week using Codex and GPT-5.6.

## What it does

Codexplain reviews your code and, instead of just handing you a fix, it:
1. Explains *why* the mistake happened, in simple words
2. Shows the corrected code
3. Asks a quiz question to check your understanding
4. Generates a new, similar bug in "Verify Mode" to confirm you actually learned the concept
5. Tracks your recurring mistake patterns over time, tied to your account

## Tech stack

- Frontend: React + Vite
- Backend: Node.js + Express
- AI: Groq (Llama 3.3), built using Codex (GPT-5.6)
- Database & Auth: Supabase

## How to run locally

1. Clone this repo
2. Run `npm install`
3. Add your own `.env` files with API keys (see `.env.example`)
4. Run `npm run dev`

## Built with Codex and GPT-5.6

This project was built primarily using Codex (GPT-5.6 Terra) for coding the application structure, and GitHub Copilot for additional feature development.