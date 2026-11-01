export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin === 'https://uzcustomer.github.io' ? origin : 'https://uzcustomer.github.io');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({error:'GET only'});
  const q = String(req.query.q || '').trim().slice(0,120);
  if (!q) return res.status(400).json({error:'Missing q'});
  async function tr(pair){
    const url='https://api.mymemory.translated.net/get?q='+encodeURIComponent(q)+'&langpair='+encodeURIComponent(pair);
    const r=await fetch(url);
    if(!r.ok) throw new Error('translate '+r.status);
    const d=await r.json();
    return d && d.responseData ? String(d.responseData.translatedText||'') : '';
  }
  try{
    const [ru,uz] = await Promise.all([tr('en|ru'),tr('en|uz')]);
    return res.status(200).json({term:q,en:'',ru,uz});
  }catch(e){
    return res.status(502).json({error:'Translation service unavailable'});
  }
}