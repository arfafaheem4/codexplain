import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import Groq from 'groq-sdk';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: 'server/.env' });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const port = process.env.PORT || 3001;
const hasSupabaseConfig = process.env.SUPABASE_URL && process.env.SUPABASE_KEY && !process.env.SUPABASE_URL.startsWith('your_') && !process.env.SUPABASE_KEY.startsWith('your_');
const supabase = hasSupabaseConfig ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY) : null;
const systemInstruction = `You are a friendly coding teacher reviewing code for real functional issues. Focus only on genuine bugs or errors that would cause the code to crash, produce wrong output, or behave incorrectly. Do not invent problems for optional style preferences, missing error handling, missing main functions, or other improvements that are not required for correctness. If the code has no actual bugs or errors, respond with explanation: "No issues found — this code works correctly as written," correctedCode: the same original code unchanged, quizQuestion: a simple question about what the code does or why it works, and mistakeCategory: "no issues". Only flag real, functional issues. Return only valid JSON with exactly these string fields: explanation, correctedCode, quizQuestion, mistakeCategory. Do not use Markdown code fences or add any other text.`;
const answerCheckInstruction = `You are a friendly coding teacher checking a student's answer to a quiz about code. Carefully compare the user's answer to the actual mistake in the code. If the user correctly identifies the core issue, even with different wording or a slightly broader description, mark it as correct. Do not mark a correct answer wrong because of wording differences. If the answer is vague, incomplete, or identifies the wrong issue, mark it as partially correct or incorrect and give a short, encouraging explanation. Return only valid JSON with exactly these fields: isCorrect (a boolean) and feedback (a string). Do not use Markdown code fences or add any other text.`;
const verifyInstruction = `You are a friendly coding teacher creating a practice challenge. Given buggy code and its underlying mistake, create a slightly modified version of the same code that contains the SAME TYPE of bug in a different spot or variation. Do not repeat the exact original bug. Return only valid JSON with exactly these string fields: modifiedCode and hint. The hint must be one short line and must not give away the answer. Do not use Markdown code fences or add any other text.`;
const verifyCheckInstruction = `You are a friendly coding teacher checking whether a student identified the same underlying coding mistake in a practice challenge. Return only valid JSON with exactly these fields: isCorrect (a boolean) and feedback (a short, encouraging string). Do not use Markdown code fences or add any other text.`;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

function getUserId(req) {
  return req.body?.userId || req.query?.userId || req.get('x-user-id') || req.headers['x-user-id'] || '';
}

app.post('/api/review', upload.single('file'), async (req, res) => {
  const code = req.body.code || req.file?.buffer?.toString('utf8') || '';
  const userId = getUserId(req);

  if (!code.trim()) {
    return res.status(400).json({ error: 'Please provide code to review.' });
  }

  if (typeof userId !== 'string' || !userId.trim()) {
    return res.status(401).json({ error: 'Please log in before reviewing code.' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'The Groq API key is not configured.' });
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: `Review this code:\n\n${code}` },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim().replace(/^```json\s*|\s*```$/g, '');
    if (!text) throw new Error('Groq returned an empty response.');
    const review = JSON.parse(text);

    if (typeof review.explanation !== 'string' || typeof review.correctedCode !== 'string' || typeof review.quizQuestion !== 'string' || typeof review.mistakeCategory !== 'string') {
      throw new Error('Groq returned an unexpected response format.');
    }

    const normalizedCategory = review.mistakeCategory?.trim();
    const isNoIssues = /(no issues|no issue)/i.test(normalizedCategory || '');

    if (supabase && normalizedCategory && !isNoIssues) {
      const { error: databaseError } = await supabase.from('mistakes').insert({
        user_id: userId,
        mistake_category: normalizedCategory,
      });
      if (databaseError) console.error('Supabase mistake insert failed:', databaseError.message);
    }

    return res.json({
      explanation: review.explanation,
      correctedCode: review.correctedCode,
      quizQuestion: review.quizQuestion,
      mistakeCategory: review.mistakeCategory,
    });
  } catch (error) {
    console.error('Groq review failed:', error.message);
    return res.status(502).json({ error: 'Unable to review this code right now. Please try again.' });
  }
});

