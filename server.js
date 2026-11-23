const express=require('express');
const multer=require('multer');
const {exec}=require('child_process');
const fs=require('fs');
const path=require('path');
const app=express();
app.use(require('cors')());
app.use(express.json());
app.use(express.static('.'));
const upload=multer({dest:'uploads/'});
app.get('/',(req,res)=>res.send('Editofy server running'));
app.post('/merge',upload.array('videos'),(req,res)=>{
  const files=req.files.map(f=>f.path);
  const list='list.txt';
  fs.writeFileSync(list,files.map(f=>`file '${path.resolve(f)}'`).join('\n'));
  const out='output_'+Date.now()+'.mp4';
  exec(`ffmpeg -f concat -safe 0 -i ${list} -c copy ${out}`,(err)=>{
    if(err) return res.status(500).send('ffmpeg error');
    res.download(out,()=>{
      files.forEach(f=>fs.unlinkSync(f)); fs.unlinkSync(list); fs.unlinkSync(out);
    });
  });
});
app.listen(process.env.PORT||3000);
