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
    const body=req.body||{};
    const title=String(body.title||'').slice(0,300);
    const source=String(body.source||'').slice(0,300);
    const text=String(body.text||'');
    if(text.length<300)return res.status(400).json({error:'Article text is too short'});
    if(text.length>50000)return res.status(400).json({error:'Article text is too long'});

    const prompt=`You repair text extracted from a multi-column magazine PDF for an English learner.

ARTICLE TITLE: ${title}
SOURCE: ${source}

The supplied text may contain:
- sentences interleaved between adjacent PDF columns;
- words split at line/column boundaries (for example "Pra- bowo", "depen- dable");
- duplicated lines or headings;
- misplaced continuation fragments;
- OCR-like spacing/ligature artefacts.

TASK:
1. Restore the most plausible original reading order using ONLY the supplied text.
2. Join words that were split only by layout.
3. Remove obvious accidental duplicate fragments caused by extraction.
4. Preserve every factual statement and the article's wording as closely as possible.
5. Do NOT summarise, paraphrase, modernise, fact-check, invent missing facts, or add outside information.
6. If a fragment cannot be confidently placed, keep it rather than deleting it.
7. Preserve paragraph breaks where they are inferable.
8. Output only the repaired full article text. No commentary, markdown, JSON, or labels.

TEXT:
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
          generationConfig:{temperature:0.05,maxOutputTokens:20000}
        })
      });
      if(!r.ok){last=model+' '+r.status+' '+(await r.text()).slice(0,400);continue}
      const d=await r.json();
      const out=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
      if(out.length>=300)return res.status(200).json({text:out,model});
      last=model+' empty/short response';
    }
    return res.status(502).json({error:'AI repair failed',detail:last});
  }catch(e){
    return res.status(500).json({error:'AI repair failed',detail:String(e?.message||e)});
  }
}