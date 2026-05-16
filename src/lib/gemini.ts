import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? '';

export const geminiEnabled = !!apiKey;

const gemini = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// gemini-1.5-flash was retired from v1beta. Use a current model.
const MODEL = 'gemini-2.5-flash';

export async function generateSkillScenario(skill: string): Promise<string> {
  if (!gemini) return fallbackScenario(skill);
  const model = gemini.getGenerativeModel({ model: MODEL });
  const prompt = `You are writing a single live-assessment scenario for a candidate who claims this skill:

"${skill}"

The scenario must sit inside the *actual day-to-day working context* of that skill, NOT a generic survival or post-collapse setting. For example:
- If the skill is software engineering (any specialisation), the scenario is about code, systems, bugs, design — possibly with concrete snippets, error messages, stack traces.
- If the skill is C programming, the scenario must involve C: pointers, memory, undefined behaviour, build flags, embedded constraints, etc.
- If the skill is diesel mechanics, the scenario is about diesel engines.
- If the skill is paediatric medicine, the scenario is a paediatric case.
Match the granularity and specialisation in the candidate's wording. A general skill gets a general scenario; a specialised skill gets a specialised one.

Constraints:
- 2–5 sentences. One paragraph or a short paragraph + a short code/data block if it clarifies.
- Concrete, present tense. End with the exact decision or output you want the candidate to produce.
- Test practical professional judgement, not textbook trivia.
- No preamble, no multiple choice, no markdown headers, no "Scenario:" label. Just the scenario itself.

Return only the scenario text.`;
  try {
    const res = await model.generateContent(prompt);
    const text = res.response.text().trim();
    return text || fallbackScenario(skill);
  } catch (e) {
    console.warn('Gemini scenario generation failed, falling back', e);
    return fallbackScenario(skill);
  }
}

export interface AiGrade {
  score: number;
  verdict: 'approve' | 'reject' | 'borderline';
  rationale: string;
}

export async function gradeSkillAnswer(
  skill: string,
  question: string,
  answer: string,
): Promise<AiGrade> {
  if (!gemini) return fallbackGrade(answer);
  const model = gemini.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: 'application/json' },
  });
  const prompt = `You are grading a live skill assessment for someone claiming this skill:

"${skill}"

Grade them as a senior practitioner of that exact skill would. If the skill is a specialisation (e.g. "Software engineering — embedded C"), grade against that specialisation's standards, not a generic version.

Scenario:
${question}

Candidate's answer:
${answer}

Reply with a single JSON object, no markdown, no commentary, matching exactly:
{
  "score": <integer 0-100>,
  "verdict": "approve" | "reject" | "borderline",
  "rationale": "<one to two sentences, max 240 chars, plain text>"
}

Verdict rules:
- "approve": clearly correct, demonstrates real practical judgement at the claimed level. A peer in the field would trust this person to do this work.
- "reject": wrong, dangerous, vague to the point of uselessness, or shows the candidate doesn't actually know the skill they claim.
- "borderline": right idea but missing important steps, partially correct, or correct but at a lower level of skill than claimed.`;
  try {
    const res = await model.generateContent(prompt);
    const raw = res.response.text().trim();
    const parsed = JSON.parse(raw) as Partial<AiGrade>;
    const score = clampScore(parsed.score);
    const verdict =
      parsed.verdict === 'approve' || parsed.verdict === 'reject' || parsed.verdict === 'borderline'
        ? parsed.verdict
        : score >= 70
          ? 'approve'
          : score >= 40
            ? 'borderline'
            : 'reject';
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 240) : '';
    return { score, verdict, rationale };
  } catch (e) {
    console.warn('Gemini grading failed, falling back', e);
    return fallbackGrade(answer);
  }
}

function clampScore(n: unknown): number {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function fallbackGrade(answer: string): AiGrade {
  const len = answer.trim().length;
  const score = Math.min(100, Math.round(len / 4));
  const verdict: AiGrade['verdict'] =
    score >= 70 ? 'approve' : score >= 40 ? 'borderline' : 'reject';
  return {
    score,
    verdict,
    rationale: 'Gemini key not set — grading by answer length as a stub. Set VITE_GEMINI_API_KEY for real grading.',
  };
}

function fallbackScenario(skill: string): string {
  const map: Record<string, string> = {
    Medicine:
      'A child arrives with a deep, jagged laceration on the forearm, bleeding heavily. Antiseptic is gone but you have honey, clean water, and torn cloth. The mother says the wound is three hours old. Walk through your next five minutes.',
    Surgery:
      'A man with a clearly displaced compound fracture of the lower leg is brought to you. You have lidocaine, a hand drill, and salvaged orthopedic pins, but no fluoroscopy. Describe what you would do before the hour is out.',
    Engineering:
      'A bridge over a 12m gap was washed out. You have 40 mature pine logs (~6m), salvaged steel cable, and a community of 15 willing workers. Outline how you would span it within two days and what failure modes you would design against.',
    Electrical:
      'A village micro-grid keeps tripping every evening once five houses draw power. You have a multimeter and clamp meter, no oscilloscope. What sequence of tests do you run and what is your top hypothesis?',
    Plumbing:
      'A communal well pump pulls air after every drought week. Galvanised pipe, manual hand pump, no spare parts. Describe how you diagnose whether it is a foot valve, a crack in the riser, or aquifer drawdown.',
    Agriculture:
      'Three of your eight tomato beds show curling leaves and black-spotted stems while the rest are healthy. No lab access. Walk through what you check, what you cull, and how you protect next season.',
    Defense:
      'You spot a five-person armed group an hour out from your settlement, moving in your direction. You have nine adults, four firearms, and good elevation. Describe your decision in the next ten minutes.',
    Teaching:
      'You are given fourteen children, ages 6–13, mixed literacy. You have chalk, scrap paper, and three intact textbooks. Outline how you structure the first month so every child can read a basic instruction sheet.',
    Pharmacy:
      'Someone hands you four unlabelled blister packs scavenged from a clinic. Describe how you identify which (if any) are safe to use, and which you would discard outright.',
    Construction:
      'You need to put up a six-person shelter before the first frost in three weeks, on uneven ground with reclaimed timber. Describe foundation, frame, and roof decisions and your biggest risk.',
  };
  return (
    map[skill] ??
    `Describe a real situation where someone with the skill "${skill}" would have to act decisively with limited resources, and walk through what you would do.`
  );
}
