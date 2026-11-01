export const config = { runtime: 'edge' };

function cors(origin) {
  const allowed = origin === 'https://uzcustomer.github.io' || origin?.startsWith('http://localhost');
  return {
    'access-control-allow-origin': allowed ? origin : 'https://uzcustomer.github.io',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8'
  };
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'POST only'}), {status:405,headers});
  if (!process.env.OPENAI_API_KEY) return new Response(JSON.stringify({error:'OPENAI_API_KEY is not configured'}), {status:500,headers});

  try {
    const body = await req.json();
    const article = body?.article || {};
    const band = ['6.5','7.0','7.5','8.0'].includes(String(body?.band)) ? String(body.band) : '7.0';
    const count = body?.count === 10 ? 10 : 13;
    const vocab = Array.isArray(body?.vocabulary) ? body.vocabulary.slice(-30) : [];
    if (!article.text || String(article.text).length < 500) throw new Error('Article text is too short');

    const instructions = `You create IELTS Academic Reading practice that closely resembles the real exam in style and reasoning difficulty, but must not claim to be an official IELTS test. Use ONLY the supplied article as the factual source. Do not add outside facts. Adapt it into one coherent academic reading passage of about 700-900 words when source length permits. Preserve factual meaning while improving cohesion and academic readability. Target difficulty around IELTS Band ${band}: use paraphrase, reference chains, inference and lexical variation appropriate to that level. Create exactly ${count} questions across 3-4 IELTS-style task types chosen from: matching_headings, true_false_not_given, sentence_completion, multiple_choice, matching_information. Avoid trivial word matching. Every answer must be decisively supported by the adapted passage. Sentence-completion answers should be short and taken from the passage. Return STRICT JSON only, no markdown, with keys: title, sourceTitle, band, passage, questions. Each question object must have: id, type, label, question, options (array or []), answer, accept (array of accepted answers), explanation. For T/F/NG, options must be ["TRUE","FALSE","NOT GIVEN"]. For multiple choice, provide exactly four options. For matching tasks, options must contain the headings/labels needed for that item. Explanations should briefly identify the evidence without quoting long passages. Personal vocabulary may be used naturally in questions only if it appears in or is relevant to the supplied source; never force it.`;

    const user = {
      title: article.title || '',
      source: article.source || '',
      text: String(article.text),
      personal_vocabulary: vocab.map(v => ({term:v.term,en:v.en}))
    };

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{'authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},
      body:JSON.stringify({
        model:'gpt-6.1-sol',
        input:[
          {role:'system',content:instructions},
          {role:'user',content:JSON.stringify(user)}
        ]
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({error:'AI request failed',detail:err.slice(0,500)}), {status:502,headers});
    }
    const data = await resp.json();
    let text = data.output_text || '';
    if (!text && Array.isArray(data.output)) {
      text = data.output.flatMap(o=>o.content||[]).map(c=>c.text||'').join('');
    }
    text = text.trim().replace(/^\`\`\`json\s*/i,'').replace(/\`\`\`$/,'').trim();
    const out = JSON.parse(text);
    if (!Array.isArray(out.questions) || out.questions.length !== count || !out.passage) throw new Error('Model returned invalid test structure');
    return new Response(JSON.stringify(out), {status:200,headers});
  } catch (e) {
    return new Response(JSON.stringify({error:e.message || 'Unknown error'}), {status:400,headers});
  }
}
