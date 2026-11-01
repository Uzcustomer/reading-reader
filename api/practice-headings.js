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
    const text=String(req.body?.article?.text||''); if(text.length<900)return res.status(400).json({error:'Article too short'});
    const prompt=`Create ONE IELTS Academic Reading MATCHING HEADINGS task from the article.
Rules:
- Select exactly 4 substantial original paragraphs.
- Create exactly 6 headings: 4 correct + 2 plausible distractors.
- A correct heading must capture the MAIN IDEA of a paragraph, not a detail.
- Headings must be paraphrased/abstract and should not copy distinctive wording from the paragraph.
- Distractors must be plausible but not the best main idea for any paragraph.
- Each paragraph must have exactly one best heading.
- No outside facts.
Return strict JSON only:
{"headings":["...","...","...","...","...","..."],"paragraphs":[{"text":"original paragraph","answerIndex":0,"explanation":"why this is the main idea"}]}
ARTICLE:
${text}`;
    const models=['gemini-3.5-flash-lite','gemini-3.6-flash','gemini-3.8-flash'];let last='';
    for(const model of models){
      const url='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(process.env.GEMINI_API_KEY);
      const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.25,maxOutputTokens:5000}})});
      if(!r.ok){last=model+' '+r.status+' '+(await r.text()).slice(0,300);continue}
      const data=await r.json(),txt=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||''; if(!txt){last=model+' empty';continue}
      const out=JSON.parse(txt);
      if(!Array.isArray(out.headings)||out.headings.length!==6||!Array.isArray(out.paragraphs)||out.paragraphs.length!==4){last=model+' invalid task';continue}
      if(out.paragraphs.some(p=>!Number.isInteger(+p.answerIndex)||+p.answerIndex<0||+p.answerIndex>5)){last=model+' bad answers';continue}
      return res.status(200).json(out);
    }
    return res.status(502).json({error:'Headings generation failed',detail:last});
  }catch(e){return res.status(500).json({error:'Headings generation failed',detail:String(e?.message||e)})}
}