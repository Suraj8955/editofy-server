const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));
if(!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if(!fs.existsSync('outputs')) fs.mkdirSync('outputs');
const upload = multer({ dest: 'uploads/', limits: { fileSize: 500 * 1024 * 1024 } });
app.get('/', (req,res)=> res.send('Editofy server running'));
app.post('/merge', upload.array('videos', 10), (req,res)=>{
  try{
    const files = req.files || [];
    if(!files.length) return res.status(400).json({error:'No videos'});
    const outName = 'editofy-' + Date.now() + '.mp4';
    const outPath = path.join('outputs', outName);
    const args = [];
    files.forEach(f=>{ args.push('-i', f.path); });
    let filter = '';
    files.forEach((f,i)=>{
      filter += `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p,fps=30,setpts=PTS-STARTPTS[v${i}];`;
      filter += `[${i}:a]aresample=44100,atrim=duration=90,asetpts=PTS-STARTPTS[a${i}];`;
    });
    let concatInputs = '';
    files.forEach((f,i)=>{ concatInputs += `[v${i}][a${i}]`; });
    filter += `${concatInputs}concat=n=${files.length}:v=1:a=1[vout][aout]`;
    args.push('-filter_complex', filter, '-map','[vout]','-map','[aout]','-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart','-y', outPath);
    console.log('RUN:', args.join(' '));
    const ff = spawn('ffmpeg', args);
    let log = '';
    ff.stderr.on('data', d=>{ log += d.toString(); console.log(d.toString()); });
    ff.on('close', code=>{
      files.forEach(f=>{ try{ fs.unlinkSync(f.path); }catch(e){} });
      if(code!==0) return res.status(500).json({error:'ffmpeg failed', log: log.slice(-2000)});
      res.json({ url: '/download/' + outName, file: outName });
    });
    ff.on('error', e=> res.status(500).json({error: e.message}));
  }catch(e){ res.status(500).json({error: e.message}); }
});
app.get('/download/:f', (req,res)=>{
  const p = path.join('outputs', path.basename(req.params.f));
  if(!fs.existsSync(p)) return res.status(404).send('Not found');
  res.download(p);
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log('Running '+PORT));
