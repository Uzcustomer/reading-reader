export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://uzcustomer.github.io','https://reading-reader.vercel.app'];
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : 'https://reading-reader.vercel.app');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({error:'GET only'});

  const q = String(req.query.q || '').trim().slice(0,120);
  const context = String(req.query.context || '').trim().slice(0,900);
  if (!q) return res.status(400).json({error:'Missing q'});

  async function translate(text,pair){
    const url='https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair='+encodeURIComponent(pair);
    const r=await fetch(url,{headers:{'user-agent':'ReadingReader/1.5'}});
    if(!r.ok) throw new Error('translate '+r.status);
    const d=await r.json();
    return d && d.responseData ? String(d.responseData.translatedText||'') : '';
  }

  try{
    const jobs=[translate(q,'en|ru'),translate(q,'en|uz')];
    if(context) jobs.push(translate(context,'en|ru'),translate(context,'en|uz'));
    const out=await Promise.all(jobs);
    return res.status(200).json({
      term:q,en:'',ru:out[0]||'',uz:out[1]||'',
      context,
      contextRu:context?(out[2]||''):'',
      contextUz:context?(out[3]||''):''
    });
  }catch(e){
    return res.status(502).json({error:'Translation service unavailable'});
  }
}