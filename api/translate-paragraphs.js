export default async function handler(req,res){
  const origin=req.headers.origin||'';
  const allowed=!origin||origin==='https://reading-reader.vercel.app'||origin==='https://uzcustomer.github.io'||origin.endsWith('.vercel.app');
  res.setHeader('Access-Control-Allow-Origin',allowed?origin:'https://reading-reader.vercel.app');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','content-type');
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!process.env.GEMINI_API_KEY)return res.status(500).json({error:'GEMINI_API_KEY is not configured'});
  try{
    const paragraphs=req.body?.paragraphs;
    if(!Array.isArray(paragraphs)||paragraphs.length<1||paragraphs.length>55||paragraphs.some(p=>typeof p!=='string')||JSON.stringify(paragraphs).length>25000)
      return res.status(400).json({error:'Invalid paragraph list'});
    const prompt='Translate each numbered paragraph from English to accurate natural literary Uzbek in Latin script. Preserve all facts and detail; do not summarise. Translate every input paragraph separately, keeping the exact input order. Respond with ONLY a JSON array containing precisely '+paragraphs.length+' Uzbek strings, one for each input paragraph. No headings, commentary or markdown.\n\n'+JSON.stringify(paragraphs);
    let last='';
    for(const model of ['gemini-3.8-flash','gemini-3.5-flash-lite']){
      try{
        const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(process.env.GEMINI_API_KEY),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.1,maxOutputTokens:24000,responseMimeType:'application/json'}})});
        if(!response.ok){last=model+' '+response.status+' '+(await response.text()).slice(0,220);continue}
        const data=await response.json();
        const content=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
        const translated=JSON.parse(content);
        if(!Array.isArray(translated)||translated.length!==paragraphs.length||translated.some(p=>typeof p!=='string'||p.length<2))throw new Error('Response missing paragraphs');
        return res.status(200).json({translations:translated,model});
      }catch(err){last=model+': '+String(err?.message||err)}
    }
    return res.status(503).json({error:'Translation unavailable',detail:last});
  }catch(err){return res.status(500).json({error:'Translation error',detail:String(err?.message||err)})}
}