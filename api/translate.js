function decodeHtml(s){
  return String(s||'')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&quot;/gi,'"')
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function normalizeUzbek(s){
  return decodeHtml(s)
    .replace(/\bg'/gi,m=>m[0]+ "‘")
    .replace(/\bo'/gi,m=>m[0]+ "‘");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://uzcustomer.github.io','https://reading-reader.vercel.app'];
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) || origin.endsWith('.vercel.app') ? origin : 'https://reading-reader.vercel.app');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({error:'GET only'});

  const q = String(req.query.q || '').trim().slice(0,120);
  const context = String(req.query.context || '').trim().slice(0,1200);
  const mode = String(req.query.mode || 'quick');
  if (!q) return res.status(400).json({error:'Missing q'});

  async function translate(text,pair){
    const url='https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair='+encodeURIComponent(pair);
    const r=await fetch(url,{headers:{'user-agent':'ReadingReader/1.5'}});
    if(!r.ok) throw new Error('translate '+r.status);
    const d=await r.json();
    return d && d.responseData ? decodeHtml(String(d.responseData.translatedText||'')) : '';
  }

  if(mode === 'ai'){
    if(!process.env.GEMINI_API_KEY) return res.status(500).json({error:'GEMINI_API_KEY is not configured'});
    if(!context) return res.status(400).json({error:'Context is required for AI translation'});
    try{
      const prompt = `You are a precise contextual translator for an English learner.

Selected word/phrase: "${q}"
Sentence/context: "${context}"

Determine what the selected word/phrase means specifically in this context.
Return STRICT JSON only:
{
  "ru": "natural Russian translation of the selected word/phrase in this context",
  "uz": "natural Uzbek translation of the selected word/phrase in this context",
  "en": "short simple English explanation of the meaning in this context",
  "note": "very short explanation of why this meaning fits the context"
}

Do not translate the whole sentence unless needed to explain the word. Prefer the contextual sense over the most common dictionary sense.`;

      const models=['gemini-3.5-flash-lite','gemini-3.6-flash'];
      let out=null,lastError='';
      outer: for(const model of models){
        for(let attempt=1;attempt<=3;attempt++){
          try{
            const url='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(process.env.GEMINI_API_KEY);
            const r=await fetch(url,{
              method:'POST',
              headers:{'content-type':'application/json'},
              body:JSON.stringify({
                contents:[{role:'user',parts:[{text:prompt}]}],
                generationConfig:{responseMimeType:'application/json',temperature:0.15,maxOutputTokens:700}
              })
            });
            if(!r.ok){
              const body=await r.text();
              lastError=model+' '+r.status+' '+body.slice(0,240);
              if((r.status===429||r.status===503)&&attempt<3){await new Promise(x=>setTimeout(x,350*attempt));continue}
              break;
            }
            const d=await r.json();
            const txt=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
            if(!txt){lastError=model+' empty response';break}
            out=JSON.parse(txt);out._model=model;break outer;
          }catch(err){lastError=model+' '+String(err?.message||err);if(attempt<3){await new Promise(x=>setTimeout(x,350*attempt));continue}break}
        }
      }
      if(!out){
        try{
          const [ru,uz]=await Promise.all([translate(context,'en|ru'),translate(context,'en|uz')]);
          return res.status(200).json({term:q,context,en:'',ru:'',uz:'',note:'AI temporarily unavailable. Showing full-context internet translation instead.',contextRu:decodeHtml(ru||''),contextUz:normalizeUzbek(uz||''),fallback:true});
        }catch(_e){return res.status(503).json({error:'AI translation temporarily unavailable',detail:'Gemini is busy. Please try again shortly.'})}
      }
      return res.status(200).json({
        term:q,
        context,
        en:String(out.en||''),
        ru:String(out.ru||''),
        uz:normalizeUzbek(String(out.uz||'')),
        note:String(out.note||''),model:String(out._model||'')
      });
    }catch(e){
      return res.status(502).json({error:'AI translation unavailable',detail:String(e.message||e)});
    }
  }

  try{
    const jobs=[translate(q,'en|ru'),translate(q,'en|uz')];
    if(context) jobs.push(translate(context,'en|ru'),translate(context,'en|uz'));
    const out=await Promise.all(jobs);
    return res.status(200).json({
      term:q,en:'',ru:decodeHtml(out[0]||''),uz:normalizeUzbek(out[1]||''),
      context,
      contextRu:context?decodeHtml(out[2]||''):'',
      contextUz:context?normalizeUzbek(out[3]||''):''
    });
  }catch(e){
    return res.status(502).json({error:'Translation service unavailable'});
  }
}