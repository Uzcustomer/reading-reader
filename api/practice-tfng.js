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
    const text=String(req.body?.article?.text||''); if(text.length<700)return res.status(400).json({error:'Article too short'});
    const prompt=`Create ONE IELTS Academic Reading TRUE/FALSE/NOT GIVEN practice set from the article.
Rules:
- Select one coherent original passage excerpt of 180-300 words.
- Create exactly 4 statements.
- Statements must paraphrase the passage; do not copy distinctive wording.
- Include at least one TRUE, one FALSE and one NOT GIVEN.
- FALSE must directly contradict the passage.
- NOT GIVEN must be neither confirmed nor contradicted.
- Use plausible IELTS-style traps involving scope, cause, comparison, degree, time or attribution.
- No outside facts.
Return strict JSON only:
{"passage":"original excerpt","questions":[{"statement":"...","answer":"TRUE|FALSE|NOT GIVEN","explanation":"brief evidence/reasoning"}]}
ARTICLE:
${text}`;
    const models=['gemini-3.5-flash-lite','gemini-3.6-flash','gemini-3.8-flash'];let last='';
    for(const model of models){
      const url='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(process.env.GEMINI_API_KEY);
      const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.3,maxOutputTokens:2600}})});
      if(!r.ok){last=model+' '+r.status+' '+(await r.text()).slice(0,300);continue}
      const data=await r.json(),txt=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||''; if(!txt){last=model+' empty';continue}
      const out=JSON.parse(txt),qs=out.questions||[],vals=qs.map(q=>q.answer);
      if(!out.passage||qs.length!==4||!vals.includes('TRUE')||!vals.includes('FALSE')||!vals.includes('NOT GIVEN')){last=model+' invalid task';continue}
      return res.status(200).json(out);
    }
    return res.status(502).json({error:'TFNG generation failed',detail:last});
  }catch(e){return res.status(500).json({error:'TFNG generation failed',detail:String(e?.message||e)})}
}