export default async function handler(req,res){
  const origin=req.headers.origin||'';
  const allowed=origin==='https://reading-reader.vercel.app'||origin==='https://uzcustomer.github.io'||origin.endsWith('.vercel.app');
  res.setHeader('Access-Control-Allow-Origin',allowed?origin:'https://reading-reader.vercel.app');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','content-type');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!process.env.GEMINI_API_KEY)return res.status(500).json({error:'GEMINI_API_KEY is not configured'});
  try{
    const article=req.body?.article||{};
    const text=String(article.text||'');
    if(text.length<500)return res.status(400).json({error:'Article too short'});

    const prompt=`Create ONE IELTS Academic Reading-style sentence-completion question from the article below.

Rules:
- The QUESTION must PARAPHRASE the passage. Do not copy the source sentence and merely remove a word.
- The answer must be exactly ONE WORD taken verbatim from the supplied article.
- The passage excerpt should contain enough evidence to answer, ideally 2-4 sentences.
- Do not make the answer obvious by repeating the exact question wording in the passage.
- Use lexical and grammatical paraphrase similar to IELTS Academic Reading.
- The question must contain exactly one blank written as ________.
- Do not use outside facts.
- Return strict JSON only:
{
  "passage":"original excerpt from article",
  "question":"paraphrased sentence with ________",
  "answer":"one word from passage",
  "accept":["accepted answer"],
  "explanation":"brief explanation of the paraphrase/evidence"
}

ARTICLE:
${text}`;

    const models=['gemini-3.5-flash-lite','gemini-3.6-flash','gemini-3.8-flash'];
    let last='';
    for(const model of models){
      const url='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(process.env.GEMINI_API_KEY);
      const r=await fetch(url,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          contents:[{role:'user',parts:[{text:prompt}]}],
          generationConfig:{responseMimeType:'application/json',temperature:0.35,maxOutputTokens:1800}
        })
      });
      if(!r.ok){last=model+' '+r.status+' '+(await r.text()).slice(0,400);continue}
      const data=await r.json();
      const txt=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
      if(!txt){last=model+' empty response';continue}
      const out=JSON.parse(txt);
      if(!out.passage||!out.question||!out.answer||!/________/.test(out.question)){last=model+' invalid structure';continue}
      const answer=String(out.answer).trim();
      if(/\s/.test(answer)||!new RegExp('\\b'+answer.replace(/[.*+?^$()|[\]\\{}]/g,'\\$&')+'\\b','i').test(out.passage)){
        last=model+' answer not one word from passage';continue;
      }
      out.accept=Array.isArray(out.accept)&&out.accept.length?out.accept:[answer];
      return res.status(200).json(out);
    }
    return res.status(502).json({error:'Question generation failed',detail:last});
  }catch(e){
    return res.status(500).json({error:'Question generation failed',detail:String(e?.message||e)});
  }
}