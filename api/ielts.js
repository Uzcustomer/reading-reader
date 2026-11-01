export const config = { runtime: 'edge' };

function cors(origin) {
  const allowed =
    origin === 'https://uzcustomer.github.io' ||
    origin === 'https://reading-reader.vercel.app' ||
    origin?.endsWith('.vercel.app') ||
    origin?.startsWith('http://localhost');
  return {
    'access-control-allow-origin': allowed ? origin : 'https://reading-reader.vercel.app',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8'
  };
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const headers = cors(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });
  }
  if (!process.env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }), { status: 500, headers });
  }

  try {
    const body = await req.json();
    const article = body?.article || {};
    const count = body?.count === 10 ? 10 : 13;
    const vocab = Array.isArray(body?.vocabulary) ? body.vocabulary.slice(-30) : [];

    if (!article.text || String(article.text).length < 500) {
      throw new Error('Article text is too short');
    }

    const instructions = `Create an IELTS Academic Reading practice test that closely resembles the real exam in style and reasoning difficulty, but never claim it is an official IELTS test.

Use ONLY the supplied article as the factual source. Do not add outside facts.

Adapt the source into one coherent academic reading passage of about 700-900 words when the source length permits. Preserve factual meaning while improving cohesion and academic readability.

Use authentic IELTS Academic Reading difficulty: strong paraphrase, lexical variation, reference chains, inference and plausible distractors. Do not simplify the passage to a preselected band.

Create exactly ${count} questions using 3-4 IELTS-style task types selected from:
- matching_headings
- true_false_not_given
- sentence_completion
- multiple_choice
- matching_information

Rules:
- Avoid trivial exact-word matching.
- Every answer must be decisively supported by the adapted passage.
- Sentence-completion answers must be short and taken from the passage.
- For true_false_not_given, options must be ["TRUE","FALSE","NOT GIVEN"].
- For multiple_choice, provide exactly four options.
- For matching tasks, options must contain the headings or labels needed for that item.
- Explanations must briefly identify the evidence and reasoning without long quotations.
- Personal vocabulary may be used naturally only when relevant to the source; never force it.

Return JSON only with this structure:
{
  "title": "string",
  "sourceTitle": "string",
  "band": "string",
  "passage": "string",
  "questions": [
    {
      "id": 1,
      "type": "string",
      "label": "string",
      "question": "string",
      "options": [],
      "answer": "string",
      "accept": ["string"],
      "explanation": "string"
    }
  ]
}`;

    const payload = {
      contents: [{
        role: 'user',
        parts: [{
          text: instructions + '\n\nSOURCE ARTICLE:\n' + JSON.stringify({
            title: article.title || '',
            source: article.source || '',
            text: String(article.text),
            personal_vocabulary: vocab.map(v => ({ term: v.term, en: v.en }))
          })
        }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.45,
        maxOutputTokens: 12000
      }
    };

    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=' +
      encodeURIComponent(process.env.GEMINI_API_KEY);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({
        error: 'Gemini request failed',
        detail: err.slice(0, 700)
      }), { status: 502, headers });
    }

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text || '')
        .join('')
        .trim() || '';

    if (!text) throw new Error('Gemini returned an empty response');

    const out = JSON.parse(text);
    if (!Array.isArray(out.questions) || out.questions.length !== count || !out.passage) {
      throw new Error('Gemini returned invalid test structure');
    }

    out.band = String(out.band || '');
    out.sourceTitle = out.sourceTitle || article.title || '';

    return new Response(JSON.stringify(out), { status: 200, headers });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e?.message || 'Unknown error' }),
      { status: 400, headers }
    );
  }
}
