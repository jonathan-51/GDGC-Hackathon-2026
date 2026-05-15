import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? '';

export const gemini = new GoogleGenerativeAI(apiKey);

export const getGeminiModel = (model = 'gemini-1.5-flash') =>
  gemini.getGenerativeModel({ model });
