const mongoose = require('mongoose'),
    path = require('path'),
    wait = ms => new Promise((resolve, reject) => setTimeout(resolve, ms)),
	zlib = require('zlib'),
    str = 'qwertyuiopasdfghjklzxvbnmQWERTYUIOPASDFGHJKLZXCVBNM',
    rID = (length=5) => [...new Array(length)].map(x => str.charAt(Math.floor(Math.random() * str.length))).join('');
    fileType = require('file-type');

module.exports = class Datebase {

    constructor(...uris) {

        this.init(...uris);
        this.check();

    }
	
	/*
	 Small system to check if any mongo cluster is saturated
	*/

    async check() {

        return new Promise(async (resolve, reject) => {

            do {
                await wait(500)
            } while(!this.db);
            
            do {
            
                for(var db of this.db) {

                    let files = await db.fileData.find({});

                    if(files && files.length) {

                        let stats = await db.fileData.collection.stats();
                        
                        if(((stats.storageSize / 1024) / 1024) > 490) {

                            files = files.sort((a, b) => a.createdAt - b.createdAt);

                            do {

                                await files[0].remove();
                                files = files.slice(1);
                                db.size--
                                stats = await db.fileData.collection.stats();

                            } while(((stats.storageSize / 1024) / 1024).toFixed(0) > 300)

                        }

                    }
                
                }

                await wait(60000)

            } while(true);

        })

    }
	
	/*
	 Start the connection with all clusters
	*/

    async init(...uris) {

        this.connections = await Promise.all(uris.map(x => mongoose.createConnection(x.uri, { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true })))

        let db = []

        for(var i=0; i < uris.length; i++) {

            let m = this.connections[i].model("File", require(path.resolve(__dirname, '../Models/File.js')))

            db.push({
                db: this.connections[i],
                id: uris[i].id,
                fileData: m,
                size: await m.countDocuments()
            })

        }

        this.db = db;

    }
	
	/*
	 Get all the data from the clusters
	*/

    async generateReport() {

        let json = {}

        for(var db of this.db.sort((a, b) => Number(a.id) - Number(b.id))) {

            let stats = await db.fileData.collection.stats()

            json[`Cluster-${db.id}`] = {
                files: stats.count,
                size: `${((stats.storageSize / 1024) / 1024).toFixed(2)} Mb`,
                totalIndexSize: stats.totalIndexSize
            }

        }

        return json

    }
	
	/*
	 Function to get the file from the clusters
	*/

    async findFile(id) {

        if(!id.includes('.')) return false;

        let [unique, type] = id.split('.');

        let db = unique.replace(/\D/g, "");
        unique = unique.replace(db, '');

        let index = this.db.findIndex(x => x.id == Number(db));

        if(index == -1) return false;
        db = this.db[index];

		let startTime = process.hrtime();
        let file = await db.fileData.findOne({ id: unique, type: type });
        if(!file) return false;
        let endTime = ((process.hrtime(startTime)[0] * 1e9) + process.hrtime(startTime)[1]) / 1e6;
		console.log(`File found in ${endTime}ms`)
		
		console.log('Converting string base64 to buffer...')
		startTime = process.hrtime();
		let buff = await zlib.gunzipSync(Buffer.from(file.base64, 'base64'));
		endTime = ((process.hrtime(startTime)[0] * 1e9) + process.hrtime(startTime)[1]) / 1e6;
		console.log(`The conversion took ${endTime}ms`)
		return buff;
		
    }
	
	/*
	 Function to create the file in the clusters
	*/

    async createFile(buffer) {

        let bestDB = this.db.sort((a, b) => a.size - b.size),
            db = bestDB[0],
            id;
        
		let uniqueID;
		
        do {
			
            id = rID(20);
			uniqueID = await db.fileData.findOne({ id: id }).then(i => false).catch(e => true);
			
        } while(uniqueID);
		
		console.log('Compressing file...')
		let startTime = process.hrtime();
		
		let buff = await zlib.gzipSync(buffer, {
			level: 9,
			memLevel: 9
		})
        let endTime = ((process.hrtime(startTime)[0] * 1e9) + process.hrtime(startTime)[1]) / 1e6;
		console.log(`Compression finished in ${endTime}ms`)
		
		console.log(`Saving file in database...`)
		startTime = process.hrtime();
		
        let file = new db.fileData({
            base64: buff.toString('base64'),
            createdAt: Date.now(),
            type: await fileType.fromBuffer(buffer).then(i => i.ext),
            id: `${id}`
        });

        await file.save();
	
		endTime = ((process.hrtime(startTime)[0] * 1e9) + process.hrtime(startTime)[1]) / 1e6;
		console.log(`File saved in ${endTime}ms`)
        bestDB[0].size++

        return `${file.id}${db.id}.${file.type}`;

    }
	
	/*
	 Simply to wait for the connection to all clusters to start kek
	*/

    finish() {
        return new Promise(async (resolve, reject) => {
            do {
                await wait(500)
            } while(!this.db)
            return resolve(true);
        })
    }

}