app.get('/api/patterns', async (req, res) => {
  const userId = getUserId(req);

  if (typeof userId !== 'string' || !userId.trim()) {
    return res.status(401).json({ error: 'Please log in to view your patterns.' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured yet.' });
  }

  try {
    const { data, error } = await supabase.from('mistakes').select('mistake_category').eq('user_id', userId);
    if (error) throw error;

    const patterns = data.reduce((counts, row) => {
      const category = typeof row.mistake_category === 'string' ? row.mistake_category.trim() : '';
      if (!category) return counts;
      const normalizedKey = category.toLowerCase();
      counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
      return counts;
    }, {});
    return res.json({ patterns });
  } catch (error) {
    console.error('Supabase patterns fetch failed:', error.message);
    return res.status(502).json({ error: 'Unable to load your patterns right now.' });
  }
});

app.post('/api/check-answer', async (req, res) => {
  const { answer, quizQuestion, codeContext, mistakeType } = req.body;

  if (typeof answer !== 'string' || !answer.trim() || typeof quizQuestion !== 'string' || !quizQuestion.trim() || typeof codeContext !== 'string' || !codeContext.trim() || typeof mistakeType !== 'string' || !mistakeType.trim()) {
    return res.status(400).json({ error: 'Please provide your answer, quiz question, code context, and the identified mistake.' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'The Groq API key is not configured.' });
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: answerCheckInstruction },
        { role: 'user', content: `Original buggy code:\n${codeContext}\n\nSpecific bug found:\n${mistakeType}\n\nQuiz question asked:\n${quizQuestion}\n\nUser's answer:\n${answer}` },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim().replace(/^```json\s*|\s*```$/g, '');
    if (!text) throw new Error('Groq returned an empty response.');
    const result = JSON.parse(text);

    if (typeof result.isCorrect !== 'boolean' || typeof result.feedback !== 'string') {
      throw new Error('Groq returned an unexpected response format.');
    }

    return res.json({ isCorrect: result.isCorrect, feedback: result.feedback });
  } catch (error) {
    console.error('Groq answer check failed:', error.message);
    return res.status(502).json({ error: 'Unable to check your answer right now. Please try again.' });
  }
});

app.post('/api/verify', async (req, res) => {
  const { codeContext, mistakeType } = req.body;

  if (typeof codeContext !== 'string' || !codeContext.trim() || typeof mistakeType !== 'string' || !mistakeType.trim()) {
    return res.status(400).json({ error: 'Please provide the original code and mistake context.' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'The Groq API key is not configured.' });
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: verifyInstruction },
        { role: 'user', content: `Original buggy code:\n${codeContext}\n\nUnderlying mistake: ${mistakeType}` },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim().replace(/^```json\s*|\s*```$/g, '');
    if (!text) throw new Error('Groq returned an empty response.');
    const challenge = JSON.parse(text);

    if (typeof challenge.modifiedCode !== 'string' || typeof challenge.hint !== 'string') {
      throw new Error('Groq returned an unexpected response format.');
    }

    return res.json({ modifiedCode: challenge.modifiedCode, hint: challenge.hint });
  } catch (error) {
    console.error('Groq verify challenge failed:', error.message);
    return res.status(502).json({ error: 'Unable to create a practice challenge right now. Please try again.' });
  }
});

app.post('/api/verify-check', async (req, res) => {
  const { answer, modifiedCode, mistakeType } = req.body;

  if (typeof answer !== 'string' || !answer.trim() || typeof modifiedCode !== 'string' || !modifiedCode.trim() || typeof mistakeType !== 'string' || !mistakeType.trim()) {
    return res.status(400).json({ error: 'Please provide your answer and the practice challenge context.' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'The Groq API key is not configured.' });
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: verifyCheckInstruction },
        { role: 'user', content: `Underlying mistake to look for: ${mistakeType}\n\nPractice code:\n${modifiedCode}\n\nStudent answer: ${answer}` },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim().replace(/^```json\s*|\s*```$/g, '');
    if (!text) throw new Error('Groq returned an empty response.');
    const result = JSON.parse(text);

    if (typeof result.isCorrect !== 'boolean' || typeof result.feedback !== 'string') {
      throw new Error('Groq returned an unexpected response format.');
    }

    return res.json({ isCorrect: result.isCorrect, feedback: result.feedback });
  } catch (error) {
    console.error('Groq verify check failed:', error.message);
    return res.status(502).json({ error: 'Unable to check your practice answer right now. Please try again.' });
  }
});

app.listen(port, () => console.log(`Codexplain API listening on http://localhost:${port}`));
