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
    const title=String(req.body?.title||'').slice(0,300);
    const source=String(req.body?.source||'').slice(0,300);
    const text=String(req.body?.text||'');
    if(text.length<100)return res.status(400).json({error:'Article text is too short'});
    if(text.length>60000)return res.status(400).json({error:'Article text is too long'});

    const prompt=`Translate the following English article into natural, accurate Uzbek (Latin script) for an educated reader.

Requirements:
- Preserve the full meaning and all factual details.
- Do not summarise, omit, add, fact-check or rewrite the argument.
- Preserve paragraph breaks.
- Keep proper names, organisations and technical terms accurate.
- Use modern literary Uzbek in Latin script, including correct o‘ and g‘ characters where appropriate.
- Render idioms naturally in Uzbek while preserving tone.
- Output only the Uzbek translation, no commentary, no markdown labels.

TITLE: ${title}
SOURCE: ${source}

ARTICLE:
${text}`;

    const models=['gemini-3.5-flash-lite','gemini-3.6-flash','gemini-3.8-flash'];
    let last='';
    for(const model of models){
      for(let attempt=1;attempt<=2;attempt++){
        const url='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(process.env.GEMINI_API_KEY);
        const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.1,maxOutputTokens:24000}})});
        if(!r.ok){
          last=model+' '+r.status+' '+(await r.text()).slice(0,350);
          if((r.status===429||r.status===503)&&attempt<2){await new Promise(x=>setTimeout(x,500));continue}
          break;
        }
        const d=await r.json();
        const out=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
        if(out.length>100)return res.status(200).json({translation:out,model});
        last=model+' empty response';
      }
    }
    return res.status(503).json({error:'Article translation temporarily unavailable',detail:last});
  }catch(e){
    return res.status(500).json({error:'Article translation failed',detail:String(e?.message||e)});
  }
}