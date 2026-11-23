const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('outputs')) fs.mkdirSync('outputs');
app.get('/', (req,res)=> res.send('Editofy server running'));

app.post('/merge', upload.array('videos', 5), async (req,res)=>{
  if(!req.files || req.files.length===0) return res.json({error:'Video nahi mila'});
  const files = req.files;
  const outName = 'editofy-'+Date.now()+'.mp4';
  const outPath = path.join('outputs', outName);
  try{
    let inputs = files.map(f=>`-i "${f.path}"`).join(' ');
    let filters = [];
    // Har clip ke liye: Cinematic Color + Voice Clean + Same Audio
    for(let i=0;i<files.length;i++){
      // Video: scale 1080x1920 + cinematic color eq
      filters.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p,fps=30,settb=AVTB,eq=contrast=1.08:saturation=1.15:brightness=0.02,trim=duration=90[v${i}]`);
      // Audio: highpass-lowpass se wind noise kam + dynaudnorm se same level
      filters.push(`[${i}:a]aresample=44100,highpass=f=80,lowpass=f=12000,dynaudnorm,volume=1.0,atrim=duration=90[a${i}]`);
    }
    // Joining - Remove Gap - Concat se 0 sec gap
    let vList = files.map((_,i)=>`[v${i}]`).join('');
    let aList = files.map((_,i)=>`[a${i}]`).join('');
    filters.push(`${vList}${aList}concat=n=${files.length}:v=1:a=1[vout][aout]`);
    let filterStr = filters.join(';');
    // Watermark - Editofy likha aayega
    let cmd = `ffmpeg -y ${inputs} -filter_complex "${filterStr}" -map "[vout]" -map "[aout]" -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${outPath}"`;
    console.log('RUN:', cmd);
    await execAsync(cmd);
    files.forEach(f=>{ if(fs.existsSync(f.path)) fs.unlinkSync(f.path); });
    res.json({ url: `/download/${outName}` });
  }catch(e){
    console.log('ERROR:', e.message);
    files.forEach(f=>{ if(fs.existsSync(f.path)) fs.unlinkSync(f.path); });
    res.json({ error: 'Edit fail: ' + e.message.slice(0,300) });
  }
});
app.get('/download/:name', (req,res)=>{
  const p = path.join('outputs', req.params.name);
  if(fs.existsSync(p)) res.download(p);
  else res.json({error:'File nahi mili'});
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server LIVE '+PORT));
