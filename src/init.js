let express = require('express'),
    bodyParser = require('body-parser'),
    helmet = require('helmet'),
	{ get } = require('node-superfetch'),
	fs = require('fs'),
    path = require('path'),
    fileType = require('file-type'),
    fileUpload = require('express-fileupload'),
    datebase = new (require(path.resolve(__dirname, './Libs/Datebase.js')))(...require(path.resolve(__dirname, './db.js'))),
	cacheDir = path.resolve(__dirname, '../cache'),
    app = express();

app.use(require('compression')({
	level: 9,
	memLevel: 9
}))
app.use(helmet());
app.use(bodyParser.text());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true,
}));

app.use(fileUpload({
}));

if(!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

app.get('/', async (req, res, next) => {
    res.redirect('https://esponjosin.xyz');
})

app.get('/status', async (req, res, next) => {
    
	console.log('Generating report...')
	
	let startTime = process.hrtime();
    let data = await datebase.generateReport()
    
	let endTime = ((process.hrtime(startTime)[0] * 1e9) + process.hrtime(startTime)[1]) / 1e6;
	
	console.log(`Report generated in ${endTime}ms`)
	
    res.json(data)

})

app.get('/upload', async(req, res, next) => {
	
	console.log('Creating file from a url')
	
	let url = req.url.replace('/upload?url=', '');
	
	if(url.length < 10) return res.sendStatus(400);
	
	console.log('Downloading file...')
	let startTime = process.hrtime();
	
	let body = await get(url).then(i => i.body).catch(e => new Object({ error: e }));
	
	let endTime = ((process.hrtime(startTime)[0] * 1e9) + process.hrtime(startTime)[1]) / 1e6;
	
	if(typeof body == 'object' && body.error) {
		console.log('An error occurred while trying to download the file')
		console.log(body.error)
		return res.sendStatus(400);
	}
	console.log(`File downloaded in ${endTime}ms`)
	 
	let path_ = await datebase.createFile(body);
	
	fs.writeFileSync(path.resolve(cacheDir, path_), body);
	
	return res.json({
		url: path_
	})
	
})
app.post('/upload', async (req, res, next) => {
	
    console.log('A file of a post request was received');
	
    let path_ = await datebase.createFile(req.files.file.data);
	
	fs.writeFileSync(path.resolve(cacheDir, path_), req.files.file.data);

    res.json({
        url: `${path_}`
    })

})

app.get('/:id', async (req, res, next) => {
    
	console.log('A request was received to get a file, indexing...');
	
	
	try {
		
		let file = await fs.readFileSync(path.resolve(cacheDir, req.params.id))
		console.log('The file was already in the static cache, sending')
		
		let m = await fileType.fromBuffer(file).then(i => i.mime);

		res.writeHead(200, {
			"Content-Type": m,
			"Content-Length": file.length
		})

		return res.end(file)
		
	} catch(e) {}
	
    let data = await datebase.findFile(req.params.id)
    
    if(!data) {
		console.log('File not found');
		return res.json({
			error: 'File not found'
		});
	}

    let { mime } = await fileType.fromBuffer(data);

	console.log('Sending file');

    res.writeHead(200, {
        "Content-Type": mime,
        "Content-Length": data.length
    })

    res.end(data)
	
	fs.writeFileSync(path.resolve(cacheDir, req.params.id), data);


})

datebase.finish().then(() => app.listen(process.env.PORT || process.env.port || 3000, () => {
    console.log('Server on port', process.env.PORT || process.env.port || 3000)
}))